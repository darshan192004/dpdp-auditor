import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { toErrorEnvelope } from '../server/utils/error-envelope';

const REQUEST_ID = 'req_test_1234';

const STATUS_CASES: [number, string][] = [
  [401, 'UNAUTHENTICATED'],
  [403, 'FORBIDDEN'],
  [404, 'NOT_FOUND'],
  [409, 'CONFLICT'],
  [410, 'REPORT_EXPIRED'],
  [413, 'PAYLOAD_TOO_LARGE'],
  [422, 'VALIDATION_ERROR'],
  [429, 'RATE_LIMITED'],
  [503, 'UPSTREAM_UNAVAILABLE'],
];

describe('toErrorEnvelope', () => {
  it('preserves an apiError envelope', () => {
    const result = toErrorEnvelope(
      {
        statusCode: 422,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid.',
            requestId: 'req_original_1',
            details: [{ path: 'ref', message: 'Required.' }],
          },
        },
      },
      REQUEST_ID,
    );
    expect(result.status).toBe(422);
    expect(errorEnvelopeSchema.parse(result.body)).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid.', requestId: REQUEST_ID },
    });
  });

  it.each(STATUS_CASES)('maps HTTP %i to %s', (statusCode, code) => {
    const result = toErrorEnvelope({ statusCode }, REQUEST_ID);
    expect(result.status).toBe(statusCode);
    expect(result.body.error.code).toBe(code);
  });

  it('hides internals for unknown and 5xx errors', () => {
    const result = toErrorEnvelope(new Error('connect ECONNREFUSED postgres://secret'), REQUEST_ID);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body.error.message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(result.body)).not.toContain('postgres');
  });

  it('never returns a stack trace', () => {
    const result = toErrorEnvelope(
      Object.assign(new Error('boom'), { stack: 'at secret.ts:1' }),
      REQUEST_ID,
    );
    expect(JSON.stringify(result.body)).not.toContain('secret.ts');
  });
});
