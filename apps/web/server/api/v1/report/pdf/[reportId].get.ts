import { callOrchestrator } from '../../../../utils/orchestrator';
import { requireIdentity } from '../../../../utils/org-request';

/**
 * GET /api/v1/report/pdf/:reportId — docs/api.md §6.2
 * Report status (queued|rendering|ready|failed). Role: viewer+.
 */
export default defineEventHandler((event) => {
  requireIdentity(event);
  const reportId = getRouterParam(event, 'reportId');
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/reports/${reportId}/status`,
  });
});
