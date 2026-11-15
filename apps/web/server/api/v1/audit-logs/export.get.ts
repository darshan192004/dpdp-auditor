import { getQuery } from 'h3';
import { callOrchestrator } from '../../../utils/orchestrator';
import { requireIdentity } from '../../../utils/org-request';

/**
 * GET /api/v1/audit-logs/export — P5-31
 * Streams audit logs as NDJSON. Role: owner/admin.
 */
export default defineEventHandler((event) => {
  requireIdentity(event);
  const query = getQuery(event);
  const params = new URLSearchParams();
  for (const key of ['action', 'actorUserId', 'from', 'to', 'format'] as const) {
    const val = query[key];
    if (typeof val === 'string') params.set(key, val);
  }
  const qs = params.toString();
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/audit/audit-logs/export${qs ? `?${qs}` : ''}`,
  });
});
