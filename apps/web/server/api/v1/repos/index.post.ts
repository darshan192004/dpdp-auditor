import { apiError } from '../../../utils/api-error';
import { fixturesAnswer } from '../../../utils/org-request';
import { RepoInputError, validateSaveInput } from '~~/shared/repo';

/**
 * POST /api/v1/repos — docs/api.md §5.3.
 * Save a validated public repo URL. Role: admin+.
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Write operations are not available in fixture mode.');
  }

  const { role } = requireIdentity(event);
  if (!['owner', 'admin'].includes(role)) {
    apiError(event, 403, 'FORBIDDEN', 'Insufficient permissions.');
  }

  const raw = await readBody(event);
  try {
    validateSaveInput(raw);
  } catch (error) {
    if (error instanceof RepoInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  setResponseStatus(event, 201);
  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/repos',
    body: raw,
  });
});
