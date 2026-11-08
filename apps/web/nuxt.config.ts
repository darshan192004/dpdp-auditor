// Nuxt 4 config — see docs/design.md (framework pin) and docs/security.md §8 (headers, added in P1-23).
export default defineNuxtConfig({
  modules: ['nuxt-security', '@nuxt/ui'],

  css: ['~/assets/css/main.css'],

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
    sessionPassword: process.env.NUXT_SESSION_PASSWORD ?? '',
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? '',
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
    routeRules: {
      '/api/**': { cors: false },
      '/app/**': { headers: { 'cache-control': 'no-store' } },
    },
  },

  compatibilityDate: '2026-11-06',
});
