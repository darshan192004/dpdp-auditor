import { fixtureOrgMembers } from '../../../../utils/fixtures/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/** GET /api/v1/org/members — docs/api.md §7.3. Any active member may read. */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) return { data: fixtureOrgMembers() };

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/identity/org/members',
  });
});
