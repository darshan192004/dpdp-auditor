import { fixtureOrgSummary } from '../../../utils/fixtures/org';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * GET /api/v1/org/summary — P5-01. Org usage vs quota for the overview
 * dashboard. Fixtures answer only when explicitly enabled *and* no orchestrator
 * is configured, so a stray flag in a deployed environment still talks to the
 * real service.
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) return { data: fixtureOrgSummary() };

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/identity/org/summary',
  });
});
