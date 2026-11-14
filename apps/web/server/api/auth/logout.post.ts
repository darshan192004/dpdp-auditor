import { callOrchestrator } from '../../utils/orchestrator';

/**
 * POST /api/auth/logout — docs/api.md §8 / security.md §3.1.
 *
 * Revokes the server-side session record first, then clears the cookie. A
 * failed revoke must not trap the user in a signed-in shell, so the cookie is
 * always cleared.
 */
export default defineEventHandler(async (event) => {
  const { sessionId } = await getUserSession(event);

  if (typeof sessionId === 'string' && sessionId !== '') {
    try {
      await callOrchestrator(event, {
        method: 'DELETE',
        path: `/internal/v1/identity/sessions/${encodeURIComponent(sessionId)}`,
      });
    } catch {
      // Best effort: the cookie is cleared below either way.
    }
  }

  await clearUserSession(event);
  setResponseStatus(event, 204);
});
