import { createError, defineEventHandler, getQuery, readRawBody } from 'h3';

// Same-origin PostHog proxy (security.md §11.4: "PostHog uses a proxy").
// The browser only ever talks to `/api/ingest`; the vendor host stays in
// server-side config, out of CSP and the client bundle.
const POSTHOG_HOST = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
const ALLOWED_METHODS = new Set(['GET', 'POST']);

export default defineEventHandler(async (event) => {
  if (!ALLOWED_METHODS.has(event.method)) {
    throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  // Strip the mount prefix, then force a single leading slash: `//host` (or
  // `\\host`, which WHATWG normalises to `//`) would make `new URL()` swap the
  // origin — open-proxy SSRF.
  const subPath = event.path
    .replace(/^\/api\/ingest/, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '/');
  const target = new URL(subPath, POSTHOG_HOST);
  for (const [key, value] of Object.entries(getQuery(event))) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }

  const raw = event.method === 'POST' ? await readRawBody(event) : undefined;
  const response = await fetch(target, {
    method: event.method,
    headers: { 'content-type': 'application/json' },
    // `readRawBody` may hand back a Buffer (not a `BodyInit`), and
    // exactOptionalPropertyTypes forbids an explicit `body: undefined`.
    ...(raw !== undefined ? { body: typeof raw === 'string' ? raw : new Uint8Array(raw) } : {}),
  });

  return await response.text();
});
