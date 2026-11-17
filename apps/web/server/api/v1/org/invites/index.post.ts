import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { InviteInputError, parseInviteInput } from '~~/shared/invite';
import { fixturesAnswer } from '../../../../utils/org-request';

/**
 * POST /api/v1/org/invites — docs/api.md P2-21.
 *
 * Create an invitation for a new or existing user. Owner/admin only.
 * Returns either an immediate membership (existing user) or a token (new email).
 */
export default defineEventHandler(async (event) => {
  const fixtures = fixturesAnswer(event);
  if (fixtures) {
    apiError(event, 403, 'FORBIDDEN', 'Your role cannot perform this action.');
  }

  requireRole(event, ORG_MANAGER_ROLES);

  let body: unknown;
  try {
    body = await readBody(event);
    parseInviteInput(body);
  } catch (error) {
    if (error instanceof InviteInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/identity/org/invites',
    body,
  });
});
