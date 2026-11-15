import Redis from 'ioredis';
import { createError, getRequestIP, setHeader, type H3Event } from 'h3';
import { getRequestId } from './request-id';

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  /** How to identify the caller for the bucket key. */
  key: (event: H3Event) => string | null;
  /** Behaviour when Redis is unavailable. */
  onStoreFailure: 'closed' | 'open';
  message: string;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
};

/** Minimal Redis surface used by the fixed-window counter. */
export type RateLimitStore = {
  incr(key: string): Promise<number>;
  expire(key: string, ttl: number, mode?: 'NX'): Promise<number>;
};

/**
 * Fixed-window counter: `INCR` + `EXPIRE`. The `NX` flag on `EXPIRE` means the
 * TTL is only set on the first hit, so a key never loses its window mid-second.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  policy: RateLimitPolicy,
  key: string,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = `rl:${policy.name}:${Math.floor(now / policy.windowSeconds)}:${key}`;
  const reset = (Math.floor(now / policy.windowSeconds) + 1) * policy.windowSeconds;

  const [count, _expire] = await Promise.all([
    store.incr(bucket),
    store.expire(bucket, policy.windowSeconds + 5, 'NX'),
  ]);
  void _expire;

  const remaining = Math.max(0, policy.limit - count);
  const allowed = count <= policy.limit;
  return {
    allowed,
    limit: policy.limit,
    remaining,
    reset,
    ...(allowed ? {} : { retryAfter: Math.max(1, reset - now) }),
  };
}

export function setRateLimitHeaders(event: H3Event, result: RateLimitResult): void {
  setHeader(event, 'RateLimit-Limit', String(result.limit));
  setHeader(event, 'RateLimit-Remaining', String(result.remaining));
  setHeader(event, 'RateLimit-Reset', String(result.reset));
  const retryAfter = result.retryAfter;
  if (retryAfter !== undefined) {
    // Node's res.setHeader accepts any string header name; h3's typed
    // `setResponseHeader` narrows `Retry-After` to a value type we don't need.
    event.node.res.setHeader('Retry-After', String(retryAfter));
  }
}

export function throwRateLimited(
  event: H3Event,
  policy: RateLimitPolicy,
  result: RateLimitResult,
): never {
  setRateLimitHeaders(event, result);
  const requestId = getRequestId(event);
  throw createError({
    statusCode: 429,
    statusMessage: policy.message,
    data: {
      error: {
        code: 'RATE_LIMITED',
        message: policy.message,
        requestId,
      },
    },
  });
}

export function clientIp(event: H3Event): string {
  // Prefer Nuxt/h3's resolved request IP; in production this must be configured
  // behind a trusted proxy. Fall back to socket address.
  try {
    const forwarded = getRequestIP(event, { xForwardedFor: true });
    if (forwarded) return forwarded;
  } catch {
    // h3 reads `node.req` headers; a synthetic event (fixtures, tests) may not
    // expose them. Fall back rather than throwing out of the middleware.
  }
  const socket = (event as { node?: { req?: { socket?: { remoteAddress?: string } } } }).node?.req
    ?.socket?.remoteAddress;
  return socket ?? 'unknown';
}

let client: Redis | null = null;
let clientUrl: string | null = null;

export function getRateLimitClient(redisUrl: string): RateLimitStore {
  if (client && clientUrl === redisUrl) return client;
  if (client) {
    void client.quit().catch(() => undefined);
  }
  clientUrl = redisUrl;
  client = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  client.on('error', () => {
    // Errors are surfaced per-command; keep the process quiet.
  });
  return client;
}

export async function closeRateLimitClient(): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    clientUrl = null;
    await c.quit().catch(() => undefined);
  }
}
