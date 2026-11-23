import { describe, it, expect, vi } from 'vitest';
import { ReportsRepository } from '../src/modules/reports/reports.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { Prisma } from '@prisma/client';

function client() {
  return {
    report: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn().mockResolvedValue(3),
    },
  };
}

describe.each([false, true])('ReportsRepository (transaction: %s)', (transaction) => {
  it('scopes reads and quota counts to the organization on the selected client', async () => {
    const base = client();
    const tx = client();
    const selected = transaction ? tx : base;
    const repo = new ReportsRepository(base as unknown as PrismaService);
    const arg = transaction ? (tx as unknown as Prisma.TransactionClient) : undefined;
    await repo.findById('org', 'report', arg);
    expect(selected.report.findFirst).toHaveBeenCalledWith({
      where: { id: 'report', orgId: 'org' },
      include: { scan: { include: { repository: true } }, organization: true },
    });
    await repo.findByScanId('org', 'scan', arg);
    expect(selected.report.findFirst).toHaveBeenLastCalledWith({
      where: { scanId: 'scan', orgId: 'org' },
      orderBy: { createdAt: 'desc' },
    });
    const since = new Date('2026-11-01');
    expect(await repo.countCreatedSince('org', since, arg)).toBe(3);
    expect(selected.report.count).toHaveBeenCalledWith({
      where: { orgId: 'org', createdAt: { gte: since } },
    });
    if (transaction) expect(base.report.findFirst).not.toHaveBeenCalled();
  });
  it('persists lifecycle transitions and optional requester', async () => {
    const base = client();
    const tx = client();
    const selected = transaction ? tx : base;
    const repo = new ReportsRepository(base as unknown as PrismaService);
    const arg = transaction ? (tx as unknown as Prisma.TransactionClient) : undefined;
    for (const requestedBy of [null, 'user']) {
      await repo.create(
        { orgId: 'org', scanId: 'scan', templateVersion: 'standard', requestedBy },
        arg,
      );
      expect(selected.report.create).toHaveBeenLastCalledWith({
        data: {
          orgId: 'org',
          scanId: 'scan',
          templateVersion: 'standard',
          ...(requestedBy ? { requestedBy } : {}),
        },
      });
    }
    const metadata = { storageKey: 'key', sha256: 'hash', sizeBytes: 100n, expiresAt: new Date(0) };
    await repo.markComplete('report', metadata, arg);
    expect(selected.report.update).toHaveBeenLastCalledWith({
      where: { id: 'report' },
      data: { ...metadata, status: 'ready' },
    });
    await repo.markRendering('report', arg);
    expect(selected.report.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'report', status: { in: ['queued', 'rendering'] } },
      data: { status: 'rendering' },
    });
    await repo.markFailed('report', 'timeout', arg);
    expect(selected.report.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'report', status: { in: ['queued', 'rendering'] } },
      data: { status: 'failed', errorMessage: 'timeout' },
    });
    if (transaction) expect(base.report.update).not.toHaveBeenCalled();
  });
});

describe('report completion lock', () => {
  it('locks the tenant report in the caller transaction', async () => {
    const query = vi.fn();
    const repo = new ReportsRepository({} as PrismaService);
    await repo.lockForCompletion('org', 'report', {
      $queryRaw: query,
    } as unknown as Prisma.TransactionClient);
    expect(query).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('FROM reports WHERE id = ')]),
      'report',
      'org',
    );
  });
});

describe('atomic report reservation', () => {
  const input = {
    orgId: '11111111-1111-4111-8111-111111111111',
    scanId: '88888888-8888-4888-8888-888888888888',
    template: 'standard' as const,
    idempotencyKey: 'test-key-1234',
  };
  function setup() {
    const tx = {
      $queryRaw: vi.fn(),
      report: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(2),
        create: vi.fn().mockResolvedValue({ id: 'created' }),
      },
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    return { tx, repo: new ReportsRepository(prisma as unknown as PrismaService) };
  }
  it('locks the organization before checking quota and inserting with a unique idempotency key', async () => {
    const { tx, repo } = setup();
    expect(await repo.reserve(input, 3, new Date(0))).toEqual({ id: 'created' });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.report.count.mock.invocationCallOrder[0]!,
    );
    expect(tx.report.create).toHaveBeenCalledWith({
      data: {
        orgId: input.orgId,
        scanId: input.scanId,
        templateVersion: 'standard',
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
  it('rejects a full quota without inserting', async () => {
    const { tx, repo } = setup();
    tx.report.count.mockResolvedValue(3);
    await expect(repo.reserve(input, 3, new Date(0))).rejects.toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
    });
    expect(tx.report.create).not.toHaveBeenCalled();
  });
  it('replays a queued reservation before quota checks and rejects key reuse for another payload', async () => {
    const { tx, repo } = setup();
    const queued = {
      id: 'existing',
      scanId: input.scanId,
      templateVersion: 'standard',
      status: 'queued',
    };
    tx.report.findUnique.mockResolvedValue(queued);
    expect(await repo.reserve(input, 3, new Date(0))).toEqual(queued);
    expect(tx.report.count).not.toHaveBeenCalled();
    expect(tx.report.create).not.toHaveBeenCalled();
    await expect(
      repo.reserve({ ...input, template: 'executive' }, 3, new Date(0)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('reuses an active matching report for requests without an idempotency key', async () => {
    const { tx, repo } = setup();
    tx.report.findFirst.mockResolvedValue({ id: 'existing' });
    const { idempotencyKey: _key, ...withoutKey } = input;
    expect(await repo.reserve(withoutKey, null, new Date(0))).toEqual({ id: 'existing' });
    expect(tx.report.create).not.toHaveBeenCalled();
  });
});
