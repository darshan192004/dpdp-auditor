import { readBody } from 'h3';
import { callOrchestrator } from '../../../utils/orchestrator';
import { requireIdentity } from '../../../utils/org-request';

/**
 * POST /api/v1/report/pdf — docs/api.md §6.1
 * Request a PDF for a completed scan. Role: auditor+.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/reports',
    body,
  });
});
