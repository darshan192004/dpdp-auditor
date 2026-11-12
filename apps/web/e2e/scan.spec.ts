import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fixture ids are fixed in server/utils/fixtures/scans.ts. They are duplicated
// here because Playwright cannot resolve the `~~` Nuxt alias.
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const PARTIAL_SCAN_ID = '0f000000-0000-4000-8000-000000000011';
const SCAN_PATH = `/app/scans/${SCAN_ID}`;
const PARTIAL_SCAN_PATH = `/app/scans/${PARTIAL_SCAN_ID}`;

test('scorecard: score, trend, sections, and links into findings', async ({ page }) => {
  await page.goto(SCAN_PATH);

  await expect(
    page.getByRole('heading', { name: 'acme/payments-service', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('82.6')).toBeVisible();
  await expect(page.getByText('Grade B')).toBeVisible();
  await expect(page.getByText('4.2 vs last')).toBeVisible();

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Correction and erasure');
  await expect(rows.last()).toContainText('Right to access');
  await expect(rows.last()).toContainText('Not assessed by code');

  await page.getByRole('link', { name: /Critical/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/scans/${SCAN_ID}/findings\\?severity=critical`));
  await expect(page.locator('tbody tr')).toHaveCount(3);

  await page.goBack();
  await rows.getByRole('link', { name: /Consent/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/scans/${SCAN_ID}/findings\\?section=6`));
  await expect(page.getByText('1 finding')).toBeVisible();
});

test('partial coverage withholds the grade and explains why', async ({ page }) => {
  await page.goto(PARTIAL_SCAN_PATH);

  await expect(page.getByText('74.1')).toBeVisible();
  await expect(page.getByText('Grade withheld', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Gitleaks timed out');
  await expect(page.getByRole('status')).toContainText(
    'Grade withheld until every scanner completes.',
  );
  await expect(page.getByText('Grade B')).toHaveCount(0);
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
