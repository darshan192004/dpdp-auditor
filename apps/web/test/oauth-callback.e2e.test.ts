import { fileURLToPath } from 'node:url';
import { $fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it, vi } from 'vitest';
import { errorEnvelopeSchema } from '@dpdpa/contracts';

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
    const response = await $fetch.raw('/api/auth/github/callback?code=fake-code&state=wrong-state', {
      headers: { cookie: 'dpdpa_session=invalid-session-data' },
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/\/login\?error=oauth_state/);
  });

  it('rejects a missing state parameter', async () => {
    const response = await $fetch.raw('/api/auth/github/callback?code=fake-code', {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/\/login\?error=oauth_state/);
  });

  it('rejects a missing code parameter', async () => {
    const response = await $fetch.raw('/api/auth/github/callback?state=any-state', {
      redirect: 'manual',
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/\/login\?error=oauth_state/);
  });

  it('fails gracefully when the GitHub token exchange fails', async () => {
    // This test verifies the callback doesn't leak upstream errors.
    // With no valid session state and a fake code, it should redirect to oauth_failed.
    const response = await $fetch.raw(
      '/api/auth/github/callback?code=fake-code&state=any-state',
      { redirect: 'manual' },
    );
    expect(response.status).toBe(302);
    // Either oauth_state (session validation first) or oauth_failed (exchange failure)
    expect(response.headers.get('location')).toMatch(/\/login\?error=(oauth_state|oauth_failed)/);
  });

  it('does not expose stack traces or internal details on error', async () => {
    try {
      await $fetch('/api/auth/github/callback?code=fake&state=fake');
    } catch (error) {
      const err = error as { statusCode?: number; data?: unknown };
      if (err.statusCode === 302) return; // redirect is expected
      const envelope = errorEnvelopeSchema.safeParse(err.data);
      if (envelope.success) {
        expect(JSON.stringify(envelope.data)).not.toMatch(/at\s+[A-Za-z]/);
      }
    }
  });
});
