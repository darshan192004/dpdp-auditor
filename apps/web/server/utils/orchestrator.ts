import { createHmac } from 'node:crypto';
import { $fetch } from 'ofetch';
import { apiError } from './api-error';
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
    'content-type': 'application/json',
    'x-internal-key': config.internalKey,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signHmac(`${timestamp}.${body}`, config.hmacKey),
    'x-request-id': getRequestId(event),
  };
  if (typeof event.context.orgId === 'string') headers['x-org-id'] = event.context.orgId;
  if (typeof event.context.userId === 'string') headers['x-user-id'] = event.context.userId;
  if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
  return { body: body === '' ? undefined : body, headers };
}

function readConfig(event: { context: { requestId?: string } }): OrchestratorConfig {
  const runtime = useRuntimeConfig();
  const config = {
    url: runtime.orchestratorUrl,
    hmacKey: runtime.orchestratorHmacKey,
    internalKey: runtime.orchestratorInternalKey,
  };
  if (!config.url || !config.hmacKey || !config.internalKey) {
    apiError(event, 500, 'INTERNAL_ERROR', 'The audit service is not configured.');
  }
  return config;
}

export async function callOrchestrator<T>(
  event: { context: { requestId?: string; orgId?: string; userId?: string } },
  options: OrchestratorCallOptions,
  deps: Partial<OrchestratorDeps> = {},
): Promise<T> {
  const config = deps.config ?? readConfig(event);
  if (!config.url || !config.hmacKey || !config.internalKey) {
    apiError(event, 500, 'INTERNAL_ERROR', 'The audit service is not configured.');
  }
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
  } catch {
    // Never surface the upstream URL, status text or stack (api.md §1.4).
    apiError(
      event,
      503,
      'UPSTREAM_UNAVAILABLE',
      'The audit service is unavailable. Try again shortly.',
    );
  }
}
