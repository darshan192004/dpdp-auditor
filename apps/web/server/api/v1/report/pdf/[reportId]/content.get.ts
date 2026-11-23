import { defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3';
import { callOrchestrator } from '../../../../../utils/orchestrator';
import { apiError } from '../../../../../utils/api-error';
import { fixturesAnswer, requireIdentity } from '../../../../../utils/org-request';
import { FIXTURE_REPORT_ID, fixtureReportPdf } from '../../../../../utils/fixtures/reports';

/** Authenticated PDF delivery; a copied link cannot cross organization boundaries. */
export default defineEventHandler(async (event) => {
  const reportId = getRouterParam(event, 'reportId');
  let buffer: Buffer;
  if (fixturesAnswer(event) && reportId === FIXTURE_REPORT_ID) {
    buffer = fixtureReportPdf();
  } else {
    requireIdentity(event);
    const query = getQuery(event);
    const params = new URLSearchParams();
    for (const field of ['token', 'expires'] as const) {
      if (typeof query[field] !== 'string') {
        apiError(event, 403, 'FORBIDDEN', 'Invalid report download link.');
      }
      params.set(field, query[field]);
    }
    const result = await callOrchestrator<{ data: { buffer: string } }>(event, {
      method: 'GET',
      path: `/internal/v1/reports/${encodeURIComponent(reportId ?? '')}/content?${params}`,
    });
    buffer = Buffer.from(result.data.buffer, 'base64');
  }
  setHeader(event, 'content-type', 'application/pdf');
  setHeader(event, 'content-disposition', 'attachment; filename="report.pdf"');
  setHeader(event, 'cache-control', 'private, no-store');
  return buffer;
});
