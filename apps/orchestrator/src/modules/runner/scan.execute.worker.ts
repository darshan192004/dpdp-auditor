import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
// Value (not `type`) imports: `emitDecoratorMetadata` needs runtime refs for
// Nest to resolve these constructor params in ScanExecuteRunner.
import { QueueService } from '../../queue/queue.service.js';
import { SCAN_EXECUTOR, type ScanExecutor } from './scan-executor.js';

export const SCAN_EXECUTE_QUEUE: QueueName = 'scan.execute';

export interface ScanExecutePayload {
  scanId: string;
  orgId: string;
  repoUrl: string;
  ref: string;
  hmacKey: string;
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
): Worker {
  const worker = new Worker(
    SCAN_EXECUTE_QUEUE,
    async (job: Job<ScanExecutePayload>) => {
      const { scanId, orgId, repoUrl, ref, hmacKey } = job.data;
      logger.info({ scanId, repoUrl, ref }, 'starting scan execution');
      const jobName = `scan-${scanId}`;
      const secretData = {
        SCAN_ID: scanId,
        REPO_URL: repoUrl,
        REF: ref,
        HMAC_KEY: hmacKey,
      };
      const name = await executor.run(jobName, scanId, orgId, secretData);
      logger.info({ scanId, jobName: name }, 'scan job created');
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
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createScanExecuteWorker(this.env, this.executor, this.queues);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
