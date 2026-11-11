import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job, type Queue } from 'bullmq';
import { logger } from '../../common/logger.js';
import { ENV, type Env } from '../../config/env.js';
import { redisConnectionOptions, WORKER_SETTINGS, type QueueName } from '../../queue/queues.js';
// Value (not `type`) imports: `emitDecoratorMetadata` needs runtime refs for
// Nest to resolve these constructor params in RetentionRunner.
import { QueueService } from '../../queue/queue.service.js';
import { RetentionService } from './retention.service.js';

export const RETENTION_QUEUE: QueueName = 'retention';
export const RETENTION_JOB_NAME = 'run';
/** database.md §9: "Runs hourly in the orchestrator". */
export const RETENTION_CRON = '0 * * * *';
/** Stable id so re-adding the repeatable job is a no-op (BullMQ repeat key). */
export const RETENTION_JOB_ID = 'retention.hourly';

/**
 * Ensure the hourly trigger exists. Safe to call repeatedly: the repeat key is
 * derived from name + options (including jobId), so a duplicate add updates the
 * same repeatable job instead of creating a second schedule.
 */
export async function ensureRetentionSchedule(queue: Queue): Promise<void> {
  await queue.add(
    RETENTION_JOB_NAME,
    {},
    {
      repeat: { pattern: RETENTION_CRON },
      jobId: RETENTION_JOB_ID,
    },
  );
}

/**
 * Worker for the `retention` queue: 3 attempts on the shared 30s/2m/10m curve
 * (WORKER_SETTINGS), then dead-lettered. `job.attemptsMade` is incremented
 * unconditionally by `moveToFailed` after the retry check, so the final failure
 * is exactly the one where `attemptsMade >= attempts`.
 */
export function createRetentionWorker(
  env: Env,
  service: RetentionService,
  queues: QueueService,
): Worker {
  const worker = new Worker(RETENTION_QUEUE, async (_job: Job) => service.run(), {
    connection: redisConnectionOptions(env),
    settings: WORKER_SETTINGS,
  });
  // An unhandled 'error' event would crash the process; ioredis reconnects.
  worker.on('error', (error: Error) => logger.error({ err: error }, 'retention worker error'));
  worker.on('failed', (job: Job | undefined, error: Error) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    queues
      .moveToDlq(RETENTION_QUEUE, job, error)
      .catch((dlqError: unknown) =>
        logger.error({ err: dlqError, jobId: job.id }, 'failed to dead-letter retention job'),
      );
  });
  return worker;
}

/**
 * Owns the retention worker for the process lifetime. Started explicitly from
 * `main.ts` (like `startTelemetry`) so tests that call `createApp` never dial
 * Redis; `enableShutdownHooks` closes the worker on SIGTERM/SIGINT.
 */
@Injectable()
export class RetentionRunner implements OnApplicationShutdown {
  private worker?: Worker;
  private started = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly service: RetentionService,
    private readonly queues: QueueService,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.worker = createRetentionWorker(this.env, this.service, this.queues);
    // Fire-and-forget: while Redis has never been ready, BullMQ's add waits
    // for the connection (P1-18 corner) and lands then; a runtime rejection is
    // logged — losing the schedule silently is not an option.
    ensureRetentionSchedule(this.queues.queue(RETENTION_QUEUE)).catch((error: unknown) =>
      logger.error({ err: error }, 'failed to schedule retention job'),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}
