import { randomUUID } from 'node:crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function resolveRequestId(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['x-request-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && REQUEST_ID_PATTERN.test(value) ? value : generateRequestId();
}
