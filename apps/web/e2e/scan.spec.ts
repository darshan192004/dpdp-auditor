import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fixture ids are fixed in server/utils/fixtures/scans.ts.
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const PARTIAL_SCAN_ID = '0f000000-0000-4000-8000-000000000011';
const SCAN_PATH = `/app/scans/${SCAN_ID}`;
const PARTIAL_SCAN_PATH = `/app/scans/${PARTIAL_SCAN_ID}`;

test('scorecard: score, coverage and drill-down links', async ({ page }) => {
  await page.goto(SCAN_PATH);

  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('acme/payments-service');
  await expect(main).toContainText('82.6');
  await expect(main).toContainText('coverage: full');
  await expect(main).toContainText('B');
  await expect(main.getByRole('link', { name: 'How was this score computed?' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Score and coverage breakdown' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Remediation workspace' })).toBeVisible();

  await main.getByRole('link', { name: 'How was this score computed?' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/scans/${SCAN_ID}/findings$`));
});

test('partial coverage names the timed-out scanner and withholds the grade', async ({ page }) => {
  await page.goto(PARTIAL_SCAN_PATH);

  const main = page.locator('main');
  await expect(main).toContainText('74.1');
  await expect(main).toContainText('coverage: partial');
  await expect(main).toContainText('Coverage incomplete: Gitleaks timed out.');
});

test('scorecard has no serious or critical a11y violations', async ({ page }) => {
  await page.goto(SCAN_PATH);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(blocking).toEqual([]);
});
