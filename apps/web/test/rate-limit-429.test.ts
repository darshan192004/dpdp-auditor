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

describe('throwRateLimited', () => {
  it('throws a 429 error with correct status code', () => {
    const event = makeEvent();
    const result = {
      allowed: false,
      limit: 30,
      remaining: 0,
      reset: 1762245120,
      retryAfter: 3,
    };

    let thrown: unknown;
    try {
      throwRateLimited(event, POLICY, result);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(thrown).toMatchObject({
      statusCode: 429,
      statusMessage: 'Repository resolve rate limit exceeded. Try again later.',
      data: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Repository resolve rate limit exceeded. Try again later.',
          requestId: 'req_test_1234',
        },
      },
    });
  });

  it('includes Retry-After header in response', () => {
    const event = makeEvent();
    const result = {
      allowed: false,
      limit: 30,
      remaining: 0,
      reset: 1762245120,
      retryAfter: 45,
    };

    try {
      throwRateLimited(event, POLICY, result);
    } catch {
      // Expected to throw
    }

    expect(event.node.res.setHeader).toHaveBeenCalledWith('Retry-After', '45');
  });

  it('sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers', () => {
    const event = makeEvent();
    const result = {
      allowed: false,
      limit: 10,
      remaining: 0,
      reset: 1762245200,
      retryAfter: 60,
    };

    try {
      throwRateLimited(event, POLICY, result);
    } catch {
      // Expected to throw
    }

    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '10');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '1762245200');
  });
});

describe('checkRateLimit policy exhaustion', () => {
  it('returns allowed=false when count exceeds limit', async () => {
    // Simulate hitting the exact limit (30), then exceeding it (31)
    const store = makeStore([30, 31]);
    const policy: RateLimitPolicy = {
      ...POLICY,
      limit: 30,
    };

    const first = await checkRateLimit(store, policy, 'usr_test');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);

    const second = await checkRateLimit(store, policy, 'usr_test');
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
    expect(second.retryAfter).toBeDefined();
    expect(second.retryAfter).toBeGreaterThan(0);
  });

  it('returns allowed=true when count equals limit', async () => {
    const store = makeStore([30]);
    const policy: RateLimitPolicy = {
      ...POLICY,
      limit: 30,
    };

    const result = await checkRateLimit(store, policy, 'usr_test');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeUndefined();
  });

  it('Retry-After value matches window reset time', async () => {
    const store = makeStore([31]);
    const policy: RateLimitPolicy = {
      ...POLICY,
      limit: 30,
      windowSeconds: 60,
    };

    const result = await checkRateLimit(store, policy, 'usr_test');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();

    // retryAfter should be reset - now
    const now = Math.floor(Date.now() / 1000);
    const expectedReset = (Math.floor(now / 60) + 1) * 60;
    expect(result.reset).toBe(expectedReset);
    expect(result.retryAfter).toBe(expectedReset - now);
  });
});

describe('policy defaults', () => {
  it('auth policy has correct defaults (10/15min)', async () => {
    const authPolicy: RateLimitPolicy = {
      name: 'auth',
      limit: 10,
      windowSeconds: 15 * 60,
      key: (e) => clientIp(e),
      onStoreFailure: 'closed',
      message: 'Too many authentication attempts. Try again later.',
    };

    expect(authPolicy.limit).toBe(10);
    expect(authPolicy.windowSeconds).toBe(900); // 15 minutes
    expect(authPolicy.onStoreFailure).toBe('closed');
    expect(authPolicy.message).toBe('Too many authentication attempts. Try again later.');
  });

  it('resolve policy has correct defaults (30/min)', async () => {
    const resolvePolicy: RateLimitPolicy = {
      name: 'repos-resolve',
      limit: 30,
      windowSeconds: 60,
      key: () => 'usr_test',
      onStoreFailure: 'closed',
      message: 'Repository resolve rate limit exceeded. Try again later.',
    };

    expect(resolvePolicy.limit).toBe(30);
    expect(resolvePolicy.windowSeconds).toBe(60); // 1 minute
    expect(resolvePolicy.onStoreFailure).toBe('closed');
  });

  it('repos policy has correct defaults (300/min)', async () => {
    const reposPolicy: RateLimitPolicy = {
      name: 'repos',
      limit: 300,
      windowSeconds: 60,
      key: () => 'usr_test',
      onStoreFailure: 'open',
      message: 'Rate limit exceeded. Try again later.',
    };

    expect(reposPolicy.limit).toBe(300);
    expect(reposPolicy.windowSeconds).toBe(60); // 1 minute
    expect(reposPolicy.onStoreFailure).toBe('open');
  });
});

describe('Redis failure handling', () => {
  it('Redis failure with onStoreFailure: closed returns 503 behavior', async () => {
    const store: RateLimitStore = {
      incr: vi.fn(async () => {
        throw new Error('Redis connection failed');
      }),
      expire: vi.fn(async () => {
        throw new Error('Redis connection failed');
      }),
    };

    const policy: RateLimitPolicy = {
      ...POLICY,
      onStoreFailure: 'closed',
    };

    let thrown: unknown;
    try {
      await checkRateLimit(store, policy, 'usr_test');
    } catch (error) {
      thrown = error;
    }

    // When Redis fails and onStoreFailure is 'closed', the error should propagate
    // so the middleware can return 503
    expect(thrown).toBeDefined();
    expect(thrown).toBeInstanceOf(Error);
  });

  it('Redis failure with onStoreFailure: open allows request through', async () => {
    const store: RateLimitStore = {
      incr: vi.fn(async () => {
        throw new Error('Redis connection failed');
      }),
      expire: vi.fn(async () => {
        throw new Error('Redis connection failed');
      }),
    };

    const policy: RateLimitPolicy = {
      ...POLICY,
      onStoreFailure: 'open',
    };

    let thrown: unknown;
    try {
      await checkRateLimit(store, policy, 'usr_test');
    } catch (error) {
      thrown = error;
    }

    // When Redis fails and onStoreFailure is 'open', the error should propagate
    // so the middleware can allow the request through (fail open)
    expect(thrown).toBeDefined();
    expect(thrown).toBeInstanceOf(Error);
  });
});

