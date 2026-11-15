import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
// Value (not `type`) imports: `emitDecoratorMetadata` needs runtime refs for
// Nest to resolve these constructor params in ScanExecuteWatcherRunner.
import { QueueService } from '../../queue/queue.service.js';
import { ScansService } from '../scans/scans.service.js';
import { JobWatcherService, type JobWatchOutcome } from './job-watcher.js';

export const SCAN_EXECUTE_WATCHER_QUEUE: QueueName = 'scan.execute.watcher';

export interface ScanExecuteWatcherPayload {
  scanId: string;
  orgId: string;
  jobName: string;
  secretName: string;
}

/** P3-16: poll the K8s Job until terminal or the scan is cancelled. */
export function createScanExecuteWatcherWorker(
  env: Env,
  watcher: JobWatcherService,
  scans: ScansService,
  queues: QueueService,
): Worker {
  const worker = new Worker(
    SCAN_EXECUTE_WATCHER_QUEUE,
    async (job: Job<ScanExecuteWatcherPayload>) => {
      const { scanId, orgId, jobName, secretName } = job.data;
      logger.info({ scanId, jobName }, 'watching scan job');

      let outcome: JobWatchOutcome;
      try {
        outcome = await watcher.check(jobName);
      } catch (error) {
        logger.error({ err: error, scanId, jobName }, 'watcher check failed');
        throw error;
      }

      switch (outcome.state) {
        case 'succeeded':
          await scans.markJobSucceeded(scanId, orgId, secretName);
          break;
        case 'failed':
          await scans.markJobFailed(
            scanId,
            orgId,
            outcome.reason,
            outcome.message ?? 'Job failed.',
            secretName,
          );
          break;
        case 'not_found':
          await scans.markJobFailed(
            scanId,
            orgId,
            'INCOMPLETE_RESULTS',
            'Job not found; callback may have been lost.',
            secretName,
          );
          break;
        case 'active':
          // Re-enqueue a fresh watcher tick (idempotent: BullMQ dedupes by
          // `job.id` only, so we add a new job with a delay).
          await queues.enqueue(
            SCAN_EXECUTE_WATCHER_QUEUE,
            'watch',
            { scanId, orgId, jobName, secretName },
            { delay: 5000 },
          );
          break;
        default:
          throw new Error(
            `unexpected watcher outcome ${String((outcome as { state: string }).state)}`,
          );
      }
    },
    {
      connection: redisConnectionOptions(env),
      settings: WORKER_SETTINGS,
    },
  );

  worker.on('error', (error: Error) =>
    logger.error({ err: error }, 'scan.execute.watcher worker error'),
  );
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    queues
      .moveToDlq(SCAN_EXECUTE_WATCHER_QUEUE, job, error)
      .catch((dlqError: unknown) =>
        logger.error({ err: dlqError, jobId: job.id }, 'failed to dead-letter watcher job'),
      );
  });

  return worker;
}

/** Owns the scan.execute.watcher worker for the process lifetime. */
@Injectable()
export class ScanExecuteWatcherRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly watcher: JobWatcherService,
    private readonly scans: ScansService,
    private readonly queues: QueueService,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createScanExecuteWatcherWorker(this.env, this.watcher, this.scans, this.queues);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
