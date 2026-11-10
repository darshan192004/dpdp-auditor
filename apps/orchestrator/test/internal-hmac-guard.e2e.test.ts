import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { createApp } from '../src/bootstrap.js';
import { HealthService } from '../src/modules/health/health.service.js';
import type { Env } from '../src/config/env.js';

const ENV_FIXTURE: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
};
let app: NestFastifyApplication;

function signedHeaders(timestamp = Math.floor(Date.now() / 1000).toString(), body = '') {
  return {
    'x-internal-key': ENV_FIXTURE.ORCHESTRATOR_INTERNAL_KEY,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': createHmac('sha256', ENV_FIXTURE.ORCHESTRATOR_HMAC_KEY)
      .update(`${timestamp}.${body}`)
      .digest('hex'),
    'x-request-id': 'req_test_1234',
  };
}

beforeAll(async () => {
  app = await createApp(ENV_FIXTURE);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app.close();
});

describe('InternalHmacGuard', () => {
  it('allows a correctly signed GET', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/internal/v1/health',
      headers: signedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('leaves the probe routes unauthenticated', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
  });

  it('rejects a missing signature with the contract envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health' });
    expect(res.statusCode).toBe(401);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(body.error.message).not.toMatch(/signature|timestamp|internal key/i);
  });

  it('rejects a stale timestamp', async () => {
    const old = String(Math.floor(Date.now() / 1000) - 301);
    const res = await app.inject({
      method: 'GET',
      url: '/internal/v1/health',
      headers: signedHeaders(old),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a tampered body signature', async () => {
    const headers = signedHeaders();
    headers['x-internal-signature'] = 'f'.repeat(64);
    const res = await app.inject({ method: 'GET', url: '/internal/v1/health', headers });
    expect(res.statusCode).toBe(401);
  });

  it('flips readiness to 503 while shutting down', async () => {
    const health = app.get(HealthService);
    health.onApplicationShutdown();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
  });
});
