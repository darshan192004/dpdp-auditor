import { HttpException } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@dpdpa/contracts';

/**
 * Domain error carrying a registry code. The global filter prefers `code`
 * over the status-derived default so that e.g. LAST_OWNER stays distinct from
 * the generic 409 CONFLICT (docs/api.md §1.4).
 */
export class ApiError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message, ERROR_CODES[code].httpStatus);
  }
}
