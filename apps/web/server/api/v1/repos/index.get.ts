import { fixtureRepoList } from '../../../utils/fixtures/repos';
import { fixturesAnswer } from '../../../utils/org-request';

/**
 * GET /api/v1/repos — docs/api.md §5.1.
 * List active repositories. Role: viewer+.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) return { data: fixtureRepoList() };

  requireIdentity(event);
  const query = getQuery(event);
  const params = new URLSearchParams();
  if (typeof query.page === 'string') params.set('page', query.page);
  if (typeof query.pageSize === 'string') params.set('pageSize', query.pageSize);
  const qs = params.toString();
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/repos${qs ? `?${qs}` : ''}`,
  });
});
