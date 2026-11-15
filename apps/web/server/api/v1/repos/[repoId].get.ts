import { fixtureRepoDetail } from '../../../utils/fixtures/repos';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * GET /api/v1/repos/:repoId — docs/api.md §5.4.
 * Repository detail plus scan statistics. Role: viewer+.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) return { data: fixtureRepoDetail() };

  requireIdentity(event);
  const repoId = getRouterParam(event, 'repoId') ?? '';

  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/repos/${encodeURIComponent(repoId)}`,
  });
});
