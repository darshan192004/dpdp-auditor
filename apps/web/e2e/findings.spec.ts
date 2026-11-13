import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The fixture scan id is fixed in server/utils/fixtures/findings.ts. It is
// duplicated here because Playwright cannot resolve the `~~` Nuxt alias.
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const FINDINGS_PATH = `/app/scans/${SCAN_ID}/findings`;

test('findings workbench: filter, inspect, triage, restore', async ({ page }) => {
  await page.goto(FINDINGS_PATH);

  await expect(page.getByRole('heading', { name: 'Findings', level: 1 })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('14 findings')).toBeVisible();

  await page.getByRole('button', { name: 'Critical', exact: true }).click();
  await expect(page).toHaveURL(/severity=critical/);
  await expect(page.getByRole('button', { name: 'Critical', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('tbody tr')).toHaveCount(3);

  await page.locator('tbody tr').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole('heading', { name: 'Personal data is written to application logs.' }),
  ).toBeVisible();
  await expect(drawer.getByText('services/payments/api/views.py:142–149')).toBeVisible();

  await drawer.getByLabel('Disposition').selectOption('accepted_risk');
  await drawer.getByLabel('Note').fill('Risk accepted until the Q1 migration lands.');
  await drawer.getByRole('button', { name: 'Save disposition' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Disposition saved' })).toBeVisible();
  await expect(drawer.getByText('Accepted risk', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('tbody tr').first()).toBeFocused();

  await page.goto(`${FINDINGS_PATH}?severity=high&status=open`);
  await expect(page.getByRole('button', { name: 'High', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('findings workbench has no serious or critical a11y violations', async ({ page }) => {
  await page.goto(FINDINGS_PATH);
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking).toHaveLength(0);
});
