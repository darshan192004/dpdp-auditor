import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ instances: [] as Record<string, unknown>[] }));

vi.mock('ioredis', () => {
  class FakeRedis {
    readonly options: {
      lazyConnect?: boolean;
      enableOfflineQueue?: boolean;
      maxRetriesPerRequest?: number;
    };

    constructor(_url: string, options: typeof this.options) {
      this.options = options;
      fake.instances.push(this as unknown as Record<string, unknown>);
    }

    on(): this {
      return this;
    }

    async quit(): Promise<'OK'> {
      return 'OK';
    }

    /**
     * Mirrors ioredis: with `lazyConnect` the socket is not open when the first
     * command arrives, and `enableOfflineQueue: false` rejects that command
     * instead of waiting for the connection.
     */
    private async ready(): Promise<void> {
      if (this.options.lazyConnect && this.options.enableOfflineQueue === false) {
        throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
      }
    }

    async incr(_key: string): Promise<number> {
      await this.ready();
      return 1;
    }

    async expire(_key: string, _ttl: number, _mode?: string): Promise<number> {
      await this.ready();
      return 1;
    }
  }

  return { default: FakeRedis };
});

import { closeRateLimitClient, getRateLimitClient } from '../server/utils/rate-limit';

describe('getRateLimitClient', () => {
  beforeEach(async () => {
    await closeRateLimitClient();
    fake.instances.length = 0;
  });

  it('accepts the first command issued immediately after construction', async () => {
    const store = getRateLimitClient('redis://127.0.0.1:6379');

    await expect(store.incr('rl:auth:1:first-request')).resolves.toBe(1);
    await expect(store.expire('rl:auth:1:first-request', 900, 'NX')).resolves.toBe(1);
  });
});
