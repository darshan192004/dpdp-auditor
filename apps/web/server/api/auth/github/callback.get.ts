import { getRequestURL, sendRedirect } from 'h3';
import { callOrchestrator } from '../../../utils/orchestrator';
import {
  callbackUrl,
  exchangeGithubCode,
  fetchGithubIdentity,
  safeRedirect,
} from '../../../utils/oauth';
import { fetchResolvedSession } from '../../../utils/session';

interface UpsertedUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface CreatedSession {
  id: string;
}

/**
 * GET /api/auth/github/callback — docs/api.md §8 / security.md §3.1.
 *
 * Validates `state` against the sealed session, exchanges the code with the
 * PKCE verifier, upserts the GitHub identity, mints a revocable server-side
 * session, and redirects to the app or onboarding.
 */
export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig(event);
  const { secure } = await getUserSession(event);
  const query = getQuery(event);

  const code = typeof query.code === 'string' ? query.code : null;
  const state = typeof query.state === 'string' ? query.state : null;

  if (
    code === null ||
    state === null ||
    !secure?.oauthState ||
    !secure.oauthVerifier ||
    state !== secure.oauthState
  ) {
    return sendRedirect(event, '/login?error=oauth_state', 302);
  }

  try {
    const accessToken = await exchangeGithubCode({
      clientId: runtime.oauth.github.clientId ?? '',
      clientSecret: runtime.oauth.github.clientSecret ?? '',
      code,
      redirectUri: callbackUrl(runtime.public.appUrl, getRequestURL(event).origin),
      codeVerifier: secure.oauthVerifier,
    });

    const identity = await fetchGithubIdentity(accessToken);

    const { data: user } = await callOrchestrator<{ data: UpsertedUser }>(event, {
      method: 'POST',
      path: '/internal/v1/identity/users/upsert',
      body: identity,
    });

    const { data: session } = await callOrchestrator<{ data: CreatedSession }>(event, {
      method: 'POST',
      path: '/internal/v1/identity/sessions',
      body: { userId: user.id, userAgent: getHeader(event, 'user-agent') ?? null },
    });

    // Rotates the cookie: the temporary OAuth handshake data is dropped here.
    await replaceUserSession(event, {
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });

    // Resolve once so the redirect target is decided server-side, not by a
    // client-side race between the context plugin and the route guard.
    const resolved = await fetchResolvedSession(event, session.id);
    const target =
      resolved !== null && resolved.memberships.length > 0
        ? safeRedirect(secure.oauthRedirect)
        : '/onboarding';

    return sendRedirect(event, target, 302);
  } catch {
    // Never leak GitHub/orchestrator detail to the browser.
    await clearUserSession(event);
    return sendRedirect(event, '/login?error=oauth_failed', 302);
  }
});
