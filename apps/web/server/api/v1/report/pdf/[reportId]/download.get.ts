import { sendRedirect, setHeader } from 'h3';
import { callOrchestrator, callOrchestratorBinary } from '../../../../../utils/orchestrator';
import { requireIdentity } from '../../../../../utils/org-request';

/**
 * GET /api/v1/report/pdf/:reportId/download — docs/api.md §6.3
 *
 * With an object-store public URL configured the orchestrator returns a signed
 * absolute URL and we keep the documented 302 redirect. In self-hosted mode
 * there is no object store, so the orchestrator returns its own relative
 * download path and we stream the stored PDF through this authenticated route.
 * Role: viewer+.
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

  if (typeof url === 'string' && url.startsWith('/api/v1/report/pdf/')) {
    const bytes = await callOrchestratorBinary(event, {
      method: 'GET',
      path: `/internal/v1/reports/${reportId}/file`,
    });
    setHeader(event, 'content-type', 'application/pdf');
    setHeader(event, 'content-disposition', `attachment; filename="dpdpa-report-${reportId}.pdf"`);
    setHeader(event, 'content-length', bytes.byteLength);
    return Buffer.from(bytes);
  }

  return sendRedirect(event, typeof url === 'string' ? url : String(url), 302);
});
