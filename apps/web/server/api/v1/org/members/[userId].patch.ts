import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * PATCH /api/v1/org/members/:userId — docs/api.md §7.3.
 *
 * Owner/admin only. The orchestrator enforces that only owners can change an
 * owner or grant the owner role.
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const userId = getRouterParam(event, 'userId') ?? '';
  const body = await readBody(event).catch(() => undefined);

  return callOrchestrator(event, {
    method: 'PATCH',
    path: `/internal/v1/identity/org/members/${encodeURIComponent(userId)}`,
    body,
  });
});
