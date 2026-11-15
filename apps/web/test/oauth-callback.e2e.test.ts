import { fileURLToPath } from 'node:url';
import { $fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';

// Sessions are sealed with `appSecret` (security.md §3.1). Production builds do
// not generate one, so the e2e harness supplies a throwaway 32+ character value.
const APP_SECRET = 'e2e-app-secret-0123456789abcdef0123456789';
process.env.NUXT_APP_SECRET = APP_SECRET;

// Builds the app and boots a real Nitro server, then tests the OAuth callback
// endpoint for security properties (P2-H / P2-19).
await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  server: true,
  build: true,
  env: { NUXT_APP_SECRET: APP_SECRET },
});

describe('OAuth callback security (P2-H)', () => {
  it('rejects a state mismatch with a generic redirect', async () => {
    // The callback expects state in the query to match the sealed session's oauthState.
    // A mismatch should redirect to /login?error=oauth_state without leaking details.
    const response = await $fetch('/api/auth/github/callback?code=abc&state=bogus', {
      method: 'GET',
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers?.get('location')?.includes('/login')).toBe(true);
  });

  it('rejects missing code parameter', async () => {
    const response = await $fetch('/api/auth/github/callback?state=valid', {
      method: 'GET',
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers?.get('location')?.includes('/login')).toBe(true);
  });

  it('rejects expired or missing session state', async () => {
    // Without an active session containing oauthState, the callback should fail.
    const response = await $fetch('/api/auth/github/callback?code=abc&state=xyz', {
      method: 'GET',
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers?.get('location')?.includes('/login')).toBe(true);
  });
});
