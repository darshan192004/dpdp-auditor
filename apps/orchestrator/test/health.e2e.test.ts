import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/bootstrap.js';
import type { Env } from '../src/config/env.js';

const ENV_FIXTURE: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
};
let app: NestFastifyApplication;

beforeAll(async () => {
  app = await createApp(ENV_FIXTURE);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('health endpoints', () => {
  it('GET /health returns the liveness contract', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['status', 'timestamp', 'uptimeSeconds', 'version'].sort(),
    );
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(body.timestamp).toBe(new Date(body.timestamp).toISOString());
  });

  it('GET /ready returns readiness', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: { config: 'ok' } });
  });

  it('protects the internal health route', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health' });
    expect(res.statusCode).toBe(401);
  });
});
