import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/error-codes';

const SPEC_HTTP_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'LAST_OWNER',
  'REPO_ALREADY_CONNECTED',
  'SCAN_IN_PROGRESS',
  'SCAN_NOT_READY',
  'REPORT_NOT_READY',
  'REPORT_EXPIRED',
  'IDEMPOTENCY_CONFLICT',
  'PLAN_LIMIT_EXCEEDED',
  'REPO_NOT_FOUND',
  'REPO_TOO_LARGE',
  'PAGINATION_LIMIT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

describe('ERROR_CODES registry', () => {
  it('covers every api.md §11 error code', () => {
    for (const code of SPEC_HTTP_CODES) {
      expect(ERROR_CODES).toHaveProperty(code);
    }
  });

  it('maps PAGINATION_LIMIT to 422, not retryable', () => {
    expect(ERROR_CODES.PAGINATION_LIMIT).toEqual({ httpStatus: 422, retryable: false });
  });

  it('marks RATE_LIMITED 429 and retryable', () => {
    expect(ERROR_CODES.RATE_LIMITED).toEqual({ httpStatus: 429, retryable: true });
  });

  it('maps the remaining plan-mandated codes exactly', () => {
    expect(ERROR_CODES.VALIDATION_ERROR).toEqual({ httpStatus: 422, retryable: false });
    expect(ERROR_CODES.FORBIDDEN).toEqual({ httpStatus: 403, retryable: false });
    expect(ERROR_CODES.CONFLICT).toEqual({ httpStatus: 409, retryable: false });
    expect(ERROR_CODES.IDEMPOTENCY_CONFLICT).toEqual({ httpStatus: 422, retryable: false });
    expect(ERROR_CODES.PLAN_LIMIT_EXCEEDED).toEqual({ httpStatus: 402, retryable: false });
    expect(ERROR_CODES.REPO_TOO_LARGE).toEqual({ httpStatus: 422, retryable: false });
  });

  it('follows §11 retry guidance for transient 409 codes', () => {
    expect(ERROR_CODES.SCAN_IN_PROGRESS.retryable).toBe(true);
    expect(ERROR_CODES.SCAN_NOT_READY.retryable).toBe(true);
    expect(ERROR_CODES.REPORT_NOT_READY.retryable).toBe(true);
    expect(ERROR_CODES.INVALID_STATE_TRANSITION.retryable).toBe(false);
  });

  it('stores scan-level failure codes as non-HTTP outcomes (200)', () => {
    expect(ERROR_CODES.INCOMPLETE_RESULTS).toEqual({ httpStatus: 200, retryable: false });
    expect(ERROR_CODES.GITHUB_RATE_LIMITED).toEqual({ httpStatus: 200, retryable: false });
  });

  it('maps UNAUTHENTICATED and INTERNAL_ERROR per §11', () => {
    expect(ERROR_CODES.UNAUTHENTICATED).toEqual({ httpStatus: 401, retryable: false });
    expect(ERROR_CODES.INTERNAL_ERROR).toEqual({ httpStatus: 500, retryable: false });
  });

  it('has only sane HTTP statuses and boolean retryable flags', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      expect(Number.isInteger(entry.httpStatus)).toBe(true);
      expect(entry.httpStatus).toBeGreaterThanOrEqual(100);
      expect(entry.httpStatus).toBeLessThanOrEqual(599);
      expect(typeof entry.retryable).toBe('boolean');
    }
  });
});
