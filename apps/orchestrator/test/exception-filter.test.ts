import { describe, expect, it } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { ZodError } from 'zod';
import { ApiExceptionFilter } from '../src/common/exception.filter.js';
import { ApiError } from '../src/common/api-error.js';
import { auditEntrySchema } from '../src/modules/audit/audit-entry.schema.js';

function makeHost(headers: Record<string, string | string[] | undefined> = {}) {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const request = { headers };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('maps an HttpException to its registry code and status', () => {
    const { host, sent } = makeHost({ 'x-request-id': 'req_abcdef123456' });
    filter.catch(
      new UnauthorizedException('The internal request could not be authenticated.'),
      host,
    );
    expect(sent.status).toBe(401);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.message).toBe('The internal request could not be authenticated.');
    expect(body.error.requestId).toBe('req_abcdef123456');
    expect(body.error.details).toBeUndefined();
  });

  it('maps a ZodError to VALIDATION_ERROR with per-issue details', () => {
    const { host, sent } = makeHost();
    const result = auditEntrySchema.safeParse({ actorType: 'robot', action: 'X Y' });
    expect(result.success).toBe(false);
    filter.catch((result as { error: ZodError }).error, host);
    expect(sent.status).toBe(422);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.length).toBeGreaterThan(0);
    for (const detail of body.error.details ?? []) {
      expect(typeof detail.path).toBe('string');
      expect(typeof detail.message).toBe('string');
    }
    expect(body.error.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('prefers a domain error code over the status default', () => {
    const { host, sent } = makeHost();
    filter.catch(new ApiError('LAST_OWNER', 'An organisation must keep at least one owner.'), host);
    expect(sent.status).toBe(409);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('LAST_OWNER');
    expect(body.error.message).toBe('An organisation must keep at least one owner.');
  });

  it('maps a 503 ServiceUnavailableException to UPSTREAM_UNAVAILABLE', () => {
    const { host, sent } = makeHost();
    filter.catch(new ServiceUnavailableException('Shutting down'), host);
    expect(sent.status).toBe(503);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.message).toBe('Shutting down');
  });

  it('falls back to INTERNAL_ERROR for unknown errors without leaking internals', () => {
    const { host, sent } = makeHost();
    const leak = new Error('connect ECONNREFUSED 10.0.0.5:5432 with SQL SELECT * FROM users');
    filter.catch(leak, host);
    expect(sent.status).toBe(500);
    const serialized = JSON.stringify(sent.body);
    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('SELECT');
    expect(serialized).not.toContain('stack');
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
  });

  it('handles Fastify-style errors (malformed JSON) as 400 with a valid envelope', () => {
    const { host, sent } = makeHost({ 'x-request-id': 'req_fastify000001' });
    const fastifyError = Object.assign(new SyntaxError('Unexpected token'), { statusCode: 400 });
    filter.catch(fastifyError, host);
    expect(sent.status).toBe(400);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toBe('req_fastify000001');
  });

  it('generates a request id when the header is missing or malformed', () => {
    const { host, sent } = makeHost({ 'x-request-id': 'bad id!' });
    filter.catch(new UnauthorizedException('nope'), host);
    const body = errorEnvelopeSchema.parse(sent.body);
    expect(body.error.requestId).toMatch(/^req_[0-9a-f]{32}$/);
  });
});
