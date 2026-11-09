import { randomUUID } from 'node:crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function resolveRequestId(incoming: string | undefined): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : generateRequestId();
}

export function getRequestId(event: { context: { requestId?: string } }): string {
  const current = event.context.requestId;
  if (typeof current === 'string' && REQUEST_ID_PATTERN.test(current)) return current;
  const generated = generateRequestId();
  event.context.requestId = generated;
  return generated;
}
