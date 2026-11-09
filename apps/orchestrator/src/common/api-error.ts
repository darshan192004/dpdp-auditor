import type { ErrorCode } from '@dpdpa/contracts';

export interface ErrorEnvelopeBody {
  error: { code: ErrorCode; message: string; requestId: string };
}

export function internalErrorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
): ErrorEnvelopeBody {
  return { error: { code, message, requestId } };
}
