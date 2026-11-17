import { sendRedirect } from 'h3';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { requireIdentity } from '../../../../../utils/org-request';

/**
 * GET /api/v1/report/pdf/:reportId/download — docs/api.md §6.3
 * Redirect to a signed download URL (15-minute TTL). Role: viewer+.
 */
export default defineEventHandler(async (event) => {
  requireIdentity(event);
  const reportId = getRouterParam(event, 'reportId');
  const result = await callOrchestrator<{ data: string } | string>(event, {
    method: 'GET',
    path: `/internal/v1/reports/${reportId}/download`,
  });
  const url =
    typeof result === 'object' && result !== null && 'data' in result ? result.data : result;
  return sendRedirect(event, typeof url === 'string' ? url : String(url), 302);
});
