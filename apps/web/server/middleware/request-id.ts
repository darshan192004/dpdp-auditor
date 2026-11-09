import { resolveRequestId } from '../utils/request-id';

export default defineEventHandler((event) => {
  event.context.requestId = resolveRequestId(getHeader(event, 'x-request-id'));
  setHeader(event, 'x-request-id', event.context.requestId);
});
