import { afterEach, describe, expect, it, vi } from 'vitest';
import { K8sClient } from '../src/modules/runner/k8s-client.js';
import { KubernetesScanExecutor } from '../src/modules/runner/kubernetes-scan-executor.js';

function mockK8s() {
  const createJob = vi
    .fn<(...args: never[]) => Promise<unknown>>()
    .mockResolvedValue({ metadata: { name: 'scan-1', uid: 'u1' } });
  const deleteSecret = vi.fn().mockResolvedValue(undefined);
  return {
    createSecret: vi.fn().mockResolvedValue(undefined),
    deleteSecret,
    patchSecret: vi.fn().mockResolvedValue(undefined),
    createJob,
    deleteJob: vi.fn().mockResolvedValue(undefined),
    runnerImage: 'test-image',
  } as unknown as K8sClient & {
    createJob: typeof createJob;
    deleteSecret: typeof deleteSecret;
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('KubernetesScanExecutor', () => {
  it('orchestrates secret → job → ownerRef patch', async () => {
    const k8s = mockK8s();
    const executor = new KubernetesScanExecutor(k8s);
    const result = await executor.run('scan-1', 's1', 'o1', { TOKEN: 'abc' });

    expect(result).toBe('scan-1');
    expect(k8s.createSecret).toHaveBeenCalledWith('scan-1', { TOKEN: 'abc' });
    expect(k8s.createJob).toHaveBeenCalledTimes(1);
    expect(k8s.patchSecret).toHaveBeenCalledWith('scan-1', {
      metadata: {
        ownerReferences: [{ apiVersion: 'batch/v1', kind: 'Job', name: 'scan-1', uid: 'u1' }],
      },
    });
  });

  it('deletes the secret when Job creation fails (architecture.md §7.2)', async () => {
    const k8s = mockK8s();
    (k8s.createJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const executor = new KubernetesScanExecutor(k8s as K8sClient);

    await expect(executor.run('scan-1', 's1', 'o1', { TOKEN: 'abc' })).rejects.toThrow('boom');
    expect(k8s.deleteSecret).toHaveBeenCalledWith('scan-1');
    expect(k8s.patchSecret).not.toHaveBeenCalled();
  });

  it('swallows secret cleanup errors and rethrows the original failure', async () => {
    const k8s = mockK8s();
    (k8s.createJob as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('job boom'));
    (k8s.deleteSecret as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('secret boom'));
    const executor = new KubernetesScanExecutor(k8s as K8sClient);

    await expect(executor.run('scan-1', 's1', 'o1', {})).rejects.toThrow('job boom');
  });
});
