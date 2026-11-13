import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fixture catalog lives in server/utils/fixtures/rules.ts: 11 controls across
// sections 5, 6, 8(4), 9, 12, 13 and 16.
const RULES_PATH = '/app/rules';
const DETAIL_PATH = `${RULES_PATH}/DPDPA-8.4-ENC-01`;

test('rule explorer: filter by section and scanner, then open a control', async ({ page }) => {
  await page.goto(RULES_PATH);

  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '11 of 11 controls' })).toBeVisible();

  const sectionNav = page.getByRole('navigation', { name: 'Control sections' });
  await sectionNav.getByRole('link', { name: /Security safeguards/ }).click();
  await expect(page).toHaveURL(/section=8/);
  await expect(page.getByRole('status').filter({ hasText: '4 of 11 controls' })).toBeVisible();
  await expect(sectionNav.getByRole('link', { name: /Security safeguards/ })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: /^Checkov/ }).click();
  await expect(page).toHaveURL(/scanner=checkov/);
  await expect(page.getByRole('status').filter({ hasText: '2 of 11 controls' })).toBeVisible();

  await page.getByRole('link', { name: /Personal data is encrypted at rest/ }).click();
  await expect(page).toHaveURL(/\/app\/rules\/DPDPA-8\.4-ENC-01$/);
  await expect(
    page.getByRole('heading', { name: 'Personal data is encrypted at rest', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('DPDPA Section 8(4)')).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'CKV_AWS_19', exact: true })).toBeVisible();
});

test('rule detail explains an unmapped, not-scored control', async ({ page }) => {
  await page.goto(`${RULES_PATH}/DPDPA-12-ACCESS-01`);

  await expect(
    page.getByRole('heading', { name: 'Data access and export endpoint exists', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Not scored')).toBeVisible();
  await expect(page.getByText('No scanner rule maps to this control')).toBeVisible();
  await expect(page.getByText('does not move the score')).toBeVisible();
});

test('rule explorer has no serious or critical a11y violations', async ({ page }) => {
  await page.goto(DETAIL_PATH);

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking).toHaveLength(0);
});
