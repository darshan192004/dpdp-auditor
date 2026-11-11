import type { JobsOptions } from 'bullmq';

/** Queue names (docs/tasks.md P1-18; architecture.md §14 layout). */
export const QUEUE_NAMES = ['scan.execute', 'report.render', 'retention'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const DLQ_SUFFIX = '.dlq';

/** Dead-letter companion for a business queue (`dlq_depth` reads these). */
export function dlqName(queue: QueueName): string {
  return `${queue}${DLQ_SUFFIX}`;
}

/** architecture.md §10: 3 attempts, exponential backoff 30s, 2m, 10m, then DLQ. */
export const QUEUE_ATTEMPTS = 3;

/** First-failure → delay in ms; key is the 1-based `attemptsMade` BullMQ passes. */
const BACKOFF_CURVE_MS: Record<number, number> = { 1: 30_000, 2: 120_000, 3: 600_000 };

/**
 * BullMQ custom backoff strategy for {@link WORKER_SETTINGS}. Returns `-1`
 * (BullMQ's "stop retrying") once the documented curve is exhausted.
 */
export function queueBackoffStrategy(attemptsMade: number): number {
  return BACKOFF_CURVE_MS[attemptsMade] ?? -1;
}

/** One-liner for P3-21's Worker: `new Worker(name, processor, { settings: WORKER_SETTINGS })`. */
export const WORKER_SETTINGS = { backoffStrategy: queueBackoffStrategy } as const;

/** architecture.md §12: Redis job TTL + 24 h (safety net; the DLQ holds dead jobs). */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/** Shared enqueue defaults for every business queue. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: QUEUE_ATTEMPTS,
  // Resolved by queueBackoffStrategy via the Worker's `settings` (see WORKER_SETTINGS).
  backoff: { type: 'custom' },
  removeOnComplete: { age: JOB_TTL_MS },
  removeOnFail: { age: JOB_TTL_MS },
};

export interface RedisConnectionOptions {
  url: string;
  enableOfflineQueue: false;
}

/**
 * BullMQ's documented fail-fast pattern: with the offline queue disabled,
 * `queue.add` rejects as soon as Redis is unreachable instead of hanging, so
 * the API can answer 503 + Retry-After (architecture.md §10, Redis-unavailable
 * row). The ioredis client reconnects on its own, so a queue survives outages.
 */
export function redisConnectionOptions(env: { REDIS_URL: string }): RedisConnectionOptions {
  return { url: env.REDIS_URL, enableOfflineQueue: false };
}
