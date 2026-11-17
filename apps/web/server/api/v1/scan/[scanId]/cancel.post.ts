import { apiError } from '../../../../utils/api-error';
import { fixturesAnswer } from '../../../../utils/org-request';
import { requireRole } from '../../../../utils/session';
import { SCAN_WRITE_ROLES, ScanInputError, validateScanCancel } from '~~/shared/scan';

/**
 * POST /api/v1/scan/:scanId/cancel — docs/api.md §3.4.
 * Cancel a queued or running scan. Role: auditor+. The orchestrator owns the
 * state transition and answers 409 for an already-terminal scan.
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Write operations are not available in fixture mode.');
  }

  requireRole(event, SCAN_WRITE_ROLES);

  const scanId = getRouterParam(event, 'scanId') ?? '';
  const raw = await readBody(event).catch(() => undefined);

  let body;
  try {
    body = validateScanCancel(raw);
  } catch (error) {
    if (error instanceof ScanInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  setResponseStatus(event, 202);
  return callOrchestrator(event, {
    method: 'POST',
    path: `/internal/v1/scans/${scanId}/cancel`,
    body,
  });
});
