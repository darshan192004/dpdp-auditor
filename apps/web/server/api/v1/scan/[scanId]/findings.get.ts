import { parseFindingsQuery } from '~~/shared/findings-query';
import type { FindingsFilters } from '~~/shared/findings';

/**
 * GET /api/v1/scan/:scanId/findings — docs/api.md §4.1.
 *
 * Fixtures answer only when explicitly enabled *and* no orchestrator is
 * configured, so a stray flag in a deployed environment still talks to the
 * real service. Everything else is the HMAC internal call.
 */
function toQueryString(filters: FindingsFilters): string {
  const params = new URLSearchParams();
  for (const value of filters.severity) params.append('severity', value);
  for (const value of filters.scanner) params.append('scanner', value);
  for (const value of filters.section) params.append('section', value);
  for (const value of filters.status) params.append('status', value);
  if (filters.file !== '') params.set('file', filters.file);
  if (filters.q !== '') params.set('q', filters.q);
  params.set('sort', filters.sort);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return params.toString();
}

export default defineEventHandler(async (event) => {
  const scanId = getRouterParam(event, 'scanId') ?? '';
  const filters = parseFindingsQuery(getQuery(event) as Record<string, unknown>);

  if (fixturesEnabled() && useRuntimeConfig(event).orchestratorUrl === '') {
    try {
      return listFixtureFindings(filters, scanId);
    } catch (error) {
      if (error instanceof FixtureNotFoundError) {
        apiError(event, 404, 'NOT_FOUND', error.message);
      }
      throw error;
    }
  }

  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/scans/${scanId}/findings?${toQueryString(filters)}`,
  });
});