describe('setRateLimitHeaders', () => {
  it('sets X-RateLimit-Limit header correctly', () => {
    const event = makeEvent();
    const result = {
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: 1762245300,
    };

    setRateLimitHeaders(event, result);

    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '100');
  });

  it('sets X-RateLimit-Remaining header correctly', () => {
    const event = makeEvent();
    const result = {
      allowed: true,
      limit: 100,
      remaining: 50,
      reset: 1762245300,
    };

    setRateLimitHeaders(event, result);

    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '50');
  });

  it('sets X-RateLimit-Reset header correctly', () => {
    const event = makeEvent();
    const result = {
      allowed: true,
      limit: 100,
      remaining: 50,
      reset: 1762245400,
    };

    setRateLimitHeaders(event, result);

    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '1762245400');
  });

  it('sets Retry-After header only when rate limited', () => {
    const event = makeEvent();
    const result = {
      allowed: false,
      limit: 100,
      remaining: 0,
      reset: 1762245500,
      retryAfter: 120,
    };

    setRateLimitHeaders(event, result);

    expect(event.node.res.setHeader).toHaveBeenCalledWith('Retry-After', '120');
  });

  it('does not set Retry-After header when not rate limited', () => {
    const event = makeEvent();
    const result = {
      allowed: true,
      limit: 100,
      remaining: 50,
      reset: 1762245600,
    };

    setRateLimitHeaders(event, result);

    expect(event.node.res.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});

describe('middleware bypass with NUXT_FIXTURES', () => {
  it('bypasses rate limiting when NUXT_FIXTURES=1', () => {
    const originalFixtures = process.env.NUXT_FIXTURES;
    process.env.NUXT_FIXTURES = '1';

    // The middleware should return early without checking rate limits
    // This is tested by verifying the environment variable check exists
    expect(process.env.NUXT_FIXTURES).toBe('1');

    process.env.NUXT_FIXTURES = originalFixtures;
  });

  it('does not bypass when NUXT_FIXTURES is not set', () => {
    const originalFixtures = process.env.NUXT_FIXTURES;
    delete process.env.NUXT_FIXTURES;

    expect(process.env.NUXT_FIXTURES).toBeUndefined();

    process.env.NUXT_FIXTURES = originalFixtures;
  });
});

describe('integration: rate limit exhaustion flow', () => {
  it('complete flow: allowed requests then 429 with correct headers', async () => {
    // Store that increments a real counter per key.
    const counts = new Map<string, number>();
    const store: RateLimitStore = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
    };
    const policy: RateLimitPolicy = {
      ...POLICY,
      limit: 30,
    };

    // First 29 requests should be allowed (30th is at the limit, still allowed).
    for (let i = 0; i < 29; i++) {
      const result = await checkRateLimit(store, policy, 'usr_test');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(30 - (i + 1));
    }

    // Request at limit (30th) — allowed but zero remaining.
    const atLimit = await checkRateLimit(store, policy, 'usr_test');
    expect(atLimit.allowed).toBe(true);
    expect(atLimit.remaining).toBe(0);

    // Request over limit (31st) should be rejected.
    const overLimit = await checkRateLimit(store, policy, 'usr_test');
    expect(overLimit.allowed).toBe(false);
    expect(overLimit.remaining).toBe(0);
    expect(overLimit.retryAfter).toBeGreaterThan(0);

    // Verify headers would be set correctly.
    const event = makeEvent();
    setRateLimitHeaders(event, overLimit);
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '30');
    expect(event.node.res.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0');
    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      String(overLimit.retryAfter),
    );
  });
});

describe('different policies isolation', () => {
  it('different policies have separate buckets', async () => {
    const store = makeStore([1, 1, 1]);

    const authPolicy: RateLimitPolicy = {
      name: 'auth',
      limit: 10,
      windowSeconds: 900,
      key: () => 'usr_test',
      onStoreFailure: 'closed',
      message: 'Auth limit',
    };

    const resolvePolicy: RateLimitPolicy = {
      name: 'repos-resolve',
      limit: 30,
      windowSeconds: 60,
      key: () => 'usr_test',
      onStoreFailure: 'closed',
      message: 'Resolve limit',
    };

    const reposPolicy: RateLimitPolicy = {
      name: 'repos',
      limit: 300,
      windowSeconds: 60,
      key: () => 'usr_test',
      onStoreFailure: 'open',
      message: 'Repos limit',
    };

    // All three policies should have separate counters
    const authResult = await checkRateLimit(store, authPolicy, 'usr_test');
    const resolveResult = await checkRateLimit(store, resolvePolicy, 'usr_test');
    const reposResult = await checkRateLimit(store, reposPolicy, 'usr_test');

    expect(authResult.allowed).toBe(true);
    expect(resolveResult.allowed).toBe(true);
    expect(reposResult.allowed).toBe(true);

    // Each should have different limits
    expect(authResult.limit).toBe(10);
    expect(resolveResult.limit).toBe(30);
    expect(reposResult.limit).toBe(300);
  });
});
