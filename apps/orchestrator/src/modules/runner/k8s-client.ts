import { KubeConfig, CoreV1Api, BatchV1Api } from '@kubernetes/client-node';
import type { V1Secret, V1Job, V1JobStatus } from '@kubernetes/client-node';
import type { Env } from '../../config/env.js';

/**
 * Minimal wrapper around the Kubernetes client. It exposes only the
 * operations the scan runner needs (architecture.md §7.2):
 *   Secret → Job, with ownerReference patching and cleanup on failure.
 *
 * The client loads the default kubeconfig, which falls back to in-cluster
 * service-account credentials when `KUBERNETES_SERVICE_HOST` is set.
 */
export class K8sClient {
  private readonly core: CoreV1Api;
  private readonly batch: BatchV1Api;
  private readonly namespace: string;
  public readonly runnerImage: string;

  constructor(env: Env) {
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault();
    this.core = kubeConfig.makeApiClient(CoreV1Api);
    this.batch = kubeConfig.makeApiClient(BatchV1Api);
    this.namespace = env.SCANNERS_NAMESPACE;
    this.runnerImage = env.RUNNER_IMAGE;
  }

  /** Create an Opaque secret holding the key/value pairs for the scan. */
  async createSecret(name: string, data: Record<string, string>): Promise<void> {
    const body: V1Secret = {
      metadata: { name, namespace: this.namespace },
      data,
      type: 'Opaque',
    };
    await this.core.createNamespacedSecret(this.namespace, body);
  }

  /** Delete a secret by name. */
  async deleteSecret(name: string): Promise<void> {
    await this.core.deleteNamespacedSecret(name, this.namespace);
  }

  /**
   * Patch a secret with a merge-patch payload. Used to attach an
   * `ownerReference` to the Job after creation (architecture.md §7.2).
   */
  async patchSecret(name: string, patch: Record<string, unknown>): Promise<void> {
    await this.core.patchNamespacedSecret(name, this.namespace, patch);
  }

  /** Create a job from the specification. */
  async createJob(spec: V1Job): Promise<V1Job> {
    const res = (await this.batch.createNamespacedJob(this.namespace, spec)) as unknown as {
      body: V1Job;
    };
    return res.body;
  }

  /** Delete a job by name. */
  async deleteJob(name: string): Promise<void> {
    await this.batch.deleteNamespacedJob(name, this.namespace);
  }

  /** Read a job's status (P3-16 watcher). */
  async getJobStatus(name: string): Promise<V1JobStatus | undefined> {
    const res = (await this.batch.readNamespacedJobStatus(name, this.namespace)) as unknown as {
      body: V1Job;
    };
    return res.body?.status;
  }
}
