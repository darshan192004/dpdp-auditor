import { createError } from 'h3';

import { fixturesEnabled } from '../utils/fixtures/guard';
import {
  SESSION_COOKIE_NAME,
  fetchResolvedSession,
  sessionIdentity,
  type ResolvedSession,
} from '../utils/session';

/**
 * Server-side session resolution (docs/security.md §3.1).
 *
 * Runs only for API and app routes so static assets never hit the
 * orchestrator. The sealed cookie carries an opaque session id; the
 * orchestrator decides whether that id may still act.
 */
export default defineEventHandler(async (event) => {
  if (fixturesEnabled()) return;

  const path = event.path;
  const needsSession = path.startsWith('/app') || path.startsWith('/api/');
  if (!needsSession || path.startsWith('/api/auth/')) return;

  // No cookie means an anonymous request. Bail out before touching the
  // session seal: otherwise every public request would mint and set a
  // throwaway cookie (and fail when no `appSecret` is configured).
  if (!getCookie(event, SESSION_COOKIE_NAME)) return;

  let sessionId: unknown;
  let resolved: ResolvedSession | null = null;
  try {
    ({ sessionId, user } = await getUserSession(event));
    if (typeof sessionId === 'string' && sessionId !== '') {
      resolved = await fetchResolvedSession(event, sessionId);
    }
  } catch {
    // Corrupt cookie or missing app secret: fail closed, never 500 the app.
    resolved = null;
  }

  if (resolved === null) {
    // Expired, revoked, or unverifiable: drop the cookie and continue signed out.
    await clearUserSession(event).catch(() => undefined);
    return;
  }

  const identity = sessionIdentity(resolved);
  event.context.session = resolved;
  event.context.userId = identity.userId;
  if (identity.orgId !== null) event.context.orgId = identity.orgId;

  // Forced first-login rotation: a seeded account cannot use any API except
  // `/api/v1/me` (needed to hydrate) until it has replaced its temporary
  // password. `/api/auth/*` is exempt earlier in this middleware.
  const mustRotate = (user as unknown as { mustChangePassword?: boolean } | undefined)
    ?.mustChangePassword;
  if (path.startsWith('/api/') && path !== '/api/v1/me' && mustRotate === true) {
    throw createError({ statusCode: 403, statusMessage: 'Password change required.' });
  }
});
