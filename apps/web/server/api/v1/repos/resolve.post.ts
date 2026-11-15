import { apiError } from '../../../utils/api-error';
import { fixtureResolvedRepo } from '../../../utils/fixtures/repos';
import { fixturesAnswer } from '../../../utils/org-request';
import { RepoInputError, validateResolveInput } from '~~/shared/repo';

/**
 * POST /api/v1/repos/resolve — docs/api.md §5.2.
 * Preview a GitHub URL before save (default branch, size, visibility).
 * Role: auditor+ (resolve is a read operation).
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) return { data: fixtureResolvedRepo() };

  const { role } = requireIdentity(event);
  if (!['owner', 'admin', 'auditor'].includes(role)) {
    apiError(event, 403, 'FORBIDDEN', 'Insufficient permissions.');
  }

  const raw = await readBody(event);
  try {
    validateResolveInput(raw);
  } catch (error) {
    if (error instanceof RepoInputError) {
      apiError(event, 422, 'VALIDATION_ERROR', error.message, [
        { path: error.path, message: error.message },
      ]);
    }
    throw error;
  }

  return callOrchestrator(event, {
    method: 'POST',
    path: '/internal/v1/repos/resolve',
    body: raw,
  });
});
