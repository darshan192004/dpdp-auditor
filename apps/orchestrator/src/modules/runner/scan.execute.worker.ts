import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
// Value (not `type`) imports: `emitDecoratorMetadata` needs runtime refs for
// Nest to resolve these constructor params in ScanExecuteRunner.
import { QueueService } from '../../queue/queue.service.js';
import { SCAN_EXECUTOR, type ScanExecutor } from './scan-executor.js';
import { ScansRepository } from '../scans/scans.repository.js';

export const SCAN_EXECUTE_QUEUE: QueueName = 'scan.execute';
export const SCAN_EXECUTE_WATCHER_QUEUE: QueueName = 'scan.execute.watcher';

const TIMEOUT_KEYS = [
  'TIMEOUT_CLONE',
  'TIMEOUT_SEMGREP',
  'TIMEOUT_CHECKOV',
  'TIMEOUT_GITLEAKS',
] as const;

/** Pass through only the timeouts explicitly configured for this environment. */
function runnerTimeoutEnv(env: Env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of TIMEOUT_KEYS) {
    const value = env[key];
    if (value !== undefined) result[key] = String(value);
  }
  return result;
}

export interface ScanExecutePayload {
  scanId: string;
  orgId: string;
  repoUrl: string;
  ref: string;
  profile: 'standard' | 'secrets-only';
}

/**
 * Worker for the `scan.execute` queue (architecture.md §7.2): creates the scan
 * Secret → Job, then patches the ownerReference. 3 attempts on the shared
 * 30s/2m/10m curve (WORKER_SETTINGS), then dead-lettered.
 */
export function createScanExecuteWorker(
  env: Env,
  executor: ScanExecutor,
  queues: QueueService,
  scans: ScansRepository,
): Worker {
  const worker = new Worker(
    SCAN_EXECUTE_QUEUE,
    async (job: Job<ScanExecutePayload>) => {
      const { scanId, orgId, repoUrl, ref, profile } = job.data;
      logger.info({ scanId, repoUrl, ref }, 'starting scan execution');
      const jobName = `scan-${scanId}`;
      // The runner is an untrusted workload: it receives only the secrets it
      // needs to sign callbacks, never database or queue credentials.
      const secretData = {
        SCAN_ID: scanId,
        ORG_ID: orgId,
        ORCHESTRATOR_URL: env.ORCHESTRATOR_CALLBACK_URL ?? 'http://orchestrator:3001',
        CALLBACK_HMAC_KEY: env.ORCHESTRATOR_HMAC_KEY,
        INTERNAL_KEY: env.ORCHESTRATOR_INTERNAL_KEY,
        REPO_URL: repoUrl,
        REPO_REF: ref,
        WORKSPACE: '/workspace',
        PROFILE: profile,
        ...runnerTimeoutEnv(env),
      };
      const name = await executor.run(jobName, scanId, orgId, secretData);
      logger.info({ scanId, jobName: name }, 'scan job created');

      // P3-16: persist the Job/Secret correlation and hand off to the watcher
      // so the scan lifecycle can be driven by the K8s Job outcome even when
      // the runner's completion callback is lost.
      try {
        await scans.setJobInfo(scanId, name, name);
      } catch (error) {
        logger.error({ err: error, scanId }, 'failed to persist scan job info');
      }
      // The watcher reads Kubernetes Job status. The local Docker driver has
      // no Kubernetes Job, so enqueueing one only produces a failing watcher
      // (and a dead-lettered job); the runner's signed callback drives the scan.
      if (env.RUNNER_DRIVER === 'kubernetes') {
        try {
          await queues.enqueue(SCAN_EXECUTE_WATCHER_QUEUE, 'watch', {
            scanId,
            orgId,
            jobName: name,
            secretName: name,
          });
        } catch (error) {
          logger.error({ err: error, scanId }, 'failed to enqueue watcher');
        }
      }
    },
    {
      connection: redisConnectionOptions(env),
      settings: WORKER_SETTINGS,
    },
  );

  // An unhandled 'error' event would crash the process; ioredis reconnects.
  worker.on('error', (error: Error) => logger.error({ err: error }, 'scan.execute worker error'));
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    queues
      .moveToDlq(SCAN_EXECUTE_QUEUE, job, error)
      .catch((dlqError: unknown) =>
        logger.error({ err: dlqError, jobId: job.id }, 'failed to dead-letter scan.execute job'),
      );
  });

  return worker;
}

/**
 * Owns the scan.execute worker for the process lifetime. Started explicitly
 * from `main.ts` (like `RetentionRunner`) so tests that call `createApp`
 * never dial Redis; `enableShutdownHooks` closes the worker on SIGTERM/SIGINT.
 */
@Injectable()
export class ScanExecuteRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(SCAN_EXECUTOR) private readonly executor: ScanExecutor,
    private readonly queues: QueueService,
    private readonly scans: ScansRepository,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createScanExecuteWorker(this.env, this.executor, this.queues, this.scans);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
