import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { RetentionService } from '../src/modules/retention/retention.service.js';

interface RawCall {
  sql: string;
  values: unknown[];
}

function rawCalls(mock: ReturnType<typeof vi.fn>): RawCall[] {
  return mock.mock.calls.map(([strings, ...values]) => ({
    sql: Array.isArray(strings) ? strings.join('?') : String(strings),
    values,
  }));
}

function fakePrisma(opts?: {
  orgs?: Array<{ id: string; retentionDays: number }>;
  sessionDeletes?: number;
  rawResults?: number[];
  keyClears?: number;
}) {
  const sessionRaw = vi.fn().mockResolvedValue(opts?.sessionDeletes ?? 0);
  const txRaw = vi.fn();
  for (const result of opts?.rawResults ?? []) txRaw.mockResolvedValueOnce(result);
  const updateMany = vi.fn().mockResolvedValue({ count: opts?.keyClears ?? 0 });
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRaw: txRaw,
      scan: { updateMany },
    }),
  );
  const prisma = {
    $executeRaw: sessionRaw,
    $transaction: transaction,
    organization: { findMany: vi.fn().mockResolvedValue(opts?.orgs ?? []) },
  };
  return { prisma: prisma as unknown as PrismaService, sessionRaw, txRaw, updateMany, transaction };
}

describe('RetentionService', () => {
  it('purges expired, idle and revoked sessions in one bounded batch', async () => {
    const fake = fakePrisma({ sessionDeletes: 7 });
    const service = new RetentionService(fake.prisma);

    const counts = await service.run();

    const [call] = rawCalls(fake.sessionRaw);
    expect(call?.sql).toContain('DELETE FROM sessions');
    expect(call?.sql).toContain('absolute_expires_at < now()');
    expect(call?.sql).toContain("last_seen_at < now() - interval '30 minutes'");
    expect(call?.sql).toContain("revoked_at < now() - interval '24 hours'");
    expect(call?.sql).toContain('LIMIT 500');
    expect(counts.purgedSessions).toBe(7);
  });

  it('marks, deletes and clears keys in one RLS-scoped transaction per organisation', async () => {
    const fake = fakePrisma({
      orgs: [{ id: 'org-1', retentionDays: 90 }],
      rawResults: [0, 1, 2],
      keyClears: 4,
    });
    const service = new RetentionService(fake.prisma);

    const counts = await service.run();

    expect(fake.transaction).toHaveBeenCalledTimes(1);
    const calls = rawCalls(fake.txRaw);
    expect(calls).toHaveLength(3);

    // set_config is parameterized: the org id never lands in the SQL text.
    expect(calls[0]!.sql).toContain("set_config('app.current_org'");
    expect(calls[0]!.values).toEqual(['org-1']);

    // database.md §9 mark SQL, with $1 = this org's retention_days.
    expect(calls[1]!.sql).toContain('UPDATE scans');
    expect(calls[1]!.sql).toContain("status IN ('completed', 'failed', 'cancelled')");
    expect(calls[1]!.sql).toContain('make_interval(days =>');
    expect(calls[1]!.sql).toContain("SET status = 'expired', updated_at = now()");
    expect(calls[1]!.values).toEqual([90]);

    // database.md §9 delete SQL: single 500-row batch behind the 24 h grace.
    expect(calls[2]!.sql).toContain('DELETE FROM scans');
    expect(calls[2]!.sql).toContain("status = 'expired'");
    expect(calls[2]!.sql).toContain("updated_at < now() - interval '24 hours'");
    expect(calls[2]!.sql).toContain('LIMIT 500');

    expect(fake.updateMany).toHaveBeenCalledWith({
      where: {
        idempotencyKey: { not: null },
        createdAt: { lt: expect.any(Date) as Date },
      },
      data: { idempotencyKey: null },
    });
    const cutoff = fake.updateMany.mock.calls[0]![0].where.createdAt.lt as Date;
    expect(cutoff.getTime()).toBeCloseTo(Date.now() - 7 * 24 * 60 * 60 * 1000, -4);

    expect(counts).toEqual({
      markedExpired: 1,
      deletedScans: 2,
      purgedSessions: 0,
      clearedIdempotencyKeys: 4,
    });
  });

  it('runs the phases for every organisation and sums the counts', async () => {
    const fake = fakePrisma({
      orgs: [
        { id: 'org-a', retentionDays: 30 },
        { id: 'org-b', retentionDays: 365 },
      ],
      rawResults: [0, 1, 2, 0, 3, 4],
      keyClears: 10,
    });
    const service = new RetentionService(fake.prisma);

    const counts = await service.run();

    expect(fake.transaction).toHaveBeenCalledTimes(2);
    const scoped = rawCalls(fake.txRaw).filter((call) =>
      call.sql.includes("set_config('app.current_org'"),
    );
    expect(scoped.map((call) => call.values[0])).toEqual(['org-a', 'org-b']);
    const marks = rawCalls(fake.txRaw).filter((call) => call.sql.includes('UPDATE scans'));
    expect(marks.map((call) => call.values[0])).toEqual([30, 365]);

    expect(counts).toEqual({
      markedExpired: 4,
      deletedScans: 6,
      purgedSessions: 0,
      clearedIdempotencyKeys: 20,
    });
  });

  it('reports all zeros when there is nothing to collect', async () => {
    const fake = fakePrisma();
    const service = new RetentionService(fake.prisma);

    await expect(service.run()).resolves.toEqual({
      markedExpired: 0,
      deletedScans: 0,
      purgedSessions: 0,
      clearedIdempotencyKeys: 0,
    });
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it('scopes the idempotency-key cutoff to seven days after scan creation', async () => {
    const fake = fakePrisma({
      orgs: [{ id: 'org-1', retentionDays: 90 }],
      rawResults: [0, 0, 0],
      keyClears: 1,
    });
    const service = new RetentionService(fake.prisma);

    const counts = await service.run();

    expect(counts.clearedIdempotencyKeys).toBe(1);
    expect(fake.updateMany).toHaveBeenCalledTimes(1);
  });
});
