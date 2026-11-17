import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// design.md §9: public surfaces must hold zero serious/critical violations.

// P5-14 widens the sweep to every authenticated data surface plus the
// accessible report preview.
const PUBLIC_PATHS = [
  '/',
  '/health',
  '/app',
  '/app/repos',
  '/app/scans',
  '/app/rules',
  '/app/audit',
  '/app/settings/org',
  '/app/settings/api-keys',
  '/report/rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2',
] as const;

for (const path of PUBLIC_PATHS) {
  test(`no serious or critical a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(blocking).toHaveLength(0);
  });
}
