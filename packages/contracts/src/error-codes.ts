export interface ErrorCodeEntry {
  readonly httpStatus: number;
  readonly retryable: boolean;
}

export const ERROR_CODES = {
  VALIDATION_ERROR: { httpStatus: 422, retryable: false },
  UNAUTHENTICATED: { httpStatus: 401, retryable: false },
  FORBIDDEN: { httpStatus: 403, retryable: false },
  NOT_FOUND: { httpStatus: 404, retryable: false },
  CONFLICT: { httpStatus: 409, retryable: false },
  INVALID_STATE_TRANSITION: { httpStatus: 409, retryable: false },
  LAST_OWNER: { httpStatus: 409, retryable: false },
  REPO_ALREADY_CONNECTED: { httpStatus: 409, retryable: false },
  SCAN_IN_PROGRESS: { httpStatus: 409, retryable: true },
  SCAN_NOT_READY: { httpStatus: 409, retryable: true },
  REPORT_NOT_READY: { httpStatus: 409, retryable: true },
  REPORT_EXPIRED: { httpStatus: 410, retryable: false },
  IDEMPOTENCY_CONFLICT: { httpStatus: 422, retryable: false },
  PLAN_LIMIT_EXCEEDED: { httpStatus: 402, retryable: false },
  REPO_NOT_FOUND: { httpStatus: 404, retryable: false },
  REPO_TOO_LARGE: { httpStatus: 422, retryable: false },
  PAGINATION_LIMIT: { httpStatus: 422, retryable: false },
  RATE_LIMITED: { httpStatus: 429, retryable: true },
  PAYLOAD_TOO_LARGE: { httpStatus: 413, retryable: false },
  UPSTREAM_UNAVAILABLE: { httpStatus: 503, retryable: true },
  INTERNAL_ERROR: { httpStatus: 500, retryable: false },
  INCOMPLETE_RESULTS: { httpStatus: 200, retryable: false },
  GITHUB_RATE_LIMITED: { httpStatus: 200, retryable: false },
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;
