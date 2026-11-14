import { fixtureOrgDetail } from '../../../utils/fixtures/org';
import { fixturesAnswer } from '../../../utils/org-request';

/** GET /api/v1/org — docs/api.md §7.2. Any active member may read it. */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) return { data: fixtureOrgDetail() };

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/identity/org',
  });
});
