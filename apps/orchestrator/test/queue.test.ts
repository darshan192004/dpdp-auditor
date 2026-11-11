import { ServiceUnavailableException } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';
import { QueueService } from '../src/queue/queue.service.js';
import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_ATTEMPTS,
  QUEUE_NAMES,
  WORKER_SETTINGS,
  dlqName,
  queueBackoffStrategy,
  redisConnectionOptions,
} from '../src/queue/queues.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
};

describe('queue definitions', () => {
  it('names the three queues (tasks.md P1-18)', () => {
    expect(QUEUE_NAMES).toEqual(['scan.execute', 'report.render', 'retention']);
  });

  it('gives each queue a dead-letter companion', () => {
    expect(dlqName('scan.execute')).toBe('scan.execute.dlq');
    expect(dlqName('report.render')).toBe('report.render.dlq');
    expect(dlqName('retention')).toBe('retention.dlq');
  });

  it('pins 3 attempts with the custom backoff marker (architecture.md §10)', () => {
    expect(QUEUE_ATTEMPTS).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({ type: 'custom' });
    // architecture.md §12: Redis job TTL + 24 h.
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toEqual({ age: 24 * 60 * 60 * 1000 });
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toEqual({ age: 24 * 60 * 60 * 1000 });
  });

  it('follows the 30s / 2m / 10m backoff curve and stops after it', () => {
    expect(queueBackoffStrategy(1)).toBe(30_000);
    expect(queueBackoffStrategy(2)).toBe(120_000);
    expect(queueBackoffStrategy(3)).toBe(600_000);
    expect(queueBackoffStrategy(4)).toBe(-1); // -1 = BullMQ "stop retrying"
  });

  it('exposes the curve as Worker settings (P3-21 installs it)', () => {
    expect(WORKER_SETTINGS.backoffStrategy).toBe(queueBackoffStrategy);
  });

  it('configures fail-fast connections (architecture.md §10: 503 when Redis is down)', () => {
    expect(redisConnectionOptions(ENV)).toEqual({
      url: 'redis://127.0.0.1:6379',
      enableOfflineQueue: false,
    });
  });
});

describe('QueueService', () => {
  let service: QueueService | undefined;

  afterEach(async () => {
    await service?.onModuleDestroy();
    service = undefined;
    vi.restoreAllMocks();
  });

  it('creates queues lazily and reuses instances', () => {
    service = new QueueService(ENV);
    const first = service.queue('scan.execute');
    expect(service.queue('scan.execute')).toBe(first);
    expect(first.name).toBe('scan.execute');
    expect(first.opts.defaultJobOptions?.attempts).toBe(3);
    expect(first.opts.connection).toEqual({
      url: 'redis://127.0.0.1:6379',
      enableOfflineQueue: false,
    });
  });

  it('keeps DLQs separate from their business queues', () => {
    service = new QueueService(ENV);
    const dlq = service.dlq('retention');
    expect(dlq.name).toBe('retention.dlq');
    // Dead jobs are not retried and persist until the runbook drains them.
    expect(dlq.opts.defaultJobOptions).toBeUndefined();
    expect(dlq).not.toBe(service.queue('retention'));
  });

  it('maps connection failures to 503 UPSTREAM_UNAVAILABLE', async () => {
    service = new QueueService(ENV);
    vi.spyOn(service.queue('scan.execute'), 'add').mockRejectedValue(
      new Error('Connection is closed.'),
    );
    await expect(
      service.enqueue('scan.execute', 'execute', { scanId: 's1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rethrows non-connection failures unchanged', async () => {
    service = new QueueService(ENV);
    const boom = new Error('unexpected script failure');
    vi.spyOn(service.queue('scan.execute'), 'add').mockRejectedValue(boom);
    await expect(service.enqueue('scan.execute', 'execute', {})).rejects.toBe(boom);
  });

  it('copies an exhausted job to the DLQ and removes it from the source', async () => {
    service = new QueueService(ENV);
    const add = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(service, 'dlq').mockReturnValue({ add } as unknown as Queue);
    const remove = vi.fn().mockResolvedValue(true);
    const job = { id: 'job-1', name: 'execute', data: { scanId: 's1' }, remove } as unknown as Job;

    await service.moveToDlq('scan.execute', job, new Error('attempts exhausted'));

    expect(add).toHaveBeenCalledWith('execute', { scanId: 's1' }, { jobId: 'job-1' });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
