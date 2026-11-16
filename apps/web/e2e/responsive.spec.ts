import { expect, test, type Page } from '@playwright/test';

/**
 * P5-15: responsive pass at 320 / 768 / 1024 / 1440 px (design.md 10).
 *
 * The primary workspace is desktop; mobile supports review and triage, not
 * bulk operations. The contract we test:
 *   - no page forces a horizontal document scrollbar at any width
 *   - the sidebar is a drawer below 1024 px and pinned above it
 *   - the drawer opens and closes without leaving the page in a bad state
 */

const WIDTHS = [320, 768, 1024, 1440] as const;

const PAGES = [
  { name: 'overview', path: '/app', heading: 'Overview' },
  { name: 'scans', path: '/app/scans', heading: 'Scans' },
  { name: 'audit', path: '/app/audit', heading: 'Audit' },
  { name: 'settings', path: '/app/settings/org', heading: 'Organisation' },
] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - window.innerWidth;
  });
}

test.describe('responsive layout (P5-15)', () => {
  // Every test overrides the viewport. Reset to desktop after each so that
  // subsequent specs (which do not set a viewport) still run at 1280 × 720.
  test.afterEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  for (const width of WIDTHS) {
    test.describe(`${width}px`, () => {
      for (const target of PAGES) {
        test(`${target.name}: no horizontal overflow`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(target.path);

          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

          // 1px tolerance for sub-pixel rounding.
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        });
      }
    });
  }

  test('sidebar is a drawer below 1024px and pinned above it', async ({ page }) => {
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app');

      const toggle = page.getByRole('button', { name: 'Open navigation' });
      await expect(toggle).toBeVisible();
      await expect(page.locator('#app-sidebar')).toBeHidden();
    }

    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app');

      await expect(page.locator('#app-sidebar')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
    }
  });

  test('mobile drawer opens, navigates and closes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/app');

    await page.getByRole('button', { name: 'Open navigation' }).click();
    const sidebar = page.locator('#app-sidebar');
    await expect(sidebar).toBeVisible();

    // Navigate from inside the drawer; it must close behind us.
    await sidebar.getByRole('link', { name: 'Scans', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/scans$/);
    await expect(sidebar).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // And the explicit close control works too.
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name: 'Close navigation' }).click();
    await expect(sidebar).toBeHidden();
  });

  test('findings table scrolls inside its card instead of the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/app/scans/0f000000-0000-4000-8000-000000000010/findings');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    const table = page.locator('table');
    await expect(table).toBeVisible();
    // The table itself may be wider than the viewport, but the page must not be.
    const wrapper = page.locator('div.overflow-x-auto').first();
    await expect(wrapper).toBeVisible();
  });
});
