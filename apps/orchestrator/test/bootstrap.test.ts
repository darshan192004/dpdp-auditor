import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/bootstrap.js';
import { SERVICE_VERSION } from '../src/version.js';
import type { Env } from '../src/config/env.js';

const ENV_FIXTURE: Env = { NODE_ENV: 'test', PORT: 3001 };

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
