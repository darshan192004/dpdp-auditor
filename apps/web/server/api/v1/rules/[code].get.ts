/**
 * GET /api/v1/rules/:code — docs/api.md §7.1.
 *
 * Fixtures answer only when explicitly enabled *and* no orchestrator is
 * configured, so a stray flag in a deployed environment still talks to the
 * real service. Everything else is the HMAC internal call.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') ?? '';

  if (fixturesEnabled() && useRuntimeConfig(event).orchestratorUrl === '') {
    try {
      return { data: getFixtureRule(code) };
    } catch (error) {
      if (error instanceof FixtureNotFoundError) {
        apiError(event, 404, 'NOT_FOUND', error.message);
      }
      throw error;
    }
  }

  return callOrchestrator(event, {
    method: 'GET',
    path: `/internal/v1/rules/${encodeURIComponent(code)}`,
  });
});
