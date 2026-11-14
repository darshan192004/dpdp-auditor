import { createHash, randomBytes } from 'node:crypto';
import { $fetch } from 'ofetch';

/** docs/security.md §3.1: identity-only scopes; never request `repo`. */
export const GITHUB_SCOPE = 'read:user user:email';
export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_API_URL = 'https://api.github.com';

export interface AuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/** S256 PKCE + signed `state` (docs/security.md §3.1). */
export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', GITHUB_SCOPE);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** RFC 7636 verifier (43 chars from 32 bytes) and its S256 challenge. */
export function createPkcePair(random: (size: number) => Buffer = randomBytes): {
  verifier: string;
  challenge: string;
} {
  const verifier = random(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function createOAuthState(random: (size: number) => Buffer = randomBytes): string {
  return random(16).toString('base64url');
}

/**
 * Only same-origin absolute paths survive. Protocol-relative (`//evil`) and
 * absolute URLs are dropped to `/app` so `?redirect=` can never open-redirect.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '/app';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/app';
  return value;
}

/** Prefer `NUXT_PUBLIC_APP_URL`; fall back to the request origin for local dev. */
export function callbackUrl(appUrl: string, requestOrigin: string): string {
  const base = appUrl.trim() === '' ? requestOrigin : appUrl.trim().replace(/\/+$/, '');
  return `${base}/api/auth/github/callback`;
}

export interface GithubUserResponse {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
}

export interface GithubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
}

/** A verified email is required; an unverified one would allow account takeover. */
export function pickVerifiedEmail(emails: GithubEmailResponse[]): string | null {
  return (
    emails.find((entry) => entry.primary && entry.verified)?.email ??
    emails.find((entry) => entry.verified)?.email ??
    null
  );
}

export interface GithubIdentity {
  githubUserId: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

export interface ExchangeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface GithubDeps {
  fetch: typeof $fetch;
}

/**
 * Exchanges the authorization code using the PKCE verifier. Throws on any
 * failure; the caller maps it to a generic sign-in error (no upstream detail).
 */
export async function exchangeGithubCode(
  input: ExchangeInput,
  deps: Partial<GithubDeps> = {},
): Promise<string> {
  const fetch = deps.fetch ?? $fetch;
  const response = await fetch<TokenResponse>(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (typeof response.access_token !== 'string' || response.access_token === '') {
    throw new Error('github_token_exchange_failed');
  }
  return response.access_token;
}

/** Reads `/user` + `/user/emails` and normalises to the upsert contract. */
export async function fetchGithubIdentity(
  accessToken: string,
  deps: Partial<GithubDeps> = {},
): Promise<GithubIdentity> {
  const fetch = deps.fetch ?? $fetch;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };

  const [user, emails] = await Promise.all([
    fetch<GithubUserResponse>(`${GITHUB_API_URL}/user`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    }),
    fetch<GithubEmailResponse[]>(`${GITHUB_API_URL}/user/emails`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  const email = pickVerifiedEmail(emails);
  if (email === null) throw new Error('github_email_unverified');

  return {
    githubUserId: user.id,
    email,
    name: (user.name ?? user.login).trim().slice(0, 120),
    avatarUrl: user.avatar_url ?? null,
  };
}
