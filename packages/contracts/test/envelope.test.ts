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

type EnvelopeCase = { name: string; payload: unknown; valid: boolean };

const envelopeCases: EnvelopeCase[] = [
  { name: 'the exact api.md §1.4 example', payload: SPEC_EXAMPLE, valid: true },
  {
    name: 'an envelope without details (details omitted when empty)',
    payload: {
      error: {
        code: 'NOT_FOUND',
        message: 'Not found.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    },
    valid: true,
  },
  {
    name: 'a client-supplied request ID (X-Request-Id format)',
    payload: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        requestId: 'trace-abc12345',
      },
    },
    valid: true,
  },
  {
    name: 'a missing requestId',
    payload: { error: { code: 'VALIDATION_ERROR', message: 'The request body is invalid.' } },
    valid: false,
  },
  {
    name: 'a non-string code',
    payload: {
      error: {
        code: 422,
        message: 'The request body is invalid.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    },
    valid: false,
  },
  {
    name: 'a code outside the ERROR_CODES registry',
    payload: {
      error: {
        code: 'NOT_A_REAL_CODE',
        message: 'Nope.',
        requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
      },
    },
    valid: false,
  },
  {
    name: 'a requestId shorter than 8 characters',
    payload: { error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'short' } },
    valid: false,
  },
  {
    name: 'an envelope missing the error wrapper',
    payload: {
      code: 'NOT_FOUND',
      message: 'Not found.',
      requestId: 'req_01J8Z3K4M5N6P7Q8R9S0T1U2V3',
    },
    valid: false,
  },
];

describe('errorEnvelopeSchema', () => {
  it('parses the exact api.md §1.4 example structurally equal', () => {
    expect(errorEnvelopeSchema.parse(SPEC_EXAMPLE)).toEqual(SPEC_EXAMPLE);
  });

  for (const { name, payload, valid } of envelopeCases) {
    it(`${valid ? 'accepts' : 'rejects'} ${name}`, () => {
      expect(errorEnvelopeSchema.safeParse(payload).success).toBe(valid);
    });
  }
});
