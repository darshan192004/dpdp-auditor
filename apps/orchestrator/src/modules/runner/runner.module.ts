import { Module, type Provider } from '@nestjs/common';
import { ENV, type Env } from '../../config/env.js';
import { DockerRunner } from './docker-driver.js';
import { DockerScanExecutor } from './docker-scan-executor.js';
import { JobWatcherService } from './job-watcher.js';
import { K8sClient } from './k8s-client.js';
import { KubernetesScanExecutor } from './kubernetes-scan-executor.js';
import { SCAN_EXECUTOR, type ScanExecutor } from './scan-executor.js';
import { ScanExecuteRunner } from './scan.execute.worker.js';

/**
 * Runner module (architecture.md §11). Selects the runner driver by
 * `RUNNER_DRIVER`: `kubernetes` creates a Job in the `scanners` namespace;
 * `docker` runs the same image locally for development.
 */
const RUNNER_PROVIDERS: Provider[] = [
  {
    provide: K8sClient,
    useFactory: (env: Env) => new K8sClient(env),
    inject: [ENV],
  },
  {
    provide: DockerRunner,
    useFactory: (env: Env) => new DockerRunner(env),
    inject: [ENV],
  },
  {
    provide: SCAN_EXECUTOR,
    useFactory: (k8s: K8sClient, docker: DockerRunner, env: Env): ScanExecutor =>
      env.RUNNER_DRIVER === 'docker'
        ? new DockerScanExecutor(docker)
        : new KubernetesScanExecutor(k8s),
    inject: [K8sClient, DockerRunner, ENV],
  },
  ScanExecuteRunner,
  JobWatcherService,
];

@Module({
  providers: RUNNER_PROVIDERS,
  exports: [ScanExecuteRunner, JobWatcherService],
})
export class RunnerModule {}
