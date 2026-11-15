import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * DELETE /api/v1/api-keys/:keyId — docs/api.md §7.5.
 *
 * Revoke an API key. Owner/admin only.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const keyId = getRouterParam(event, 'keyId');

  if (!keyId) {
    apiError(event, 422, 'VALIDATION_ERROR', 'API key ID is required.');
  }

  await callOrchestrator(event, {
    method: 'DELETE',
    path: `/internal/v1/identity/org/api-keys/${keyId}`,
  });

  setResponseStatus(event, 204);
});
