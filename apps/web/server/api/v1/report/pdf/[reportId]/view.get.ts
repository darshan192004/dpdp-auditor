import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { fixtureReportViewModel } from '../../../../../utils/fixtures/reports';
import { getFixtureScan } from '../../../../../utils/fixtures/scans';
import { FIXTURE_SCAN_ID } from '../../../../../utils/fixtures/findings';
import { fixturesAnswer } from '../../../../../utils/org-request';
import { requireIdentity } from '../../../../../utils/session';

/**
 * GET /api/v1/report/pdf/:reportId/view - docs/api.md 10.6.
 * Report view model for the accessible HTML preview. Role: viewer+.
 *
 * The console's Report tab links with the scan id (a report may not exist
 * yet), so an unknown id is retried as a scan id: the orchestrator reserves
 * the report for that scan (idempotent per scan+template) and the view model
 * is read back under the reserved report id.
 */
export default defineEventHandler(async (event) => {
  const reportId = getRouterParam(event, 'reportId');
  if (fixturesAnswer(event)) {
    const scanId = getQuery(event).scanId;
    const scan = getFixtureScan(typeof scanId === 'string' ? scanId : FIXTURE_SCAN_ID);
    return { data: fixtureReportViewModel(scan) };
  }

  requireIdentity(event);
  try {
    return await callOrchestrator(event, {
      method: 'GET',
      path: `/internal/v1/reports/${reportId}/view-model`,
    });
  } catch (cause) {
    const code = (cause as { data?: { error?: { code?: string } } })?.data?.error?.code;
    if (code !== 'NOT_FOUND') throw cause;
  }

  // Unknown report id → treat it as a scan id and reserve its report.
  const created = await callOrchestrator<{ data?: { id?: string } }>(event, {
    method: 'POST',
    path: '/internal/v1/reports',
    body: { scanId: reportId },
    idempotencyKey: `view-${reportId}`,
  });
  const reservedId = created?.data?.id;
  if (!reservedId) throw new Error('The report could not be created for this scan.');
  return await callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/reports/${reservedId}/view-model`,
  });
});
