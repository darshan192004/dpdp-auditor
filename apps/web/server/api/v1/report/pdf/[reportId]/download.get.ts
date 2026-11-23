import { defineEventHandler, getRouterParam, sendRedirect, setHeader } from 'h3';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { FIXTURE_REPORT_ID } from '../../../../../utils/fixtures/reports';
import { fixturesAnswer, requireIdentity } from '../../../../../utils/org-request';

/**
 * GET /api/v1/report/pdf/:reportId/download — docs/api.md §6.3
 * Redirect to a signed download URL (15-minute TTL). Role: viewer+.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store');
  const reportId = getRouterParam(event, 'reportId');
  if (fixturesAnswer(event) && reportId === FIXTURE_REPORT_ID) {
    return sendRedirect(event, `/api/v1/report/pdf/${FIXTURE_REPORT_ID}/content`, 302);
  }
  requireIdentity(event);
  const result = await callOrchestrator<{ data: string } | string>(event, {
    method: 'GET',
    path: `/internal/v1/reports/${reportId}/download`,
  });
  const url =
    typeof result === 'object' && result !== null && 'data' in result ? result.data : result;
  return sendRedirect(event, typeof url === 'string' ? url : String(url), 302);
});
