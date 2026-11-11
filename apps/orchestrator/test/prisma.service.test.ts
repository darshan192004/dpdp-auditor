import { describe, expect, it, vi } from 'vitest';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { Env } from '../src/config/env.js';

const ENV: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('PrismaService', () => {
  it('is provided by PrismaModule', () => {
    expect(PrismaModule).toBeDefined();
  });

  it('disconnects on module destroy', async () => {
    const service = new PrismaService(ENV);
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue(undefined);
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
