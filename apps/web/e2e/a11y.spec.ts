import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// design.md §9: public surfaces must hold zero serious/critical violations.

const PUBLIC_PATHS = ['/', '/health'] as const;

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
