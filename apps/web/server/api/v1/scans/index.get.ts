import { fixturesAnswer } from '../../../utils/org-request';

/**
 * GET /api/v1/scans - docs/api.md A3.4.
 * List scans for the org with filters and pagination. Role: viewer+.
 */
export default defineEventHandler((event) => {
  if (fixturesAnswer(event)) {
    const status = getQuery(event).status;
    return { data: fixtureScanList(status as string | string[] | undefined) };
  }

  requireIdentity(event);
  const query = getQuery(event);
  const params = new URLSearchParams();
  if (typeof query.repositoryId === 'string') params.set('repositoryId', query.repositoryId);
  if (typeof query.status === 'string') params.set('status', query.status);
  if (Array.isArray(query.status)) query.status.forEach((s) => params.append('status', s));
  if (typeof query.from === 'string') params.set('from', query.from);
  if (typeof query.to === 'string') params.set('to', query.to);
  if (typeof query.page === 'string') params.set('page', query.page);
  if (typeof query.pageSize === 'string') params.set('pageSize', query.pageSize);
  if (typeof query.sort === 'string') params.set('sort', query.sort);
  const qs = params.toString();
  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans${qs ? `?${qs}` : ''}`,
  });
});
