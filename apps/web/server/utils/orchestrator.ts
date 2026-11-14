import { createHmac } from 'node:crypto';
import type { H3Event } from 'h3';
import { $fetch } from 'ofetch';
import { ERROR_CODES, type ErrorCode } from '@dpdpa/contracts';
import { apiError, type ErrorDetail } from './api-error';
import { getRequestId } from './request-id';

export interface OrchestratorCallOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export interface OrchestratorConfig {
  url: string;
  hmacKey: string;
  internalKey: string;
}

export interface OrchestratorDeps {
  fetch: typeof $fetch;
  config: OrchestratorConfig;
  now: () => number;
}

export interface InternalRequest {
  body: string | undefined;
  headers: Record<string, string>;
}

export function signHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildInternalRequest(
  event: { context: { requestId?: string; orgId?: string; userId?: string } },
  options: OrchestratorCallOptions,
  config: OrchestratorConfig,
  now: () => number = Date.now,
): InternalRequest {
  const body = options.body === undefined ? '' : JSON.stringify(options.body);
  const timestamp = Math.floor(now() / 1000).toString();
  const headers: Record<string, string> = {
    'x-internal-key': config.internalKey,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signHmac(`${timestamp}.${body}`, config.hmacKey),
    'x-request-id': getRequestId(event),
  };
  // Only advertise a JSON body when one is actually sent; GET/DELETE carry none.
  if (body !== '') headers['content-type'] = 'application/json';
  if (typeof event.context.orgId === 'string') headers['x-org-id'] = event.context.orgId;
  if (typeof event.context.userId === 'string') headers['x-user-id'] = event.context.userId;
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
  return { body: body === '' ? undefined : body, headers };
}

export function orchestratorConfig(event?: H3Event): OrchestratorConfig {
  const runtime = useRuntimeConfig(event);
  return {
    url: runtime.orchestratorUrl,
    hmacKey: runtime.orchestratorHmacKey,
    internalKey: runtime.orchestratorInternalKey,
  };
}

function assertConfig(
  event: { context: { requestId?: string } },
  config: OrchestratorConfig,
): void {
  if (!config.url || !config.hmacKey || !config.internalKey) {
    apiError(event, 500, 'INTERNAL_ERROR', 'The audit service is not configured.');
  }
}

interface UpstreamFailure {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return isRecord(value) && typeof value.path === 'string' && typeof value.message === 'string';
}

/**
 * Domain errors (4xx) come back in the api.md §1.4 envelope and must reach the
 * browser unchanged apart from the request id; only transport/5xx failures are
 * masked as `UPSTREAM_UNAVAILABLE`.
 */
function upstreamFailure(error: unknown): UpstreamFailure | null {
  if (!isRecord(error)) return null;
  const response = error.response;
  if (!isRecord(response) || typeof response.status !== 'number') return null;
  const status = response.status;
  if (status < 400 || status >= 500) return null;

  const data = error.data;
  if (!isRecord(data) || !isRecord(data.error)) return null;
  const { code, message, details } = data.error;
  if (typeof code !== 'string' || !(code in ERROR_CODES) || typeof message !== 'string') {
    return null;
  }
  return {
    status,
    code: code as ErrorCode,
    message,
    ...(Array.isArray(details) ? { details: details.filter(isErrorDetail) } : {}),
  };
}

export async function callOrchestrator<T>(
  event: { context: { requestId?: string; orgId?: string; userId?: string } },
  options: OrchestratorCallOptions,
  deps: Partial<OrchestratorDeps> = {},
): Promise<T> {
  const config = deps.config ?? orchestratorConfig();
  // One validation path, whether the config came from runtime config or a caller.
  assertConfig(event, config);
  const fetch = deps.fetch ?? $fetch;
  const now = deps.now ?? Date.now;
  const request = buildInternalRequest(event, options, config, now);
  try {
    return await fetch<T>(`${config.url}${options.path}`, {
      method: options.method,
      ...(request.body === undefined ? {} : { body: request.body }),
      headers: request.headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const failure = upstreamFailure(error);
    if (failure) {
      apiError(event, failure.status, failure.code, failure.message, failure.details);
    }
    // Never surface the upstream URL, status text or stack (api.md §1.4).
    apiError(
      event,
      503,
      'UPSTREAM_UNAVAILABLE',
      'The audit service is unavailable. Try again shortly.',
    );
  }
}
