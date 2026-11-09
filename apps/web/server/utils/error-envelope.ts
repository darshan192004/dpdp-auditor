import type { ErrorCode } from '@dpdpa/contracts';

export interface EnvelopeBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: { path: string; message: string }[];
  };
}

export interface EnvelopeResult {
  status: number;
  body: EnvelopeBody;
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'REPORT_EXPIRED',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'UPSTREAM_UNAVAILABLE',
};

const GENERIC_5XX = 'An unexpected error occurred.';

interface ErrorLike {
  statusCode?: number;
  statusMessage?: string;
  data?: unknown;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function passthroughEnvelope(data: unknown): EnvelopeBody['error'] | undefined {
  if (!isRecord(data) || !isRecord(data.error)) return undefined;
  const { code, message, details } = data.error;
  if (typeof code !== 'string' || typeof message !== 'string') return undefined;
  const error: EnvelopeBody['error'] = { code: code as ErrorCode, message, requestId: '' };
  if (Array.isArray(details)) {
    error.details = details
      .filter(
        (detail): detail is { path: string; message: string } =>
          isRecord(detail) && typeof detail.path === 'string' && typeof detail.message === 'string',
      )
      .map(({ path, message }) => ({ path, message }));
  }
  return error;
}

export function toErrorEnvelope(error: unknown, requestId: string): EnvelopeResult {
  const err: ErrorLike = isRecord(error) ? (error as ErrorLike) : {};
  const passthrough = passthroughEnvelope(err.data);
  if (passthrough) {
    return { status: err.statusCode ?? 500, body: { error: { ...passthrough, requestId } } };
  }
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
  const safeStatus = code === 'INTERNAL_ERROR' ? 500 : status;
  const message =
    safeStatus >= 500 ? GENERIC_5XX : (err.statusMessage ?? 'The request could not be completed.');
  return { status: safeStatus, body: { error: { code, message, requestId } } };
}
