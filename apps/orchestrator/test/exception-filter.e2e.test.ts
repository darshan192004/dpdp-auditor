import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { createApp } from '../src/bootstrap.js';
import type { Env } from '../src/config/env.js';

const ENV_FIXTURE: Env = {
  NODE_ENV: 'test',
  PORT: 3001,
  ORCHESTRATOR_HMAC_KEY: 'a'.repeat(32),
  ORCHESTRATOR_INTERNAL_KEY: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/dpdpa_test',
  REDIS_URL: 'redis://127.0.0.1:6379',
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

describe('ApiExceptionFilter (e2e)', () => {
  it('returns the contract envelope for unparseable JSON (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/v1/health',
      headers: { 'content-type': 'application/json' },
      payload: '{"broken',
    });
    expect(res.statusCode).toBe(400);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('returns the contract envelope for an unknown route (404)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/v1/nope' });
    expect(res.statusCode).toBe(404);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
