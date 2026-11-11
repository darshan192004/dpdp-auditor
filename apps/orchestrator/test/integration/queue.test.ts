import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../../src/config/env.js';
import { QueueService } from '../../src/queue/queue.service.js';

const redisUrl = process.env.REDIS_TEST_URL || null;

(redisUrl ? describe : describe.skip)('queue module', () => {
  let service: QueueService;

  beforeAll(() => {
    const env: Env = {
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
      REDIS_URL: redisUrl!,
      ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
      ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
    };
    service = new QueueService(env);
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('enqueues with the shared retry policy and dedupes by jobId (ADR-007)', async () => {
    const queue = service.queue('scan.execute');
    await queue.waitUntilReady();
    const jobId = `scan-${Date.now()}`;

    const job = await queue.add('execute', { scanId: jobId }, { jobId });
    expect(job.opts.attempts).toBe(3);
    expect(job.opts.backoff).toEqual({ type: 'custom' });

    // Same jobId again: BullMQ keeps exactly one job — per-scan idempotent enqueue.
    const duplicate = await queue.add('execute', { scanId: jobId }, { jobId });
    expect(duplicate.id).toBe(job.id);
    const counts = await queue.getJobCounts('waiting', 'delayed', 'completed', 'failed');
    const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
    expect(total).toBe(1);

    await job.remove();
  });

  it('moves an exhausted job to its DLQ and clears it from the source queue', async () => {
    const source = service.queue('retention');
    await source.waitUntilReady();
    const jobId = `retention-${Date.now()}`;
    const job = await source.add('purge', { batch: 1 }, { jobId });

    await service.moveToDlq('retention', job, new Error('attempts exhausted'));

    const dead = await service.dlq('retention').getJob(jobId);
    expect(dead).toBeDefined();
    expect(dead?.name).toBe('purge');
    expect(dead?.data).toEqual({ batch: 1 });
    expect(await source.getJob(jobId)).toBeUndefined();

    await dead?.remove();
  });
});
