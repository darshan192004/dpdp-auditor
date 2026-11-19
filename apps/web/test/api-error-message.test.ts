import { describe, expect, it } from 'vitest';

import { apiErrorMessage } from '../shared/api-error';

describe('apiErrorMessage', () => {
  it('surfaces the server reason from a failed fetch', () => {
    expect(
      apiErrorMessage(
        { data: { error: { message: 'The free plan allows 5 scans per month.' } } },
        'Check the repository URL and try again.',
      ),
    ).toBe('The free plan allows 5 scans per month.');
  });

  it('falls back when the payload is missing, empty or not our envelope', () => {
    const fallback = 'The finding could not be updated. Try again.';
    expect(apiErrorMessage(undefined, fallback)).toBe(fallback);
    expect(apiErrorMessage(new Error('network down'), fallback)).toBe(fallback);
    expect(apiErrorMessage({ data: { error: { message: '   ' } } }, fallback)).toBe(fallback);
    expect(apiErrorMessage({ data: { error: { message: 42 } } }, fallback)).toBe(fallback);
  });
});
