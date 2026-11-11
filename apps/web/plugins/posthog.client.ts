import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports';

/**
 * PostHog onboarding (docs/tasks.md P1-32; PRD §7, security.md §11.4).
 *
 * - Events go through the same-origin Nitro proxy (`/api/ingest`) so the
 *   PostHog host never appears in CSP or the client bundle (security.md
 *   "PostHog uses a proxy").
 * - `sendDefaultPii: false` + property scrubbing: no email/IP/UA identity.
 * - `autocapture` off on authenticated app routes (security.md): only
 *   explicit `capture()` calls and pageviews leave the browser.
 * - No key (dev/CI) → SDK never loads.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const apiKey = config.public.posthogKey;
  if (!apiKey) return;

  const router = useRouter();
  let posthog: import('posthog-js').default | null = null;
  let previousPath = router.currentRoute.value.fullPath;

  void import('posthog-js').then((module) => {
    posthog = module.default;
    posthog.init(apiKey, {
      api_host: '/api/ingest',
      send_default_pii: false,
      // Mask all input values and text content that autocapture might see.
      mask_all_text: true,
      mask_all_element_attributes: true,
      // Explicit capture only; no DOM/form scraping on authed pages.
      autocapture: false,
      capture_pageview: false,
      sanitize_properties: scrubPosthogProperties,
    });
    posthog.capture('$pageview', { path: previousPath });
  });

  router.afterEach((to) => {
    if (!posthog || to.fullPath === previousPath) return;
    previousPath = to.fullPath;
    posthog.capture('$pageview', { path: to.fullPath });
  });

  nuxtApp.hook('app:mounted', () => {
    // Re-fire for the initial hydration route if the SDK loaded late.
    if (posthog) posthog.capture('$pageview', { path: previousPath });
  });
});

const PII_KEY_PATTERN =
  /(email|phone|password|secret|token|authorization|cookie|session|ip|distinct_id|\$ip)/i;

/** Strip PII-shaped properties before they reach the PostHog API. */
export function scrubPosthogProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_KEY_PATTERN.test(key)) continue;
    out[key] = value;
  }
  return out;
}
