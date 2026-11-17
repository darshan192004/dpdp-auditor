import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * GET /api/v1/org/invites — docs/api.md P2-21.
 *
 * List pending (not yet accepted or expired) invitations. Owner/admin only.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    return { data: [] };
  }

  requireRole(event, ORG_MANAGER_ROLES);

  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/identity/org/invites',
  });
});
