import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';

vi.mock('@kubernetes/client-node', () => {
  const coreCalls: unknown[] = [];
  const batchCalls: unknown[] = [];

  class CoreV1Api {
    constructor() {}
    createNamespacedSecret(...args: unknown[]) {
      coreCalls.push({ method: 'createNamespacedSecret', args });
      return Promise.resolve();
    }
    deleteNamespacedSecret(...args: unknown[]) {
      coreCalls.push({ method: 'deleteNamespacedSecret', args });
      return Promise.resolve();
    }
    patchNamespacedSecret(...args: unknown[]) {
      coreCalls.push({ method: 'patchNamespacedSecret', args });
      return Promise.resolve();
    }
  }

  class BatchV1Api {
    constructor() {}
    createNamespacedJob(...args: unknown[]) {
      batchCalls.push({ method: 'createNamespacedJob', args });
      return Promise.resolve({ body: { metadata: { name: 'scan-1' } } });
    }
    deleteNamespacedJob(...args: unknown[]) {
      batchCalls.push({ method: 'deleteNamespacedJob', args });
      return Promise.resolve();
    }
  }

  class KubeConfig {
    loadFromDefault() {}
    makeApiClient<T extends { new (...args: never[]): unknown }>(apiClientType: T) {
      return new apiClientType();
    }
  }

  return { KubeConfig, CoreV1Api, BatchV1Api, coreCalls, batchCalls };
});

import { K8sClient } from '../src/modules/runner/k8s-client.js';
// @ts-expect-error test-only mock internals exposed by the vi.mock factory
import { coreCalls, batchCalls } from '@kubernetes/client-node';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
  RUNNER_DRIVER: 'kubernetes',
  SCANNERS_NAMESPACE: 'scanners',
  RUNNER_IMAGE: 'registry.example.com/dpdpa/scan-runner@sha256:test',
};

afterEach(() => {
  (coreCalls as unknown[]).length = 0;
  (batchCalls as unknown[]).length = 0;
  vi.restoreAllMocks();
});

describe('K8sClient', () => {
  it('creates an Opaque secret with the given key/value pairs', async () => {
    const client = new K8sClient(ENV);
    await client.createSecret('scan-1', { TOKEN: 'abc' });

    expect(coreCalls).toHaveLength(1);
    expect(coreCalls[0]).toEqual({
      method: 'createNamespacedSecret',
      args: [
        {
          namespace: 'scanners',
          body: {
            metadata: { name: 'scan-1', namespace: 'scanners' },
            data: { TOKEN: 'abc' },
            type: 'Opaque',
          },
        },
      ],
    });
  });

  it('deletes a secret by name in the configured namespace', async () => {
    const client = new K8sClient(ENV);
    await client.deleteSecret('scan-1');

    expect(coreCalls).toHaveLength(1);
    expect(coreCalls[0]).toEqual({
      method: 'deleteNamespacedSecret',
      args: [{ name: 'scan-1', namespace: 'scanners' }],
    });
  });

  it('patches a secret with a merge-patch payload', async () => {
    const client = new K8sClient(ENV);
    await client.patchSecret('scan-1', {
      metadata: { ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'scan-1' }] },
    });

    expect(coreCalls).toHaveLength(1);
    expect(coreCalls[0]).toEqual({
      method: 'patchNamespacedSecret',
      args: [
        {
          name: 'scan-1',
          namespace: 'scanners',
          body: {
            metadata: {
              ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'scan-1' }],
            },
          },
        },
      ],
    });
  });

  it('creates a job and returns the resulting spec', async () => {
    const client = new K8sClient(ENV);
    const spec = { metadata: { name: 'scan-1' }, spec: { backoffLimit: 0 } };
    const result = await client.createJob(spec as never);

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toEqual({
      method: 'createNamespacedJob',
      args: [{ namespace: 'scanners', body: spec }],
    });
    expect(result).toEqual({ metadata: { name: 'scan-1' } });
  });

  it('deletes a job by name in the configured namespace', async () => {
    const client = new K8sClient(ENV);
    await client.deleteJob('scan-1');

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toEqual({
      method: 'deleteNamespacedJob',
      args: [{ name: 'scan-1', namespace: 'scanners' }],
    });
  });
});
