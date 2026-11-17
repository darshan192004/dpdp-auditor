import { requireRole } from '../../../utils/session';
import { defineEventHandler, getQuery, setHeader } from 'h3';
import { callOrchestrator } from '../../../utils/orchestrator';
import { fixturesAnswer } from '../../../utils/org-request';
import { fixtureAuditLogNdjson } from '../../../utils/fixtures/audit';

/**
 * GET /api/v1/audit-logs/export — P5-31
 * Streams audit logs as NDJSON. Role: owner/admin.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) {
    setHeader(event, 'content-type', 'application/x-ndjson');
    setHeader(event, 'content-disposition', 'attachment; filename="audit-logs.jsonl"');
    return fixtureAuditLogNdjson(getQuery(event));
  }

  requireRole(event, ['owner', 'admin']);
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
