import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

// The fixture scan id is fixed in server/utils/fixtures/findings.ts.
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const FINDINGS_PATH = `/app/scans/${SCAN_ID}/findings`;

test.describe('Findings workspace', () => {
  test('filters by severity, inspects evidence, and saves a disposition', async ({ page }) => {
    await page.goto(FINDINGS_PATH);
    await waitForHydration(page);

    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Findings');

    // FindingsTable renders one <tr id="finding-row-<id>"> per finding.
    const rows = main.locator('tr[id^="finding-row-"]');
    await expect(rows).toHaveCount(14);

    const critical = main
      .getByRole('group', { name: 'Severity' })
      .getByRole('button', { name: 'Critical', exact: true });
    await critical.click();
    await expect(critical).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(3);

    await rows
      .first()
      .getByRole('button', { name: /^Open finding:/ })
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(drawer).toContainText('logger.info(');

    await drawer.getByLabel('Disposition').selectOption('false_positive');
    await drawer.getByLabel('Note').fill('Confirmed expected logging in the dev build only.');
    await drawer.getByRole('button', { name: 'Save disposition' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Disposition saved' })).toBeVisible();
  });

  test('has no serious or critical a11y violations', async ({ page }) => {
    await page.goto(FINDINGS_PATH);
    await waitForHydration(page);
    await page
      .locator('tr[id^="finding-row-"]')
      .first()
      .getByRole('button', { name: /^Open finding:/ })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking).toHaveLength(0);
  });
});
