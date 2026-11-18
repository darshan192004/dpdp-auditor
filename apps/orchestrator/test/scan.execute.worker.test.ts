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
  ScanExecuteRunner,
  createScanExecuteWorker,
  type ScanExecutePayload,
} from '../src/modules/runner/scan.execute.worker.js';
import type { ScanExecutor } from '../src/modules/runner/scan-executor.js';
import type { QueueService } from '../src/queue/queue.service.js';
import type { ScansRepository } from '../src/modules/scans/scans.repository.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  ORCHESTRATOR_CALLBACK_URL: 'http://localhost:3001',
  DOCKER_SOCKET_PATH: '/var/run/docker.sock',
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

function fakeExecutor() {
  return {
    run: vi.fn().mockResolvedValue('scan-s1'),
  } as unknown as ScanExecutor & { run: ReturnType<typeof vi.fn> };
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

function fakeScansRepository() {
  return {
    setJobInfo: vi.fn().mockResolvedValue(undefined),
  } as unknown as ScansRepository & { setJobInfo: ReturnType<typeof vi.fn> };
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

describe('createScanExecuteWorker', () => {
  it('runs on the scan.execute queue with the shared worker settings', async () => {
    const executor = fakeExecutor();
    const queues = fakeQueues();
    const scans = fakeScansRepository();
    createScanExecuteWorker(ENV, executor, queues, scans);
    const worker = lastWorker();

    expect(worker.name).toBe('scan.execute');
    expect(worker.opts.settings).toBe(WORKER_SETTINGS);
    expect(worker.opts.connection).toEqual({
      url: 'redis://127.0.0.1:6379',
      enableOfflineQueue: false,
    });

    const payload: ScanExecutePayload = {
      scanId: 's1',
      orgId: 'o1',
      repoUrl: 'https://github.com/org/repo',
      ref: 'main',
      profile: 'standard',
    };
    const job = { data: payload };
    await expect(worker.processor(job as never)).resolves.toBeUndefined();
    expect(executor.run).toHaveBeenCalledWith('scan-s1', 's1', 'o1', {
      SCAN_ID: 's1',
      ORG_ID: 'o1',
      ORCHESTRATOR_URL: 'http://localhost:3001',
      CALLBACK_HMAC_KEY: 'a'.repeat(32),
      INTERNAL_KEY: 'b'.repeat(32),
      REPO_URL: 'https://github.com/org/repo',
      REPO_REF: 'main',
      WORKSPACE: '/workspace',
      PROFILE: 'standard',
    });
    // P3-16: persist Job/Secret correlation, then hand off to the watcher queue.
    expect(scans.setJobInfo).toHaveBeenCalledWith('s1', 'scan-s1', 'scan-s1');
    expect(queues.enqueue).toHaveBeenCalledWith('scan.execute.watcher', 'watch', {
      scanId: 's1',
      orgId: 'o1',
      jobName: 'scan-s1',
      secretName: 'scan-s1',
    });
  });

  it('does not enqueue a Kubernetes watcher when the Docker driver is selected', async () => {
    const queues = fakeQueues();
    const scans = fakeScansRepository();
    createScanExecuteWorker({ ...ENV, RUNNER_DRIVER: 'docker' }, fakeExecutor(), queues, scans);
    const worker = lastWorker();

    await worker.processor({
      data: {
        scanId: 's1',
        orgId: 'o1',
        repoUrl: 'https://github.com/org/repo',
        ref: 'main',
        profile: 'standard',
      },
    } as never);

    expect(queues.enqueue).not.toHaveBeenCalled();
    expect(scans.setJobInfo).toHaveBeenCalledWith('s1', 'scan-s1', 'scan-s1');
  });

  it('dead-letters only after the final failed attempt', () => {
    const queues = fakeQueues();
    createScanExecuteWorker(ENV, fakeExecutor(), queues, fakeScansRepository());
    const worker = lastWorker();

    const early = { id: 'j1', attemptsMade: 2, opts: { attempts: 3 } };
    fire(worker, 'failed', early, new Error('boom'));
    expect(queues.moveToDlq).not.toHaveBeenCalled();

    const final = { id: 'j2', attemptsMade: 3, opts: { attempts: 3 } };
    const error = new Error('attempts exhausted');
    fire(worker, 'failed', final, error);
    expect(queues.moveToDlq).toHaveBeenCalledTimes(1);
    expect(queues.moveToDlq).toHaveBeenCalledWith('scan.execute', final, error);
  });

  it('ignores a failed event without a job and survives DLQ errors', async () => {
    const queues = fakeQueues();
    createScanExecuteWorker(ENV, fakeExecutor(), queues, fakeScansRepository());
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
});

describe('ScanExecuteRunner', () => {
  it('starts once and closes the worker on shutdown', async () => {
    const queues = fakeQueues();
    const runner = new ScanExecuteRunner(ENV, fakeExecutor(), queues, fakeScansRepository());

    await runner.start();
    await runner.start();
    expect((Worker as unknown as { instances: unknown[] }).instances).toHaveLength(1);

    await runner.onApplicationShutdown();
    expect(lastWorker().close).toHaveBeenCalledTimes(1);
  });
});

describe('scan.execute.worker error handling', () => {
  it('logs but continues when setJobInfo fails', async () => {
    const executor = fakeExecutor();
    const queues = fakeQueues();
    const scans = fakeScansRepository();
    (scans.setJobInfo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    createScanExecuteWorker(ENV, executor, queues, scans);
    const worker = lastWorker();

    const payload: ScanExecutePayload = {
      scanId: 's1',
      orgId: 'o1',
      repoUrl: 'https://github.com/org/repo',
      ref: 'main',
      profile: 'standard',
    };
    await expect(worker.processor({ data: payload } as never)).resolves.toBeUndefined();
    expect(queues.enqueue).toHaveBeenCalled();
  });

  it('logs but continues when enqueue fails', async () => {
    const executor = fakeExecutor();
    const queues = fakeQueues();
    const scans = fakeScansRepository();
    (queues.enqueue as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('redis down'));

    createScanExecuteWorker(ENV, executor, queues, scans);
    const worker = lastWorker();

    const payload: ScanExecutePayload = {
      scanId: 's1',
      orgId: 'o1',
      repoUrl: 'https://github.com/org/repo',
      ref: 'main',
      profile: 'standard',
    };
    await expect(worker.processor({ data: payload } as never)).resolves.toBeUndefined();
    expect(scans.setJobInfo).toHaveBeenCalled();
  });
});
