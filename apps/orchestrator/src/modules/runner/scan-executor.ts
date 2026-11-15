/**
 * Common interface for scan executors. Backed by either Kubernetes
 * (KubernetesScanExecutor) or local Docker (DockerScanExecutor).
 */
export interface ScanExecutor {
  /**
   * Initiate a scan run.
   * @returns job/container identifier
   */
  run(
    jobName: string,
    scanId: string,
    orgId: string,
    secretData: Record<string, string>,
  ): Promise<string>;
}

/** Nest DI token for the executor; `runner.module` selects the implementation. */
export const SCAN_EXECUTOR = Symbol('ScanExecutor');
