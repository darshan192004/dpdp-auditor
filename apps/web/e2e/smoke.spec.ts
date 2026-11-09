import { expect, test } from '@playwright/test';

// Smoke coverage from docs/superpowers/plans/2026-11-06-phase-1-web-foundation.md
// Task 7: landing loads, skip-link keyboard flow, health surface, zero CSP noise.

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

  const payload = await api.json();
  expect(Object.keys(payload)).toEqual(['status', 'version', 'uptimeSeconds', 'timestamp']);
  expect(payload.status).toBe('ok');
});

test('no CSP violations in the console on /, /app and /health', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => consoleMessages.push(message.text()));

  await page.goto('/');
  await page.goto('/app');
  // The guard's redirect target: /login with the original path in `redirect`.
  // Parsed instead of string-matched so percent-encoding cannot flake it.
  const destination = new URL(page.url());
  expect(destination.pathname).toBe('/login');
  expect(destination.searchParams.get('redirect')).toBe('/app');
  await page.goto('/health');
  await expect(page.getByRole('heading', { level: 1, name: 'System status' })).toBeVisible();

  const cspNoise = consoleMessages.filter((text) => text.includes('Content Security Policy'));
  expect(cspNoise).toEqual([]);
});
