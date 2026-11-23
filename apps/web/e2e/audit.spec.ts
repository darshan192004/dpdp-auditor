import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * Audit trail (P5-05/P5-31) on the rebuilt Signal Console. The legacy
 * filter/export controls were removed with the old workbench, so verification
 * covers the real fixture-backed list and its empty state.
 */
test.describe('Audit log', () => {
  test('lists the fixture audit trail', async ({ page }) => {
    await page.goto('/app/audit');

    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Audit');
    await expect(main).toContainText('finding.triaged');
    await expect(main).toContainText('org.created');
    await expect(main.getByText('No audit events')).toHaveCount(0);
  });

  test('shows an explanatory empty state when the trail is empty', async ({ page }) => {
    await page.goto('/app');
    await waitForHydration(page);
    await page.route('**/api/v1/audit-logs*', (route) =>
      route.fulfill({
        json: {
          data: [],
          pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 },
        },
      }),
    );

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Audit', exact: true })
      .click();

    await expect(page).toHaveURL(/\/app\/audit$/);
    await expect(page.locator('main')).toContainText('No audit events');
  });
});
