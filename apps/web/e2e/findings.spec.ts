import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

// The fixture scan id is fixed in server/utils/fixtures/findings.ts.
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const FINDINGS_PATH = `/app/scans/${SCAN_ID}/findings`;

test.describe('Findings workspace', () => {
  test('filters by severity, inspects evidence, and opens remediation', async ({ page }) => {
    await page.goto(FINDINGS_PATH);
    await waitForHydration(page);

    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Findings');

    // DsFindingRow renders a button carrying the evidence hash.
    const rows = main.locator('button').filter({ hasText: 'sha256:' });
    await expect(rows).toHaveCount(14);

    const critical = main
      .getByRole('group', { name: 'Filter findings' })
      .getByRole('button', { name: 'critical', exact: true });
    await critical.click();
    await expect(critical).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(3);

    await rows.first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Personal data is written to application logs.');
    await expect(drawer).toContainText('sha256:');

    await drawer.getByRole('link', { name: 'Open remediation workspace' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/scans/${SCAN_ID}/remediation\\?finding=`));
  });

  test('has no serious or critical a11y violations', async ({ page }) => {
    await page.goto(FINDINGS_PATH);
    await waitForHydration(page);
    await page.locator('main button').filter({ hasText: 'sha256:' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(blocking).toHaveLength(0);
  });
});
