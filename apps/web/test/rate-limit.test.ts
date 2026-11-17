import { describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  clientIp,
  setRateLimitHeaders,
  throwRateLimited,
  type RateLimitPolicy,
  type RateLimitStore,
} from '../server/utils/rate-limit';

function makeEvent(headers: Record<string, unknown> = {}, socket = '127.0.0.1') {
  const res = { setHeader: vi.fn() };
  return {
    node: { res, req: { socket: { remoteAddress: socket }, headers } },
    context: { requestId: 'req_test_1234' },
  } as never;
}

const POLICY: RateLimitPolicy = {
  name: 'repos-resolve',
  limit: 30,
  windowSeconds: 60,
  key: () => 'usr_test',
  onStoreFailure: 'closed',
  message: 'Repository resolve rate limit exceeded. Try again later.',
};

function makeStore(counts: number[] = []): RateLimitStore {
  const calls: string[] = [];
  return {
    incr: vi.fn(async (key: string) => {
      calls.push(key);
      const next = counts.shift() ?? 1;
      return next;
    }),
    expire: vi.fn(async () => 1),
  };
}

describe('checkRateLimit', () => {
  it('returns allowed=true and remaining=limit on the first call', async () => {
    const store = makeStore();
    const result = await checkRateLimit(store, POLICY, 'usr_test');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30);
    expect(result.remaining).toBe(29);
    expect(result.reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns allowed=false and a Retry-After when over the limit', async () => {
    const store = makeStore([30, 31]);
    const first = await checkRateLimit(store, POLICY, 'usr_test');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);

    const second = await checkRateLimit(store, POLICY, 'usr_test');
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
    expect(second.retryAfter).toBeGreaterThan(0);
  });

  it('isolates buckets by key', async () => {
    const store = makeStore();
    const a = await checkRateLimit(store, POLICY, 'usr_a');
    const b = await checkRateLimit(store, POLICY, 'usr_b');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('isolates buckets by policy name', async () => {
    const store = makeStore();
    const other: RateLimitPolicy = { ...POLICY, name: 'auth' };
    const a = await checkRateLimit(store, POLICY, 'usr_test');
    const b = await checkRateLimit(store, other, 'usr_test');
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('uses the same window for the same second', async () => {
    const store = makeStore([1, 2]);
    const a = await checkRateLimit(store, POLICY, 'usr_test');
    const b = await checkRateLimit(store, POLICY, 'usr_test');
    expect(a.reset).toBe(b.reset);
  });
});

describe('setRateLimitHeaders', () => {
  it('emits the standard RateLimit-* headers', () => {
    const event = makeEvent();
    setRateLimitHeaders(event, {
      allowed: true,
      limit: 30,
      remaining: 29,
      reset: 1762245120,
    });
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '30');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '29');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '1762245120');
  });

  it('emits Retry-After only when the result is rejected', () => {
    const event = makeEvent();
    setRateLimitHeaders(event, {
      allowed: false,
      limit: 30,
      remaining: 0,
      reset: 1762245120,
      retryAfter: 3,
    });
    expect(event.node.res.setHeader).toHaveBeenCalledWith('Retry-After', '3');
  });
});

describe('throwRateLimited', () => {
  it('throws a 429 H3 error carrying the RATE_LIMITED envelope', () => {
    const event = makeEvent();
    expect(() =>
      throwRateLimited(event, POLICY, {
        allowed: false,
        limit: 30,
        remaining: 0,
        reset: 1762245120,
        retryAfter: 3,
      }),
    ).toThrow();
  });
});

describe('clientIp', () => {
  it('returns the forwarded IP when present', () => {
    const event = makeEvent({ 'x-forwarded-for': '203.0.113.7' });
    expect(clientIp(event)).toBe('203.0.113.7');
  });

  it('falls back to the socket address when no forwarded IP is present', () => {
    const event = makeEvent({}, '198.51.100.9');
    expect(clientIp(event)).toBe('198.51.100.9');
  });
});
