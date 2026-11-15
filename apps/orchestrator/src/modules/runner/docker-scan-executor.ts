import type { DockerRunner } from './docker-driver.js';
import type { ScanExecutor } from './scan-executor.js';

/**
 * Docker implementation of ScanExecutor for local development.
 * Runs the scan-runner image in a Docker container.
 */
export class DockerScanExecutor implements ScanExecutor {
  constructor(private readonly docker: DockerRunner) {}

  async run(
    _jobName: string,
    scanId: string,
    _orgId: string,
    secretData: Record<string, string>,
  ): Promise<string> {
    // Merge secretData into container env
    const env = { ...secretData };
    const containerId = await this.docker.start(scanId, env);
    return containerId;
  }
}
