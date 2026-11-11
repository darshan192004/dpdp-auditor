import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import type { Env } from '../../src/config/env.js';
import { QueueService } from '../../src/queue/queue.service.js';
import { RetentionService } from '../../src/modules/retention/retention.service.js';
import {
  createRetentionWorker,
  ensureRetentionSchedule,
} from '../../src/modules/retention/retention.runner.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { describeDb, dbUrl } from './helpers/db.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const redisUrl = process.env.REDIS_TEST_URL || null;
// Schedule/worker phases need Redis on top of the database.
const redisIt = redisUrl ? it : it.skip;

describeDb('retention job (database.md §9)', () => {
  const owner = new PrismaClient({ datasourceUrl: dbUrl! });
  let runtime: PrismaClient;
  let service: RetentionService;
  let orgId: string;
  let userId: string;
  let repoId: string;
  let oldScanId: string;
  let expiredScanId: string;
  let freshScanId: string;
  let keyScanId: string;
  let freshKeyScanId: string;
  let findingId: string;
  const sessionIds: string[] = [];
  let keepSessionId: string;

  beforeAll(async () => {
    // Literal-only template: Prisma parameterizes interpolations and
    // PostgreSQL rejects parameters in DDL (ALTER ROLE), so no ${} here.
    await owner.$executeRaw`ALTER ROLE dpdpa_runtime PASSWORD 'test-only-runtime-password'`;
    const url = new URL(dbUrl!);
    url.username = 'dpdpa_runtime';
    url.password = 'test-only-runtime-password';
    runtime = new PrismaClient({ datasourceUrl: url.toString() });
    // The whole point: NOBYPASSRLS role — every phase must work through the
    // per-org set_config path or it affects 0 rows.
    service = new RetentionService(runtime as unknown as PrismaService);

    const org = await owner.organization.create({
      data: { name: 'Retention Org', slug: `retention-${Date.now()}`, retentionDays: 90 },
    });
    orgId = org.id;
    const user = await owner.user.create({
      data: { email: `retention-${Date.now()}@test.local` },
    });
    userId = user.id;
    const repo = await owner.repository.create({
      data: {
        orgId,
        owner: 'acme',
        name: 'retention-repo',
        fullName: `acme/retention-${Date.now()}`,
      },
    });
    repoId = repo.id;

    // 91 days old (> retention): marked expired this run, deleted only after
    // the 24h updated_at bump — so it must SURVIVE run 1 as 'expired'.
    oldScanId = (
      await owner.scan.create({
        data: {
          orgId,
          repositoryId: repoId,
          status: 'completed',
          completedAt: new Date(Date.now() - 91 * DAY),
        },
      })
    ).id;
    // Already expired with updated_at > 24h ago: deleted in run 1.
    expiredScanId = (
      await owner.scan.create({
        data: {
          orgId,
          repositoryId: repoId,
          status: 'expired',
          updatedAt: new Date(Date.now() - 25 * HOUR),
        },
      })
    ).id;
    findingId = (
      await owner.scannerFinding.create({
        data: {
          scanId: expiredScanId,
          orgId,
          scanner: 'gitleaks',
          scannerRuleId: 'retention-cascade',
          severity: 'high',
          message: 'dies with its scan',
          fingerprint: `retention-${Date.now()}`,
        },
      })
    ).id;
    // Recent scan: untouched by mark.
    freshScanId = (
      await owner.scan.create({
        data: {
          orgId,
          repositoryId: repoId,
          status: 'completed',
          completedAt: new Date(Date.now() - 10 * DAY),
        },
      })
    ).id;
    // Key older than 7 days: nulled. Fresh key: kept.
    keyScanId = (
      await owner.scan.create({
        data: {
          orgId,
          repositoryId: repoId,
          status: 'queued',
          idempotencyKey: 'stale-key',
          createdAt: new Date(Date.now() - 8 * DAY),
        },
      })
    ).id;
    freshKeyScanId = (
      await owner.scan.create({
        data: { orgId, repositoryId: repoId, status: 'queued', idempotencyKey: 'fresh-key' },
      })
    ).id;

    // Three purgeable sessions (expired / idle / revoked) + one live control.
    for (const data of [
      { absoluteExpiresAt: new Date(Date.now() - HOUR), lastSeenAt: new Date() },
      {
        absoluteExpiresAt: new Date(Date.now() + 30 * DAY),
        lastSeenAt: new Date(Date.now() - (31 * HOUR) / 60), // 31 min ago
      },
      {
        absoluteExpiresAt: new Date(Date.now() + 30 * DAY),
        lastSeenAt: new Date(),
        revokedAt: new Date(Date.now() - 25 * HOUR),
      },
    ]) {
      const session = await owner.session.create({ data: { userId, ...data } });
      sessionIds.push(session.id);
    }
    keepSessionId = (
      await owner.session.create({
        data: {
          userId,
          absoluteExpiresAt: new Date(Date.now() + 30 * DAY),
          lastSeenAt: new Date(),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await owner.scan.deleteMany({ where: { orgId } }); // findings cascade
    await owner.session.deleteMany({ where: { userId } });
    await owner.repository.deleteMany({ where: { orgId } });
    await owner.user.delete({ where: { id: userId } });
    await owner.organization.delete({ where: { id: orgId } });
    await runtime.$disconnect();
    await owner.$disconnect();
  });

  it('fails closed: the runtime role sees no scans without org context', async () => {
    expect(await runtime.scan.findMany({ where: { orgId } })).toEqual([]);
  });

  it('marks, deletes (cascade), purges sessions and nulls keys in one pass', async () => {
    const counts = await service.run();

    // Mark: past retention → expired, but kept until the 24h bump.
    const oldScan = await owner.scan.findUnique({ where: { id: oldScanId } });
    expect(oldScan?.status).toBe('expired');
    expect(counts.markedExpired).toBeGreaterThanOrEqual(1);

    // Delete: expired > 24h → gone with its finding (cascade).
    expect(await owner.scan.findUnique({ where: { id: expiredScanId } })).toBeNull();
    expect(await owner.scannerFinding.findUnique({ where: { id: findingId } })).toBeNull();
    expect(counts.deletedScans).toBeGreaterThanOrEqual(1);

    // Recent scan untouched.
    expect((await owner.scan.findUnique({ where: { id: freshScanId } }))?.status).toBe('completed');

    // Sessions: three purgeable gone, live control kept.
    for (const id of sessionIds) {
      expect(await owner.session.findUnique({ where: { id } })).toBeNull();
    }
    expect(await owner.session.findUnique({ where: { id: keepSessionId } })).not.toBeNull();
    expect(counts.purgedSessions).toBeGreaterThanOrEqual(3);

    // Idempotency keys: >7d nulled, fresh kept.
    expect((await owner.scan.findUnique({ where: { id: keyScanId } }))?.idempotencyKey).toBeNull();
    expect((await owner.scan.findUnique({ where: { id: freshKeyScanId } }))?.idempotencyKey).toBe(
      'fresh-key',
    );
    expect(counts.clearedIdempotencyKeys).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent: a second pass affects nothing', async () => {
    const counts = await service.run();
    expect(counts).toEqual({
      markedExpired: 0,
      deletedScans: 0,
      purgedSessions: 0,
      clearedIdempotencyKeys: 0,
    });
    // The just-marked scan has updated_at = now → not deleted before 24h.
    expect(await owner.scan.findUnique({ where: { id: oldScanId } })).not.toBeNull();
  });

  redisIt('schedule: ensureRetentionSchedule twice yields one repeatable job', async () => {
    const queue = new Queue('retention', { connection: { url: redisUrl! } });
    try {
      await ensureRetentionSchedule(queue);
      await ensureRetentionSchedule(queue);
      const repeatables = (await queue.getRepeatableJobs()).filter((r) => r.name === 'run');
      expect(repeatables).toHaveLength(1);
      expect(repeatables[0]?.pattern).toBe('0 * * * *');
    } finally {
      const repeatables = await queue.getRepeatableJobs();
      for (const r of repeatables) await queue.removeRepeatableByKey(r.key);
      await queue.close();
    }
  });

  redisIt('worker: a manual job runs the retention pass end-to-end', async () => {
    const env: Env = {
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
      REDIS_URL: redisUrl!,
      ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
      ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
    };
    const queues = new QueueService(env);
    const worker = createRetentionWorker(env, service, queues);
    try {
      await worker.waitUntilReady();
      // Fresh scan past retention: only the worker's run() can mark it.
      const scanId = (
        await owner.scan.create({
          data: {
            orgId,
            repositoryId: repoId,
            status: 'completed',
            completedAt: new Date(Date.now() - 91 * DAY),
          },
        })
      ).id;

      const job = await queues.queue('retention').add(
        'run',
        {},
        {
          jobId: `retention-e2e-${Date.now()}`,
        },
      );
      await vi.waitFor(
        async () => {
          expect(await job.getState()).toBe('completed');
        },
        { timeout: 20_000, interval: 250 },
      );

      expect((await owner.scan.findUnique({ where: { id: scanId } }))?.status).toBe('expired');
      await owner.scan.delete({ where: { id: scanId } });
    } finally {
      await worker.close();
      await queues.onModuleDestroy();
    }
  });
});
