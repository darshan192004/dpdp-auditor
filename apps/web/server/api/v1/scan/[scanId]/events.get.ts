import { apiError } from '../../../../utils/api-error';
import { FixtureNotFoundError } from '../../../../utils/fixtures/findings';
import { getFixtureScanEvents } from '../../../../utils/fixtures/scans';
import { fixturesAnswer } from '../../../../utils/org-request';
import { requireIdentity } from '../../../../utils/session';

/**
 * GET /api/v1/scan/:scanId/events — docs/api.md §3.5.
 * Scan timeline. Role: viewer+. Fixtures answer only when explicitly enabled
 * and no orchestrator is configured.
 */
export default defineEventHandler((event) => {
  const scanId = getRouterParam(event, 'scanId') ?? '';

  if (fixturesAnswer(event)) {
    try {
      return { data: getFixtureScanEvents(scanId) };
    } catch (error) {
      if (error instanceof FixtureNotFoundError) {
        apiError(event, 404, 'NOT_FOUND', error.message);
      }
      throw error;
    }
  }

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/events`,
  });
});
