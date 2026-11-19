import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * P5-15 (design.md §10): no page forces a horizontal document scrollbar at
 * 320 / 768 / 1024 / 1440px. The console sidebar pins above `lg` and becomes
 * a drawer below it; the drawer opens and closes without a bad page state.
 */

const WIDTHS = [320, 768, 1024, 1440] as const;

const PAGES = [
  { name: 'overview', path: '/app' },
  { name: 'scans', path: '/app/scans' },
  { name: 'audit', path: '/app/audit' },
  { name: 'settings', path: '/app/settings/org' },
] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - window.innerWidth;
  });
}

test.describe('responsive layout (P5-15)', () => {
  // Every test overrides the viewport. Reset to desktop afterwards so that
  // subsequent specs still run at 1280 × 720.
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
          expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        });
      }
    });
  }

  test('sidebar is a drawer below 1024px and pinned above it', async ({ page }) => {
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/app');

      await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
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
    await waitForHydration(page);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Navigation' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('link', { name: 'Scans', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/scans$/);
    await expect(dialog).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).last().click();
    await expect(dialog).toBeHidden();
  });

  test('findings rows fit inside the viewport at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/app/scans/0f000000-0000-4000-8000-000000000010/findings');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main button').filter({ hasText: 'sha256:' }).first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });
});
