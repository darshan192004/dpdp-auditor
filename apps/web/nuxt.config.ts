// Nuxt 4 config — see docs/design.md (framework pin) and docs/security.md §8 (headers, added in P1-23).
// Nuxt 4 config — see docs/design.md (framework pin) and docs/security.md §8 (headers, added in P1-23).
const isProduction = process.env.NODE_ENV === 'production';
// security.md §3.1: `__Host-` requires Secure + Path=/ + no Domain, so it is
// only valid when production cookies are HTTPS-only.
const sessionCookieName = isProduction ? '__Host-dpdpa_session' : 'dpdpa_session';

export default defineNuxtConfig({
  modules: ['nuxt-security', '@nuxt/ui', 'nuxt-auth-utils'],

  css: ['~/assets/css/main.css'],

  // Document-level a11y and identity (design §9; axe `document-title` and
  // `html-has-lang` are serious violations on every public page).
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'DPDPA Auditor',
    },
  },

  typescript: {
    strict: true,
  },

  devtools: {
    enabled: false,
  },

  runtimeConfig: {
    // Server-only. Values come from the environment; no secrets in the repo.
    orchestratorUrl: process.env.ORCHESTRATOR_URL ?? '',
    orchestratorHmacKey: process.env.ORCHESTRATOR_HMAC_KEY ?? '',
    orchestratorInternalKey: process.env.ORCHESTRATOR_INTERNAL_KEY ?? '',
    // nuxt-auth-utils seals the cookie with Nuxt's `appSecret` (`NUXT_APP_SECRET`).
    // security.md §3.1: 8 h absolute; the 30 min idle timeout is server-side.
    session: {
      name: sessionCookieName,
      maxAge: 60 * 60 * 8,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
      },
    },
    oauth: {
      github: {
        clientId: process.env.NUXT_OAUTH_GITHUB_CLIENT_ID ?? '',
        clientSecret: process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET ?? '',
      },
    },
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
      // P1-32: empty in dev/CI → telemetry plugins never load.
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN ?? '',
      posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY ?? '',
    },
  },

  security: {
    // ---------- Response headers (security.md §8) ----------
    headers: {
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubdomains: true,
        preload: true,
      },
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
      },
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        // Exception: Vue scoped styles and Nuxt UI inject inline style attributes.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https://avatars.githubusercontent.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'https://*.sentry.io', 'https://*.posthog.com'],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': true,
      },
    },

    // ---------- CORS (security.md §8) ----------
    corsHandler: {
      origin: ['https://app.dpdpa-auditor.example'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
      exposeHeaders: [
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      credentials: true,
      // nuxt-security types this as a string; `cors` writes it verbatim to
      // Access-Control-Max-Age, so the wire value is still 600.
      maxAge: '600',
    },

    // §8.1 route-level rate limits need the shared Redis store (P1-08/P1-18),
    // so the §8 rateLimiter block is intentionally deferred with them.
    hidePoweredBy: true,
    removeLoggers: true,
  },

  nitro: {
    // Every non-2xx response uses the docs/api.md §1.4 envelope. `~~` is the
    // Nuxt root alias (the `~` alias points at `app/` in Nuxt 4).
    errorHandler: '~~/server/error-handler.ts',
    routeRules: {
      '/api/**': { cors: false },
      '/app/**': { headers: { 'cache-control': 'no-store' } },
      // Hashed build assets never change under the same URL (docs/security.md §8).
      '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    },
  },

  compatibilityDate: '2026-11-06',
});
