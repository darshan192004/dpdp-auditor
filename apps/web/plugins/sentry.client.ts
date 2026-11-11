import { defineNuxtPlugin, useRuntimeConfig } from '#imports';

/**
 * Sentry onboarding (docs/tasks.md P1-32; PRD §7, security.md §11.4).
 *
 * - `sendDefaultPii: false` (PRD): no IP/user-identifying data by default.
 * - `beforeSend` scrubs anything PII-shaped that slips into the payload
 *   (emails, tokens, cookies, auth headers) before it leaves the browser.
 * - No DSN (dev/CI) → SDK never loads.
 */
export default defineNuxtPlugin(async () => {
  const dsn = useRuntimeConfig().public.sentryDsn;
  if (!dsn) return;

  const Sentry = await import('@sentry/vue');
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    environment: import.meta.dev ? 'development' : 'production',
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
});

const PII_KEY_PATTERN =
  /(email|phone|password|secret|token|authorization|cookie|session|id_?card|aadhaar|pan_?number)/i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Drop PII-shaped keys and email-looking strings anywhere in the event. */
export function scrubSentryEvent<E>(event: E): E {
  return scrubValue(event) as E;
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (PII_KEY_PATTERN.test(key)) continue;
      out[key] = scrubValue(entry);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(EMAIL_PATTERN, '[redacted-email]');
  return value;
}
