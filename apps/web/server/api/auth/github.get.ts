import { getRequestURL, sendRedirect } from 'h3';
import { apiError } from '../../utils/api-error';
import {
  buildAuthorizeUrl,
  callbackUrl,
  createOAuthState,
  createPkcePair,
  safeRedirect,
} from '../../utils/oauth';

/**
 * GET /api/auth/github — docs/api.md §8 / security.md §3.1.
 *
 * PKCE verifier and `state` live in the sealed, server-only session so the
 * callback can prove the response belongs to this browser. Scope is identity
 * only; no repository access is ever requested.
 */
export default defineEventHandler(async (event) => {
  const runtime = useRuntimeConfig(event);
  const clientId = runtime.oauth.github.clientId ?? '';
  if (clientId === '') {
    apiError(event, 500, 'INTERNAL_ERROR', 'GitHub sign-in is not configured.');
  }

  const redirect = safeRedirect(getQuery(event).redirect);
  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();

  await setUserSession(event, {
    secure: { oauthState: state, oauthVerifier: verifier, oauthRedirect: redirect },
  });

  return sendRedirect(
    event,
    buildAuthorizeUrl({
      clientId,
      redirectUri: callbackUrl(runtime.public.appUrl, getRequestURL(event).origin),
      state,
      codeChallenge: challenge,
    }),
    302,
  );
});
