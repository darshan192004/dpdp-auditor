import { defineEventHandler, getQuery, getRouterParam } from 'h3';
import { apiError } from '../../../../../utils/api-error';
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
 * Reading is side-effect free: an unknown report id answers 404. Clients
 * reserve a report for a scan with POST /api/v1/report/pdf (auditor+), which
 * reuses an unexpired report for the same scan and template.
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
    const error = (cause as { data?: { error?: { code?: string; message?: string } } })?.data
      ?.error;
    if (error?.code !== 'NOT_FOUND') throw cause;
    apiError(event, 404, 'NOT_FOUND', error.message ?? 'The report was not found.');
  }
});
