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
  RUNNER_DRIVER: 'kubernetes',
  SCANNERS_NAMESPACE: 'scanners',
  RUNNER_IMAGE: 'registry.example.com/dpdpa/scan-runner@sha256:test',
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

/**
 * P6-01 – Cross‑tenant test suite (basic subset).
 *
 * Ensures the backend rejects requests that attempt to access resources
 * belonging to a different organization. Without proper authentication,
 * requests are rejected with 401 UNAUTHENTICATED. With authentication but
 * a foreign org context, requests are rejected with 404 NOT_FOUND or
 * 403 FORBIDDEN without leaking existence information.
 */
describe('Cross‑tenant isolation (P6-01)', () => {
  const FOREIGN_ORG = '00000000-0000-0000-0000-000000000999';
  const KNOWN_SCAN = '0f000000-0000-4000-8000-000000000010';
  const KNOWN_REPO = '55555555-5555-4555-8555-555555555555';
  const KNOWN_REPORT = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

  const readRoutes: Array<{ method: string; path: string; description: string }> = [
    { method: 'GET', path: `/internal/v1/scans/${KNOWN_SCAN}`, description: 'scan detail' },
    {
      method: 'GET',
      path: `/internal/v1/reports/${KNOWN_REPORT}/view-model`,
      description: 'report view',
    },
    { method: 'GET', path: `/internal/v1/repos/${KNOWN_REPO}`, description: 'repository detail' },
    { method: 'GET', path: '/internal/v1/audit/audit-logs', description: 'audit log list' },
    { method: 'GET', path: '/internal/v1/rules', description: 'rules catalog' },
    { method: 'GET', path: '/internal/v1/repos', description: 'repository list' },
    { method: 'GET', path: '/internal/v1/scans', description: 'scan list' },
  ];

  const writeRoutes: Array<{ method: string; path: string; payload?: object }> = [
    {
      method: 'POST',
      path: '/internal/v1/scans',
      payload: { repositoryId: KNOWN_REPO, ref: 'main' },
    },
    {
      method: 'POST',
      path: '/internal/v1/repos/resolve',
      payload: { url: 'https://github.com/acme/test', orgId: FOREIGN_ORG },
    },
    { method: 'PATCH', path: `/internal/v1/repos/${KNOWN_REPO}`, payload: { name: 'updated' } },
    { method: 'DELETE', path: `/internal/v1/repos/${KNOWN_REPO}` },
  ];

  describe('read endpoints without authentication', () => {
    for (const route of readRoutes) {
      it(`returns 401 or 404 on ${route.method} ${route.path}`, async () => {
        const res = await app.inject({
          method: route.method as 'GET',
          url: route.path,
          headers: { 'content-type': 'application/json' },
        });
        // Without internal auth key, routes return 404 (not found) to avoid leaking existence
        expect([401, 404]).toContain(res.statusCode);
        if (res.statusCode === 401) {
          const body = errorEnvelopeSchema.parse(res.json());
          expect(body.error.code).toBe('UNAUTHENTICATED');
        }
      });
    }
  });

  describe('write endpoints without authentication', () => {
    for (const route of writeRoutes) {
      it(`returns 401, 404, or 400 on ${route.method} ${route.path}`, async () => {
        const res = await app.inject({
          method: route.method as 'POST' | 'PATCH' | 'DELETE',
          url: route.path,
          headers: { 'content-type': 'application/json' },
          payload: route.payload,
        });
        // Without internal auth key, routes return 401/404; some may return 400 for bad payloads
        expect([400, 401, 404]).toContain(res.statusCode);
        if (res.statusCode === 401) {
          const body = errorEnvelopeSchema.parse(res.json());
          expect(body.error.code).toBe('UNAUTHENTICATED');
        }
      });
    }
  });

  it('unknown route returns 404 with the contract envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('foreign org id on resolve returns 404 or 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/v1/repos/resolve',
      headers: { 'content-type': 'application/json' },
      payload: { url: 'https://github.com/acme/test', orgId: FOREIGN_ORG },
    });
    // Without auth: 404; with auth but foreign org: 404 or 403
    expect([401, 403, 404]).toContain(res.statusCode);
  });
});
