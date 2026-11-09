import { fileURLToPath } from 'node:url';
import { setup, url } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';

// e2e-style test: builds the app and starts a real Nitro server, then asserts
// on the wire headers. Kept in the `e2e` Vitest project (node environment)
// because `setup()` cannot run inside the Nuxt test environment.
await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  server: true,
  build: true,
});

/** Parses a CSP header into a directive -> value map. */
function parseCsp(header: string | null): Map<string, string> {
  const directives = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split(/\s+/);
    if (name) directives.set(name.toLowerCase(), rest.join(' '));
  }
  return directives;
}

async function headersFor(path: string): Promise<Headers> {
  const response = await fetch(url(path), { redirect: 'manual' });
  expect(response.status).toBe(200);
  return response.headers;
}

describe('security headers (security.md §8)', () => {
  it('sends transport, framing, sniffing, referrer and cross-origin headers', async () => {
    const headers = await headersFor('/');

    expect(headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('denies powerful browser features via Permissions-Policy', async () => {
    const headers = await headersFor('/');
    const policy = headers.get('permissions-policy') ?? '';

    expect(policy).toContain('camera=()');
    expect(policy).toContain('geolocation=()');
  });

  it('sends a nonce-based CSP with strict-dynamic and no inline script exception', async () => {
    const headers = await headersFor('/');
    const csp = headers.get('content-security-policy');
    expect(csp).toBeTruthy();

    const directives = parseCsp(csp);
    expect(directives.get('default-src')).toBe("'self'");
    expect(directives.get('frame-ancestors')).toBe("'none'");

    const scriptSrc = directives.get('script-src') ?? '';
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toMatch(/nonce-[A-Za-z0-9+/=_-]+/);
    expect(scriptSrc).not.toContain("'unsafe-inline'");

    // Documented exception: Vue scoped styles and Nuxt UI inject inline styles.
    expect(directives.get('style-src') ?? '').toContain("'unsafe-inline'");
  });
});
