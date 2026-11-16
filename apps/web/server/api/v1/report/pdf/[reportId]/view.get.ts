import { callOrchestrator } from '../../../../../utils/orchestrator';
import { fixtureReportViewModel } from '../../../../../utils/fixtures/reports';
import { getFixtureScan } from '../../../../../utils/fixtures/scans';
import { FIXTURE_SCAN_ID } from '../../../../../utils/fixtures/findings';
import { fixturesAnswer } from '../../../../../utils/org-request';

/**
 * GET /api/v1/report/pdf/:reportId/view - docs/api.md 10.6.
 * Report view model for the accessible HTML preview. Role: viewer+.
 */
export default defineEventHandler((event) => {
  const reportId = getRouterParam(event, 'reportId');
  if (fixturesAnswer(event)) {
    const scanId = getQuery(event).scanId;
    const scan = getFixtureScan(typeof scanId === 'string' ? scanId : FIXTURE_SCAN_ID);
    return { data: fixtureReportViewModel(scan) };
  }

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/reports/${reportId}/view-model`,
  });
});
