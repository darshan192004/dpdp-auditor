import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/bootstrap.js';
import { SERVICE_VERSION } from '../src/version.js';
import type { Env } from '../src/config/env.js';

const ENV_FIXTURE: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

describe('bootstrap', () => {
  it('keeps SERVICE_VERSION in sync with package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(SERVICE_VERSION).toBe(pkg.version);
  });

  it('closes cleanly', async () => {
    const app = await createApp(ENV_FIXTURE);
    await expect(app.close()).resolves.toBeUndefined();
  });
});
