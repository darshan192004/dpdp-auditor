import { fixturesAnswer } from '../../../utils/org-request';

/**
 * GET /api/v1/api-keys — docs/api.md §7.5.
 *
 * List API keys for the current org. Any active member may read the list.
 */
export default defineEventHandler(async (event) => {
  if (fixturesAnswer(event)) return { data: [] };

  requireIdentity(event);
  return callOrchestrator(event, {
    method: 'GET',
    path: '/internal/v1/identity/org/api-keys',
  });
});
