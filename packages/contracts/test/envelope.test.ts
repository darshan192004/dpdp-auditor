import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '../src/envelope';

const SPEC_EXAMPLE = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'The request body is invalid.',
    details: [{ path: 'ref', message: 'Must be a branch, tag, or 40-character commit SHA.' }],
    requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
  },
};

describe('errorEnvelopeSchema', () => {
  it('parses the exact api.md §1.4 example', () => {
    expect(errorEnvelopeSchema.parse(SPEC_EXAMPLE)).toEqual(SPEC_EXAMPLE);
  });

  it('accepts an envelope without details (details omitted when empty)', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a client-supplied request ID (X-Request-Id format)', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'trace-abc12345',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing requestId', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'VALIDATION_ERROR', message: 'The request body is invalid.' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string code', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 422,
        message: 'The request body is invalid.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a code outside the ERROR_CODES registry', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: {
        code: 'NOT_A_REAL_CODE',
        message: 'Nope.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a requestId shorter than 8 characters', () => {
    const result = errorEnvelopeSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'short' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an envelope missing the error wrapper', () => {
    const result = errorEnvelopeSchema.safeParse({
      code: 'NOT_FOUND',
      message: 'Not found.',
      requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
    });
    expect(result.success).toBe(false);
  });
});
