import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ENV } from '../src/config/env.js';
import { ApiExceptionFilter } from '../src/common/exception.filter.js';
import { InternalHmacGuard } from '../src/modules/internal-auth/internal-hmac.guard.js';
import { InternalReportsController } from '../src/modules/reports/internal-reports.controller.js';
import { ReportsService } from '../src/modules/reports/reports.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_ORG = '22222222-2222-4222-8222-222222222222';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const HMAC_KEY = 'a'.repeat(32);
const INTERNAL_KEY = 'b'.repeat(32);
const reports = { request: vi.fn().mockResolvedValue({ id: 'report', status: 'queued' }) };
let app: NestFastifyApplication;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [InternalReportsController],
    providers: [
      InternalHmacGuard,
      { provide: ReportsService, useValue: reports },
      {
        provide: ENV,
        useValue: { ORCHESTRATOR_HMAC_KEY: HMAC_KEY, ORCHESTRATOR_INTERNAL_KEY: INTERNAL_KEY },
      },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    rawBody: true,
    logger: false,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

beforeEach(() => vi.clearAllMocks());
afterAll(async () => app.close());

function request(body: object, orgId: string | null = ORG_ID, signed = true) {
  const payload = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return app.inject({
    method: 'POST',
    url: '/internal/v1/reports',
    payload,
    headers: {
      'content-type': 'application/json',
      ...(orgId === null ? {} : { 'x-org-id': orgId }),
      ...(signed
        ? {
            'x-internal-key': INTERNAL_KEY,
            'x-internal-timestamp': timestamp,
            'x-internal-signature': createHmac('sha256', HMAC_KEY)
              .update(`${timestamp}.${payload}`)
              .digest('hex'),
          }
        : {}),
    },
  });
}

describe('authenticated report creation tenant isolation', () => {
  it('uses the header organization even when the signed body supplies another tenant', async () => {
    const res = await request({ scanId: SCAN_ID, orgId: FOREIGN_ORG });
    expect(res.statusCode).toBe(202);
    expect(reports.request).toHaveBeenCalledExactlyOnceWith({
      orgId: ORG_ID,
      scanId: SCAN_ID,
      template: 'standard',
    });
  });

  it('accepts an ordinary signed request and preserves its template', async () => {
    const res = await request({ scanId: SCAN_ID, template: 'executive' });
    expect(res.statusCode).toBe(202);
    expect(reports.request).toHaveBeenCalledExactlyOnceWith({
      orgId: ORG_ID,
      scanId: SCAN_ID,
      template: 'executive',
    });
  });

  it('does not let a body organization replace a missing header', async () => {
    const res = await request({ scanId: SCAN_ID, orgId: FOREIGN_ORG }, null);
    expect(res.statusCode).toBe(422);
    expect(reports.request).not.toHaveBeenCalled();
  });

  it('validates the trusted header even when the body organization is valid', async () => {
    const res = await request({ scanId: SCAN_ID, orgId: FOREIGN_ORG }, 'invalid');
    expect(res.statusCode).toBe(422);
    expect(reports.request).not.toHaveBeenCalled();
  });

  it('rejects an unsigned request before calling the report service', async () => {
    const res = await request({ scanId: SCAN_ID, orgId: FOREIGN_ORG }, ORG_ID, false);
    expect(res.statusCode).toBe(401);
    expect(reports.request).not.toHaveBeenCalled();
  });
});
