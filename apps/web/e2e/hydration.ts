import type { Page } from '@playwright/test';

/**
 * Nuxt hydrates asynchronously in dev. Until the client router takes over, a
 * `NuxtLink` is just an anchor: clicking it performs a full SSR document load,
 * whose BFF calls happen inside the server and therefore never cross the
 * browser network stack. `page.route()` cannot intercept those calls.
 *
 * Waiting for network idle lets hydration and the router settle, so link
 * clicks become client-side navigations and reactive handlers are attached.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
