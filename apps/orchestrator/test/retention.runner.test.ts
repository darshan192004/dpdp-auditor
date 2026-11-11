import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';

vi.mock('bullmq', () => {
  class Worker {
    static instances: unknown[] = [];
    readonly close = vi.fn().mockResolvedValue(undefined);
    readonly handlers = new Map<string, (...args: never[]) => void>();
    constructor(
      readonly name: string,
      readonly processor: (job: unknown) => Promise<unknown>,
      readonly opts: Record<string, unknown>,
    ) {
      Worker.instances.push(this);
    }
    on(event: string, cb: (...args: never[]) => void): this {
      this.handlers.set(event, cb);
      return this;
    }
  }
  return { Worker };
});

import { Worker } from 'bullmq';
import { logger } from '../src/common/logger.js';
import { WORKER_SETTINGS } from '../src/queue/queues.js';
import {
  RETENTION_CRON,
  RETENTION_JOB_ID,
  RETENTION_JOB_NAME,
  RETENTION_QUEUE,
  RetentionRunner,
  createRetentionWorker,
  ensureRetentionSchedule,
} from '../src/modules/retention/retention.runner.js';
import type { RetentionService } from '../src/modules/retention/retention.service.js';
import type { QueueService } from '../src/queue/queue.service.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
};

/** Runtime shape of the mocked Worker (real bullmq types don't expose these). */
interface FakeWorker {
  name: string;
  processor: (job: unknown) => Promise<unknown>;
  opts: Record<string, unknown>;
  close: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: never[]) => void>;
}

function fakeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

function fakeQueues(queue = fakeQueue()) {
  return {
    queue: vi.fn().mockReturnValue(queue),
    moveToDlq: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueueService & {
    queue: ReturnType<typeof vi.fn>;
    moveToDlq: ReturnType<typeof vi.fn>;
  };
}

function fakeService() {
  return { run: vi.fn().mockResolvedValue({ markedExpired: 1 }) } as unknown as RetentionService & {
    run: ReturnType<typeof vi.fn>;
  };
}

function lastWorker(): FakeWorker {
  const instances = (Worker as unknown as { instances: unknown[] }).instances;
  const worker = instances.at(-1) as FakeWorker | undefined;
  if (!worker) throw new Error('no worker constructed');
  return worker;
}

function fire(worker: FakeWorker, event: string, ...args: unknown[]): void {
  const handler = worker.handlers.get(event);
  if (!handler) throw new Error(`no ${event} handler`);
  (handler as (...a: unknown[]) => void)(...args);
}

afterEach(() => {
  (Worker as unknown as { instances: unknown[] }).instances.length = 0;
  vi.restoreAllMocks();
});

describe('retention schedule', () => {
  it('registers the hourly repeatable job with a stable id', async () => {
    const queue = fakeQueue();
    await ensureRetentionSchedule(queue as never);
    expect(queue.add).toHaveBeenCalledWith(
      RETENTION_JOB_NAME,
      {},
      {
        repeat: { pattern: RETENTION_CRON },
        jobId: RETENTION_JOB_ID,
      },
    );
    expect(RETENTION_CRON).toBe('0 * * * *'); // "Runs hourly" — database.md §9
    expect(RETENTION_QUEUE).toBe('retention'); // tasks.md P1-18 queue list
  });
});

describe('createRetentionWorker', () => {
  it('runs the retention service on the retention queue with the shared worker settings', async () => {
    const service = fakeService();
    createRetentionWorker(ENV, service, fakeQueues());
    const worker = lastWorker();

    expect(worker.name).toBe('retention');
    expect(worker.opts.settings).toBe(WORKER_SETTINGS);
    expect(worker.opts.connection).toEqual({
      url: 'redis://127.0.0.1:6379',
      enableOfflineQueue: false,
    });

    await expect(worker.processor({})).resolves.toEqual({ markedExpired: 1 });
    expect(service.run).toHaveBeenCalledTimes(1);
  });

  it('dead-letters only after the final failed attempt', () => {
    const queues = fakeQueues();
    createRetentionWorker(ENV, fakeService(), queues);
    const worker = lastWorker();

    const early = { id: 'j1', attemptsMade: 2, opts: { attempts: 3 } };
    fire(worker, 'failed', early, new Error('boom'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();

    // job.js moveToFailed increments attemptsMade unconditionally after the
    // retry check; the final failure therefore reports attemptsMade === attempts.
    const final = { id: 'j2', attemptsMade: 3, opts: { attempts: 3 } };
    const error = new Error('attempts exhausted');
    fire(worker, 'failed', final, error);
    expect(queues.moveToDlq).toHaveBeenCalledTimes(1);
    expect(queues.moveToDlq).toHaveBeenCalledWith('retention', final, error);
  });

  it('ignores a failed event without a job and survives DLQ errors', async () => {
    const queues = fakeQueues();
    createRetentionWorker(ENV, fakeService(), queues);
    const worker = lastWorker();

    fire(worker, 'failed', undefined, new Error('no job'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();

    queues.moveToDlq.mockRejectedValueOnce(new Error('redis gone'));
    const job = { id: 'j3', attemptsMade: 3, opts: { attempts: 3 } };
    fire(worker, 'failed', job, new Error('boom'));
    await new Promise((resolve) => setImmediate(resolve)); // rejection is logged, not thrown
    expect(queues.moveToDlq).toHaveBeenCalledTimes(1);

    expect(() => fire(worker, 'error', new Error('connection reset'))).not.toThrow();
  });
});

describe('RetentionRunner', () => {
  it('starts once, schedules once, and closes the worker on shutdown', async () => {
    const queues = fakeQueues();
    const runner = new RetentionRunner(ENV, fakeService(), queues);

    await runner.start();
    await runner.start();
    expect((Worker as unknown as { instances: unknown[] }).instances).toHaveLength(1);
    expect(queues.queue).toHaveBeenCalledWith('retention');
    expect(queues.queue('retention').add).toHaveBeenCalledTimes(1);

    await runner.onApplicationShutdown();
    expect(lastWorker().close).toHaveBeenCalledTimes(1);
  });

  it('never leaves an unhandled rejection when scheduling fails', async () => {
    const queue = fakeQueue();
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    const runner = new RetentionRunner(ENV, fakeService(), fakeQueues(queue));
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    await expect(runner.start()).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    );
  });
});
