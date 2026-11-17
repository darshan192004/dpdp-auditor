import { describe, expect, it, vi } from 'vitest';
import { JobWatcherService } from '../src/modules/runner/job-watcher.js';
import type { K8sClient } from '../src/modules/runner/k8s-client.js';

function makeK8s(status: unknown, reject?: unknown) {
  return {
    getJobStatus: reject ? vi.fn().mockRejectedValue(reject) : vi.fn().mockResolvedValue(status),
  } as unknown as K8sClient;
}

describe('JobWatcherService', () => {
  it('reports succeeded when job has succeeded count', async () => {
    const watcher = new JobWatcherService(makeK8s({ succeeded: 1 }));
    await expect(watcher.check('scan-1')).resolves.toEqual({ state: 'succeeded' });
  });

  it('reports active when job is still running', async () => {
    const watcher = new JobWatcherService(makeK8s({ active: 1 }));
    await expect(watcher.check('scan-1')).resolves.toEqual({ state: 'active' });
  });

  it('reports failed with DeadlineExceeded reason', async () => {
    const watcher = new JobWatcherService(
      makeK8s({
        failed: 1,
        conditions: [
          { type: 'Failed', status: 'True', reason: 'DeadlineExceeded', message: 'timed out' },
        ],
      }),
    );
    await expect(watcher.check('scan-1')).resolves.toEqual({
      state: 'failed',
      reason: 'DeadlineExceeded',
      message: 'timed out',
    });
  });

  it('reports not_found on 404', async () => {
    const watcher = new JobWatcherService(makeK8s(undefined, { code: 404 }));
    await expect(watcher.check('scan-1')).resolves.toEqual({ state: 'not_found' });
  });

  it('reports active when job status is null', async () => {
    const watcher = new JobWatcherService(makeK8s(null));
    await expect(watcher.check('scan-1')).resolves.toEqual({ state: 'active' });
  });

  it('reports failed with OOMKilled reason and no message', async () => {
    const watcher = new JobWatcherService(
      makeK8s({
        failed: 1,
        conditions: [{ type: 'Failed', status: 'True', reason: 'OOMKilled' }],
      }),
    );
    await expect(watcher.check('scan-1')).resolves.toEqual({
      state: 'failed',
      reason: 'OOMKilled',
    });
  });

  it('normalizes unknown failure reasons to Failed', async () => {
    const watcher = new JobWatcherService(
      makeK8s({
        failed: 1,
        conditions: [{ type: 'Failed', status: 'True', reason: 'SomethingElse', message: 'x' }],
      }),
    );
    await expect(watcher.check('scan-1')).resolves.toEqual({
      state: 'failed',
      reason: 'Failed',
      message: 'x',
    });
  });

  it('rethrows unknown errors', async () => {
    const watcher = new JobWatcherService(makeK8s(undefined, new Error('boom')));
    await expect(watcher.check('scan-1')).rejects.toThrow('boom');
  });
});
