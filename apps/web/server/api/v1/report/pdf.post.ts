import { defineEventHandler, getHeader, readBody } from 'h3';
import { fixtureReportRequest } from '../../../utils/fixtures/reports';
import { fixturesAnswer } from '../../../utils/org-request';
import { callOrchestrator } from '../../../utils/orchestrator';
import { requireRole } from '../../../utils/session';

/**
 * POST /api/v1/report/pdf — docs/api.md §6.1
 * Request a PDF for a completed scan. Role: auditor+.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (fixturesAnswer(event)) return { data: fixtureReportRequest(body?.scanId) };
  requireRole(event, ['owner', 'admin', 'auditor']);
  const idempotencyKey = getHeader(event, 'idempotency-key');
  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/reports',
    body,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
});
