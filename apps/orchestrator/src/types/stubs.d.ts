declare module 'dockerode' {
  class Container {
    inspect(): Promise<Record<string, unknown>>;
    start(): Promise<void>;
    logs(options?: Record<string, unknown>): NodeJS.ReadableStream;
    remove(options?: Record<string, unknown>): Promise<void>;
  }

  export default class Docker {
    constructor(options?: Record<string, unknown>);
    createContainer(options: Record<string, unknown>): Promise<Container>;
    getContainer(id: string): Container;
  }
}

declare module '@kubernetes/client-node' {
  export class KubeConfig {
    loadFromDefault(): void;
    makeApiClient<T>(apiClass: new () => T): T;
  }

  export class CoreV1Api {
    createNamespacedSecret(namespace: string, body: unknown): Promise<unknown>;
    deleteNamespacedSecret(name: string, namespace: string): Promise<unknown>;
    patchNamespacedSecret(name: string, namespace: string, body: unknown): Promise<unknown>;
  }

  export class BatchV1Api {
    createNamespacedJob(namespace: string, body: unknown): Promise<unknown>;
    deleteNamespacedJob(name: string, namespace: string): Promise<unknown>;
    readNamespacedJobStatus(name: string, namespace: string): Promise<unknown>;
  }

  export interface V1Job {
    metadata?: Record<string, unknown>;
    spec?: V1JobSpec;
    status?: V1JobStatus;
  }

  export interface V1JobStatus {
    succeeded?: number;
    failed?: number;
    active?: number;
    conditions?: Array<{ type: string; status: string; reason?: string; message?: string }>;
  }

  export interface V1JobSpec {
    template?: V1PodTemplateSpec;
  }

  export interface V1PodTemplateSpec {
    spec?: Record<string, unknown>;
  }

  export interface V1Secret {
    metadata?: Record<string, unknown>;
    data?: Record<string, string>;
    type?: string;
  }
}
