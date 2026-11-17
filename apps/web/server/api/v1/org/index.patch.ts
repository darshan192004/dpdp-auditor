import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * PATCH /api/v1/org — docs/api.md §7.2.
 *
 * Owner/admin only. The body is forwarded verbatim so the orchestrator remains
 * the single validator and can answer `403` for plan/data-region changes.
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    // The fixture session is an auditor, so the real role gate is the honest
    // answer; there is no writable fixture state to mutate.
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const body = await readBody(event).catch(() => undefined);

  return callOrchestrator(event, {
    method: 'PATCH',
    path: '/internal/v1/identity/org',
    body,
  });
});
