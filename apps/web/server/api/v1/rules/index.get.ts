import { parseRulesQuery } from '~~/shared/rules';

/**
 * GET /api/v1/rules — docs/api.md §7.1.
 *
 * Fixtures answer only when explicitly enabled *and* no orchestrator is
 * configured, so a stray flag in a deployed environment still talks to the
 * real service. Everything else is the HMAC internal call.
 */
export default defineEventHandler(async (event) => {
  const query = parseRulesQuery(getQuery(event) as Record<string, unknown>);

  if (fixturesEnabled() && useRuntimeConfig(event).orchestratorUrl === '') {
    return listFixtureRules(query);
  }

  const params = new URLSearchParams();
  if (query.section !== null) params.set('section', query.section);
  if (query.scanner !== null) params.set('scanner', query.scanner);
  // The catalog is small; one page keeps section counts and client-side
  // filtering consistent with the API's pagination contract.
  params.set('page', '1');
  params.set('pageSize', '100');

  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/rules?${params.toString()}`,
  });
});
