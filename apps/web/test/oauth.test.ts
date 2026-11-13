import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_SCOPE,
  buildAuthorizeUrl,
  callbackUrl,
  createOAuthState,
  createPkcePair,
  fetchGithubIdentity,
  pickVerifiedEmail,
  safeRedirect,
} from '../server/utils/oauth';

describe('GitHub OAuth helpers (security.md §3.1)', () => {
  it('requests identity scopes only and uses S256 PKCE', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-1',
        redirectUri: 'https://app.example/api/auth/github/callback',
        state: 'state-1',
        codeChallenge: 'challenge-1',
      }),
    );

    expect(GITHUB_SCOPE).toBe('read:user user:email');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('derives a 43-character verifier and a matching S256 challenge', () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).not.toBe(verifier);
  });

  it('creates unpredictable state values', () => {
    const first = createOAuthState();
    const second = createOAuthState();
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(first).not.toBe(second);
  });

  it('only accepts same-origin absolute redirect paths', () => {
    expect(safeRedirect('/app/scans')).toBe('/app/scans');
    expect(safeRedirect(undefined)).toBe('/app');
    expect(safeRedirect('')).toBe('/app');
    expect(safeRedirect('https://evil.example')).toBe('/app');
    expect(safeRedirect('//evil.example')).toBe('/app');
    expect(safeRedirect('/\\evil.example')).toBe('/app');
    expect(safeRedirect(42)).toBe('/app');
  });

  it('builds the callback URL from the configured app URL or the request origin', () => {
    expect(callbackUrl('https://app.example/', 'http://localhost:3000')).toBe(
      'https://app.example/api/auth/github/callback',
    );
    expect(callbackUrl('', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/auth/github/callback',
    );
  });

  it('requires a verified email and prefers the primary one', () => {
    expect(
      pickVerifiedEmail([
        { email: 'secondary@example.com', primary: false, verified: true },
        { email: 'primary@example.com', primary: true, verified: true },
      ]),
    ).toBe('primary@example.com');
    expect(
      pickVerifiedEmail([{ email: 'unverified@example.com', primary: true, verified: false }]),
    ).toBeNull();
  });

  it('normalises the GitHub profile and rejects an unverified identity', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ id: 42, login: 'asha', name: 'Asha', avatar_url: null })
      .mockResolvedValueOnce([{ email: 'asha@example.com', primary: true, verified: true }]);

    await expect(fetchGithubIdentity('token', { fetch })).resolves.toEqual({
      githubUserId: 42,
      email: 'asha@example.com',
      name: 'Asha',
      avatarUrl: null,
    });

    fetch
      .mockResolvedValueOnce({ id: 42, login: 'asha', name: 'Asha', avatar_url: null })
      .mockResolvedValueOnce([{ email: 'asha@example.com', primary: true, verified: false }]);

    await expect(fetchGithubIdentity('token', { fetch })).rejects.toThrow(
      'github_email_unverified',
    );
  });
});
