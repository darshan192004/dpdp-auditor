import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, clientIp, setRateLimitHeaders, throwRateLimited, type RateLimitPolicy, type RateLimitStore } from '../server/utils/rate-limit';

// P2-17/P2-20: Redis sliding-window counter; P2-20 test suite for resolve rate limiting.
describe('Resolve rate limit (P2-17 / P2-20)', () => {
  const POLICY: RateLimitPolicy = {
    name: 'repos-resolve',
    limit: 2,
    windowSeconds: 1,
    key: () => 'usr_test',
    onStoreFailure: 'closed',
    message: 'Repository resolve rate limit exceeded. Try again later.',
  };

  function makeEvent(headers: Record<string, unknown> = {}, socket = '127.0.0.1') {
    const res = { setHeader: vi.fn() };
    return {
      node: { res, req: { socket: { remoteAddress: socket }, headers } },
      context: { requestId: 'req_test_1234' },
    } as never;
  }

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
      expect(result.limit).toBe(2);
      expect(result.remaining).toBe(1);
      expect(result.reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('returns allowed=false and a Retry-After when over the limit', async () => {
      const store = makeStore([2, 3]);
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
});
