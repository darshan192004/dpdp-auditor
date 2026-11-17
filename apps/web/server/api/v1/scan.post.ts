import { defineEventHandler, getHeader, readBody, setHeader, setResponseStatus } from 'h3';
import { callOrchestrator } from '../../utils/orchestrator';
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

  if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{16,64}$/.test(idempotencyKey)) {
    apiError(
      event,
      422,
      'VALIDATION_ERROR',
      'Idempotency-Key must contain 16 to 64 letters, digits, underscores, or hyphens.',
    );
  }

  const response = await callOrchestrator<{
    data: { scanId: string; status: string; createdAt: string; replayed: boolean };
  }>(event, {
    method: 'POST',
    path: '/internal/v1/scans',
    body: { ...body, ...(idempotencyKey ? { idempotencyKey } : {}) },
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  const { scanId, ...data } = response.data;
  setResponseStatus(event, 202);
  setHeader(event, 'Location', `/api/v1/scan/${encodeURIComponent(scanId)}`);
  return { ...response, data: { ...data, id: scanId } };
});
