import { expect, test } from '@playwright/test';

// Smoke coverage from docs/superpowers/plans/2026-11-06-phase-1-web-foundation.md:
// landing loads, skip-link keyboard flow, health surface, zero CSP noise.

test('landing page loads with a visible h1', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(/DPDPA/);
});

test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="#main"]')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('GET /health answers 200 with the status contract', async ({ request }) => {
  const healthResponse = await request.get('/health');
  expect(healthResponse.status()).toBe(200);

  const api = await request.get('/api/health');
  expect(api.status()).toBe(200);
  expect(api.headers()['content-type']).toContain('application/json');
  const body = await api.json();
  expect(body).toHaveProperty('status');
});

test('skip link works on the console shell too', async ({ page }) => {
  await page.goto('/app');

  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="#main"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('no CSP violations in the console on /, /app and /health', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));

  await page.goto('/');
  await page.goto('/app');
  // The e2e harness runs with NUXT_FIXTURES=1, so the fixture session seeds the
  // org context and the guard admits /app. The redirect table itself is covered
  // by test/resolve-route-access.test.ts.
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await page.goto('/health');
  await expect(page.getByRole('heading', { level: 1, name: 'Health' })).toBeVisible();

  const cspNoise = consoleMessages.filter((text) => text.includes('Content Security Policy'));
  expect(cspNoise).toEqual([]);
});
