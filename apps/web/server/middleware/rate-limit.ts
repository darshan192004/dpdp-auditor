import { apiError } from '../utils/api-error';
import {
  checkRateLimit,
  clientIp,
  getRateLimitClient,
  setRateLimitHeaders,
  throwRateLimited,
  type RateLimitPolicy,
} from '../utils/rate-limit';

/**
 * Route-level rate limiting backed by Redis (docs/security.md §8, P2-17).
 *
 * - `/api/auth/**`: 10 / 15 min / IP — fail closed.
 * - `POST /api/v1/repos/resolve`: 30 / min / user — fail closed.
 * - other `/api/v1/repos/**`: 300 / min / user — fail open.
 *
 * Auth routes run before session resolution, so they key by IP. Resolve runs
 * after session middleware and keys by user. When identity is unavailable the
 * policy is skipped (the route's own auth guard will reject).
 */
export default defineEventHandler(async (event) => {
  // Bypass rate limiting in fixture mode (NUXT_FIXTURES=1) where Redis is unavailable.
  if (process.env.NUXT_FIXTURES === '1') return;
  const path = event.path;
  if (!path.startsWith('/api/')) return;

  const runtime = useRuntimeConfig(event);
  const redisUrl = (runtime as { redisUrl?: string }).redisUrl;
  if (!redisUrl) return; // local/fixture environments without Redis

  let policy: RateLimitPolicy | null = null;

  if (path.startsWith('/api/auth/')) {
    policy = {
      name: 'auth',
      limit: 10,
      windowSeconds: 15 * 60,
      key: (e) => clientIp(e),
      onStoreFailure: 'closed',
      message: 'Too many authentication attempts. Try again later.',
    };
  } else if (path.startsWith('/api/v1/repos/resolve')) {
    policy = {
      name: 'repos-resolve',
      limit: 30,
      windowSeconds: 60,
      key: (e) => {
        const userId = e.context.userId as string | undefined;
        return typeof userId === 'string' && userId ? userId : null;
      },
      onStoreFailure: 'closed',
      message: 'Repository resolve rate limit exceeded. Try again later.',
    };
  } else if (path.startsWith('/api/v1/repos')) {
    policy = {
      name: 'repos',
      limit: 300,
      windowSeconds: 60,
      key: (e) => {
        const userId = e.context.userId as string | undefined;
        return typeof userId === 'string' && userId ? userId : null;
      },
      onStoreFailure: 'open',
      message: 'Rate limit exceeded. Try again later.',
    };
  }

  if (!policy) return;

  const key = policy.key(event);
  if (key === null) return;

  const store = getRateLimitClient(redisUrl);
  try {
    const result = await checkRateLimit(store, policy, key);
    if (!result.allowed) {
      throwRateLimited(event, policy, result);
    }
    setRateLimitHeaders(event, result);
  } catch (error) {
    // Re-throw H3 errors (429s we just created).
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    if (policy.onStoreFailure === 'closed') {
      apiError(event, 503, 'UPSTREAM_UNAVAILABLE', 'Rate limiting is temporarily unavailable.');
    }
    // fail open: allow the request through when Redis is down for non-auth routes.
  }
});
