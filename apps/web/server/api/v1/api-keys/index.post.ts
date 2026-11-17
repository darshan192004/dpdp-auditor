import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { ApiKeyInputError, parseCreateApiKey } from '~~/shared/api-key';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * POST /api/v1/api-keys — docs/api.md §7.5.
 *
 * Create an API key. Owner/admin only. Returns the plaintext key exactly once.
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
    parseCreateApiKey(body);
  } catch (error) {
    if (error instanceof ApiKeyInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/identity/org/api-keys',
    body,
  });
});
