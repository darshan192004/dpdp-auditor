import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * P5-01: the rebuilt overview renders the catalog counts as KPI cards. The
 * legacy glass-morphism/usage-meter/table markup was removed by the rebuild;
 * accessibility is covered here and in a11y.spec.ts.
 */
test.describe('Overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('renders the catalog KPI cards', async ({ page }) => {
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Overview');
    await expect(main).toContainText('Scored controls');
    await expect(main).toContainText('Open findings');
    await expect(main).toContainText('Sections covered');
    await expect(main).toContainText('Scanner mappings');
    await expect(main.getByRole('heading', { name: 'Finding severity' })).toBeVisible();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking).toHaveLength(0);
  });

  test('stays readable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(main).toContainText('Scored controls');
  });
});
