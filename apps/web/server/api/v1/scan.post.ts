import { apiError } from '../../utils/api-error';
import { fixturesAnswer } from '../../utils/org-request';
import { requireRole } from '../../utils/session';
import { SCAN_WRITE_ROLES, ScanInputError, validateScanSubmit } from '~~/shared/scan';

/**
 * POST /api/v1/scan — docs/api.md §3.1.
 * Start a scan. Role: auditor+. Browser clients send the same Idempotency-Key
 * across retries (api.md §1.7).
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Write operations are not available in fixture mode.');
  }

  requireRole(event, SCAN_WRITE_ROLES);

  const raw = await readBody(event);
  let body;
  try {
    body = validateScanSubmit(raw);
  } catch (error) {
    if (error instanceof ScanInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  const idempotencyKey = getHeader(event, 'idempotency-key');

  setResponseStatus(event, 202);
  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/scans',
    body,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
});
