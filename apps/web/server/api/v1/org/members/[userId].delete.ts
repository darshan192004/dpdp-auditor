import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * DELETE /api/v1/org/members/:userId — docs/api.md §7.3.
 *
 * Owner/admin only. The orchestrator keeps the last active owner in place.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const userId = getRouterParam(event, 'userId') ?? '';

  return callOrchestrator(event, {
    method: 'DELETE',
    path: `/internal/v1/identity/org/members/${encodeURIComponent(userId)}`,
  });
});
