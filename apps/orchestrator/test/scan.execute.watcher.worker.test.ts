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
import { WORKER_SETTINGS } from '../src/queue/queues.js';
import {
  ScanExecuteWatcherRunner,
  createScanExecuteWatcherWorker,
  type ScanExecuteWatcherPayload,
} from '../src/modules/runner/scan.execute.watcher.worker.js';
import type { JobWatcherService } from '../src/modules/runner/job-watcher.js';
import type { QueueService } from '../src/queue/queue.service.js';
import type { ScansService } from '../src/modules/scans/scans.service.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  RUNNER_DRIVER: 'kubernetes',
  SCANNERS_NAMESPACE: 'scanners',
  RUNNER_IMAGE: 'registry.example.com/dpdpa/scan-runner@sha256:test',
};

interface FakeWorker {
  name: string;
  processor: (job: unknown) => Promise<unknown>;
  opts: Record<string, unknown>;
  close: ReturnType<typeof vi.fn>;
  handlers: Map<string, (...args: never[]) => void>;
}

function fakeWatcher() {
  return {
    check: vi.fn().mockResolvedValue({ state: 'succeeded' }),
  } as unknown as JobWatcherService & { check: ReturnType<typeof vi.fn> };
}

function fakeScans() {
  return {
    markJobSucceeded: vi.fn().mockResolvedValue(undefined),
    markJobFailed: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScansService & {
    markJobSucceeded: ReturnType<typeof vi.fn>;
    markJobFailed: ReturnType<typeof vi.fn>;
  };
}

function fakeQueues() {
  return {
    moveToDlq: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue(undefined),
  } as unknown as QueueService & {
    moveToDlq: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
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

describe('createScanExecuteWatcherWorker', () => {
  it('listens on the scan.execute.watcher queue', () => {
    createScanExecuteWatcherWorker(ENV, fakeWatcher(), fakeScans(), fakeQueues());
    const worker = lastWorker();
    expect(worker.name).toBe('scan.execute.watcher');
    expect(worker.opts.settings).toBe(WORKER_SETTINGS);
    expect(worker.opts.connection).toEqual({
      url: 'redis://127.0.0.1:6379',
      enableOfflineQueue: false,
    });
  });

  it('calls markJobSucceeded when the job succeeds', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({ state: 'succeeded' });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's1',
      orgId: 'o1',
      jobName: 'scan-s1',
      secretName: 'secret-s1',
    };
    await worker.processor({ data: payload } as never);
    expect(scans.markJobSucceeded).toHaveBeenCalledWith('s1', 'o1', 'secret-s1');
  });

  it('calls markJobFailed with reason when the job fails', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'failed',
      reason: 'OOMKilled',
      message: 'Container exceeded memory limit',
    });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's2',
      orgId: 'o1',
      jobName: 'scan-s2',
      secretName: 'secret-s2',
    };
    await worker.processor({ data: payload } as never);
    expect(scans.markJobFailed).toHaveBeenCalledWith(
      's2',
      'o1',
      'OOMKilled',
      'Container exceeded memory limit',
      'secret-s2',
    );
  });

  it('calls markJobFailed with default message when failed outcome has no message', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: 'failed',
      reason: 'DeadlineExceeded',
    });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's3',
      orgId: 'o1',
      jobName: 'scan-s3',
      secretName: 'secret-s3',
    };
    await worker.processor({ data: payload } as never);
    expect(scans.markJobFailed).toHaveBeenCalledWith(
      's3',
      'o1',
      'DeadlineExceeded',
      'Job failed.',
      'secret-s3',
    );
  });

  it('calls markJobFailed with INCOMPLETE_RESULTS when job is not found', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({ state: 'not_found' });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's4',
      orgId: 'o1',
      jobName: 'scan-s4',
      secretName: 'secret-s4',
    };
    await worker.processor({ data: payload } as never);
    expect(scans.markJobFailed).toHaveBeenCalledWith(
      's4',
      'o1',
      'INCOMPLETE_RESULTS',
      'Job not found; callback may have been lost.',
      'secret-s4',
    );
  });

  it('re-enqueues the watcher with a 5s delay when the job is still active', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({ state: 'active' });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's5',
      orgId: 'o1',
      jobName: 'scan-s5',
      secretName: 'secret-s5',
    };
    await worker.processor({ data: payload } as never);
    expect(queues.enqueue).toHaveBeenCalledWith(
      'scan.execute.watcher',
      'watch',
      { scanId: 's5', orgId: 'o1', jobName: 'scan-s5', secretName: 'secret-s5' },
      { delay: 5000 },
    );
  });

  it('throws an error for unknown outcome states', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    (watcher.check as ReturnType<typeof vi.fn>).mockResolvedValue({ state: 'unknown' });

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's6',
      orgId: 'o1',
      jobName: 'scan-s6',
      secretName: 'secret-s6',
    };
    await expect(worker.processor({ data: payload } as never)).rejects.toThrow(
      'unexpected watcher outcome unknown',
    );
  });

  it('throws when watcher.check fails', async () => {
    const watcher = fakeWatcher();
    const scans = fakeScans();
    const queues = fakeQueues();
    const err = new Error('API error');
    (watcher.check as ReturnType<typeof vi.fn>).mockRejectedValue(err);

    createScanExecuteWatcherWorker(ENV, watcher, scans, queues);
    const worker = lastWorker();

    const payload: ScanExecuteWatcherPayload = {
      scanId: 's7',
      orgId: 'o1',
      jobName: 'scan-s7',
      secretName: 'secret-s7',
    };
    await expect(worker.processor({ data: payload } as never)).rejects.toThrow('API error');
  });

  it('dead-letters only after the final failed attempt', () => {
    const queues = fakeQueues();
    createScanExecuteWatcherWorker(ENV, fakeWatcher(), fakeScans(), queues);
    const worker = lastWorker();

    const early = { id: 'j1', attemptsMade: 2, opts: { attempts: 3 } };
    fire(worker, 'failed', early, new Error('boom'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();

    const final = { id: 'j2', attemptsMade: 3, opts: { attempts: 3 } };
    const error = new Error('attempts exhausted');
    fire(worker, 'failed', final, error);
    expect(queues.moveToDlq).toHaveBeenCalledTimes(1);
    expect(queues.moveToDlq).toHaveBeenCalledWith('scan.execute.watcher', final, error);
  });

  it('ignores a failed event without a job and survives DLQ errors', async () => {
    const queues = fakeQueues();
    createScanExecuteWatcherWorker(ENV, fakeWatcher(), fakeScans(), queues);
    const worker = lastWorker();

    fire(worker, 'failed', undefined, new Error('no job'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();

    queues.moveToDlq.mockRejectedValueOnce(new Error('redis gone'));
    const job = { id: 'j3', attemptsMade: 3, opts: { attempts: 3 } };
    fire(worker, 'failed', job, new Error('boom'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(queues.moveToDlq).toHaveBeenCalledTimes(1);

    expect(() => fire(worker, 'error', new Error('connection reset'))).not.toThrow();
  });

  it('ignores failed events before all attempts are exhausted', () => {
    const queues = fakeQueues();
    createScanExecuteWatcherWorker(ENV, fakeWatcher(), fakeScans(), queues);
    const worker = lastWorker();

    const early = { id: 'j1', attemptsMade: 1, opts: { attempts: 3 } };
    fire(worker, 'failed', early, new Error('transient'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();
  });
});

describe('ScanExecuteWatcherRunner', () => {
  it('starts once and closes the worker on shutdown', async () => {
    const queues = fakeQueues();
    const runner = new ScanExecuteWatcherRunner(ENV, fakeWatcher(), fakeScans(), queues);

    await runner.start();
    await runner.start();
    expect((Worker as unknown as { instances: unknown[] }).instances).toHaveLength(1);

    await runner.onApplicationShutdown();
    expect(lastWorker().close).toHaveBeenCalledTimes(1);
  });
});
