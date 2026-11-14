import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * POST /api/v1/org/members — docs/api.md §7.3.
 *
 * Adds an existing account by email (unknown emails need the invitation flow,
 * P2-D). Owner/admin only; the orchestrator re-checks the role and the
 * owner-grant rule.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const body = await readBody(event).catch(() => undefined);

  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/identity/org/members',
    body,
  });
});
