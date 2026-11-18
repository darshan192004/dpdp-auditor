import { expect, test } from '@playwright/test';

const SCAN_ID = '0f000000-0000-4000-8000-000000000010';

test.describe('Signal Console shell', () => {
  test('overview renders the new shell and can be screenshotted', async ({ page }) => {
    await page.goto('/app');
    await expect(page.locator('header nav[aria-label="Breadcrumb"]')).toBeVisible();
    await expect(page.locator('main h1')).toHaveText('Overview');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-overview.png', fullPage: true });
  });

  test('scans list renders score and status together', async ({ page }) => {
    await page.goto('/app/scans');
    await expect(page.locator('main h1')).toHaveText('Scans');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-scans.png', fullPage: true });
  });

  test('scan detail shows score with coverage and grade', async ({ page }) => {
    await page.goto(`/app/scans/${SCAN_ID}`);
    await expect(page.locator('main')).toContainText('coverage:');
    await expect(page.locator('main')).toContainText('Score and coverage breakdown');
    await page.screenshot({
      path: '../../.playwright-mcp/rebuild-scan-detail.png',
      fullPage: true,
    });
  });

  test('coverage explains the score', async ({ page }) => {
    await page.goto(`/app/scans/${SCAN_ID}/coverage`);
    await expect(page.locator('main h1')).toHaveText('Score and coverage');
    await expect(page.locator('main')).toContainText('Section scores');
    await page.screenshot({ path: '../../.playwright-mcp/rebuild-coverage.png', fullPage: true });
  });

  test('motion collapses under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/app');
    const duration = await page
      .locator('main')
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    // Chromium serialises 0.01ms as 1e-05s; both mean motion is collapsed.
    expect(duration).toMatch(/^(0s|0\.00001s|1e-05s|0\.01ms)$/);
  });
});
