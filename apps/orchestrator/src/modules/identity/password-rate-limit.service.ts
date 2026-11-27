import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ApiError } from '../../common/api-error.js';
import { ENV, type Env } from '../../config/env.js';
import type { RateLimitGate } from './password-login.service.js';

/**
 * Atomic fixed-window counter. INCR and EXPIRE happen in one Lua script so a
 * burst of concurrent requests cannot all read the same pre-increment count.
 * KEYS[1] is the bucket key; ARGV[1] is its TTL; ARGV[2] is the request limit.
 */
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then return 0 end
return 1
`;

/** Redis-backed rate limiter for password authentication; fails closed. */
@Injectable()
export class PasswordRateLimitService implements RateLimitGate, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.redis = new Redis(env.REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    // Per-command errors are surfaced by consume(); keep the process quiet.
    this.redis.on('error', () => undefined);
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const bucket = `${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    try {
      const result = await this.redis.eval(
        CONSUME,
        1,
        bucket,
        String(windowSeconds + 5),
        String(limit),
      );
      return Number(result) === 1;
    } catch {
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Rate limiting is temporarily unavailable.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
