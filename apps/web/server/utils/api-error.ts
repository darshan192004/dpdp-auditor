import { createError } from 'h3';
import type { ErrorCode } from '@dpdpa/contracts';
import { getRequestId } from './request-id';

export interface ErrorDetail {
  path: string;
  message: string;
}

export function apiError(
  event: { context: { requestId?: string } },
  status: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): never {
  const error: Record<string, unknown> = { code, message, requestId: getRequestId(event) };
  if (details !== undefined) error.details = details;
  throw createError({ statusCode: status, statusMessage: message, data: { error } });
}
