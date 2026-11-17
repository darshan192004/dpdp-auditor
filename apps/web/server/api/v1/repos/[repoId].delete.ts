import { ORG_MANAGER_ROLES } from '~~/shared/org';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * DELETE /api/v1/repos/:repoId — docs/api.md §5.5.
 *
 * Soft delete; revokes future scans and schedules data retention. Role: admin+.
 * A scan in progress blocks the disconnect unless `?force=true` is passed.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) {
    apiError(event, 403, 'FORBIDDEN', 'Write operations are not available in fixture mode.');
  }

  requireRole(event, ORG_MANAGER_ROLES);
  const repoId = getRouterParam(event, 'repoId') ?? '';
  const query = getQuery(event);
  const force = query.force === 'true';

  setResponseStatus(event, 204);
  return callOrchestrator(event, {
    method: 'DELETE',
    path: `/internal/v1/repos/${encodeURIComponent(repoId)}${force ? '?force=true' : ''}`,
  });
});
