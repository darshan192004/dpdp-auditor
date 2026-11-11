import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import { logger } from '../common/logger.js';
import { ENV, type Env } from '../config/env.js';
import { DEFAULT_JOB_OPTIONS, dlqName, redisConnectionOptions, type QueueName } from './queues.js';

const CONNECTION_FAILURE =
  /Connection is closed|Stream isn't writeable|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|enableOfflineQueue/i;

function isConnectionFailure(error: unknown): boolean {
  return error instanceof Error && CONNECTION_FAILURE.test(error.message);
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queues = new Map<string, Queue>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Business queue. Created lazily: boot and unit tests never dial Redis. */
  queue(name: QueueName): Queue {
    return this.getOrCreate(name, DEFAULT_JOB_OPTIONS);
  }

  /** Dead-letter companion `<name>.dlq`; jobs persist until the runbook drains them. */
  dlq(name: QueueName): Queue {
    return this.getOrCreate(dlqName(name));
  }

  /**
   * Enqueue with the shared retry policy. Connection failures surface as
   * 503 `UPSTREAM_UNAVAILABLE` (architecture.md §10: queue at the API with 503
   * and Retry-After; reads continue).
   */
  async enqueue<T>(name: QueueName, jobName: string, data: T, opts?: JobsOptions): Promise<Job<T>> {
    try {
      return await this.queue(name).add(jobName, data, opts);
    } catch (error) {
      if (isConnectionFailure(error)) {
        logger.error({ err: error, queue: name }, 'queue unavailable');
        throw new ServiceUnavailableException('The queue is temporarily unavailable.');
      }
      throw error;
    }
  }

  /**
   * Move an exhausted job to the DLQ (same id, name and data) and drop it from
   * the source queue — architecture.md §10: 3 attempts, then dead-letter.
   */
  async moveToDlq(name: QueueName, job: Job, error: Error): Promise<void> {
    logger.error({ queue: name, jobId: job.id, err: error }, 'job moved to DLQ');
    // Jobs always carry an id once created; the DLQ copy reuses it so the
    // dead-letter entry is addressable back to the original job.
    await this.dlq(name).add(job.name, job.data, { jobId: job.id! });
    await job.remove();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  private getOrCreate(name: string, defaultJobOptions?: JobsOptions): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: redisConnectionOptions(this.env),
        ...(defaultJobOptions ? { defaultJobOptions } : {}),
      });
      // An unhandled 'error' event crashes the process; connection blips are
      // logged here while ioredis reconnects on its own.
      queue.on('error', (error: Error) =>
        logger.error({ err: error, queue: name }, 'queue connection error'),
      );
      this.queues.set(name, queue);
    }
    return queue;
  }
}
