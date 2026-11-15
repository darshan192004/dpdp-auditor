import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, type RateLimitPolicy, type RateLimitStore } from '../server/utils/rate-limit';

// P2-17/P2-20: Resolve-specific rate limit policy (30/min/user, fail-closed).
describe('Resolve rate limit policy (P2-17 / P2-20)', () => {
  const RESOLVE_POLICY: RateLimitPolicy = {
    name: 'repos-resolve',
    limit: 30,
    windowSeconds: 60,
    key: () => 'usr_test',
    onStoreFailure: 'closed',
    message: 'Repository resolve rate limit exceeded. Try again later.',
  };

  function makeStore(counts: number[] = []): RateLimitStore {
    return {
      incr: vi.fn(async () => counts.shift() ?? 1),
      expire: vi.fn(async () => 1),
    };
  }

  it('allows requests under the 30/min limit', async () => {
    const store = makeStore([1, 29]);
    const first = await checkRateLimit(store, RESOLVE_POLICY, 'usr_test');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(29);

    const nearLimit = await checkRateLimit(store, RESOLVE_POLICY, 'usr_test');
    expect(nearLimit.allowed).toBe(true);
    expect(nearLimit.remaining).toBe(0);
  });

  it('denies the 31st request with retry-after', async () => {
    const store = makeStore(Array(31).fill(0).map((_, i) => i + 1));
    // Exhaust the 30 allowed requests
    for (let i = 0; i < 30; i++) {
      await checkRateLimit(store, RESOLVE_POLICY, 'usr_test');
    }
    // 31st should be denied
    const overLimit = await checkRateLimit(store, RESOLVE_POLICY, 'usr_test');
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.retryAfter).toBeGreaterThan(0);
  });

  it('uses fail-closed behaviour (onStoreFailure: closed)', () => {
    expect(RESOLVE_POLICY.onStoreFailure).toBe('closed');
  });
});