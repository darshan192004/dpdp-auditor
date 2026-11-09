import { send, setResponseHeader, setResponseStatus, type H3Event } from 'h3';
import { toErrorEnvelope } from './utils/error-envelope';
import { getRequestId } from './utils/request-id';

// Nitro custom error handler (nitro.errorHandler = '~/error-handler').
// Every non-2xx response leaves the server in the api.md §1.4 envelope.
//
// Nitro invokes `(error, event, { defaultHandler })` and only checks
// `event.handled` afterwards, so the body must be written with `send()`.
export default async function errorHandler(error: unknown, event: H3Event): Promise<void> {
  if (event.handled) return;

  const requestId = getRequestId(event);
  const { status, body } = toErrorEnvelope(error, requestId);

  setResponseStatus(event, status);
  setResponseHeader(event, 'x-request-id', requestId);
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8');
  setResponseHeader(event, 'cache-control', 'no-store');
  if (status === 503) setResponseHeader(event, 'retry-after', '5');

  await send(event, JSON.stringify(body));
}
