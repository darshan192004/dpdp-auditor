import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';
import { apiError } from '../server/utils/api-error';

function capture(fn: () => never): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected apiError to throw');
}

describe('apiError', () => {
  it('throws an H3 error carrying the contract envelope', () => {
    const event = { context: { requestId: 'req_test_1234' } } as never;
    const error = capture(() => apiError(event, 404, 'NOT_FOUND', 'Not found.')) as {
      statusCode: number;
      data: unknown;
    };
    expect(error.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(error.data)).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req_test_1234' },
    });
  });

  it('includes details only when provided', () => {
    const event = { context: { requestId: 'req_test_1234' } } as never;
    const error = capture(() =>
      apiError(event, 422, 'VALIDATION_ERROR', 'Invalid.', [{ path: 'ref', message: 'Required.' }]),
    ) as { data: { error: Record<string, unknown> } };
    expect(error.data.error.details).toEqual([{ path: 'ref', message: 'Required.' }]);

    const bare = capture(() => apiError(event, 401, 'UNAUTHENTICATED', 'Sign in.')) as {
      data: { error: Record<string, unknown> };
    };
    expect('details' in bare.data.error).toBe(false);
  });
});
