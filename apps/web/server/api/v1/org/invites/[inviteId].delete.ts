import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * DELETE /api/v1/org/invites/:inviteId — docs/api.md P2-21.
 *
 * Revoke a pending invitation. Owner/admin only.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const inviteId = getRouterParam(event, 'inviteId');

  if (!inviteId) {
    apiError(event, 422, 'VALIDATION_ERROR', 'Invite ID is required.');
  }

  await callOrchestrator(event, {
    method: 'DELETE',
    path: `/internal/v1/identity/org/invites/${inviteId}`,
  });

  setResponseStatus(event, 204);
});
