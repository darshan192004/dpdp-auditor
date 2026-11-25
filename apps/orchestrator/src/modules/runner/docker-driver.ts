import Docker from 'dockerode';
import type { Env } from '../../config/env.js';

/**
 * Local-development runner driver (architecture.md §11). Runs the same
 * scan-runner image through Docker with no cluster.
 */
export class DockerRunner {
  private readonly docker: Docker;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.docker = new Docker({ socketPath: env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock' });
  }

  /** Start a container for the scan. Returns the container id. */
  async start(scanId: string, env: Record<string, string>): Promise<string> {
    const container = await this.docker.createContainer({
      Image: this.image,
      Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
      name: `scan-${scanId}`,
      HostConfig: {
        // Host networking is required to reach local services from the scan
        // container. On Docker Desktop this needs 4.34+, host networking
        // enabled, and Enhanced Container Isolation disabled (docs/architecture.md).
        NetworkMode: 'host',
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
    });
    await container.start();
    return (container as unknown as { id: string }).id;
  }

  /** Stop and remove the container for the scan. */
  async stop(scanId: string): Promise<void> {
    const container = this.docker.getContainer(`scan-${scanId}`);
    await (container as unknown as { stop: () => Promise<void> }).stop();
    await (container as unknown as { remove: () => Promise<void> }).remove();
  }

  private get image(): string {
    return this.env.RUNNER_IMAGE;
  }
}
