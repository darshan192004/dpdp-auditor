import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fixture catalog lives in server/utils/fixtures/rules.ts: 11 controls.
const RULES_PATH = '/app/rules';
const DETAIL_PATH = `${RULES_PATH}/DPDPA-8.4-ENC-01`;

test('rule explorer lists the fixture controls', async ({ page }) => {
  await page.goto(RULES_PATH);

  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Rules');
  await expect(main).toContainText('Personal data is encrypted at rest');
  await expect(main).toContainText('DPDPA-8.4-ENC-01');
});

test('rule detail explains an unmapped, not-scored control', async ({ page }) => {
  await page.goto(`${RULES_PATH}/DPDPA-12-ACCESS-01`);

  await expect(
    page.getByRole('heading', { name: 'Data access and export endpoint exists', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Not scored')).toBeVisible();
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
