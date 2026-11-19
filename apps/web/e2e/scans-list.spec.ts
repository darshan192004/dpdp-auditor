import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * P5-03: the rebuilt scans list renders contract-shaped cards showing status
 * and score together. Legacy radiogroup/table filters were removed.
 */
test.describe('Scan list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scans');
  });

  test('renders the scan list page', async ({ page }) => {
    await expect(page.locator('main').getByRole('heading', { level: 1 })).toHaveText('Scans');
  });

  test('shows completed, partial and running fixture scans', async ({ page }) => {
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Scans');
    await expect(main.getByRole('link', { name: /acme\/payments-service/ })).toHaveCount(3);
    await expect(main).toContainText('82.6');
    await expect(main).toContainText('74.1');
    await expect(main).toContainText('scanning');
  });

  test('explains an empty scan list', async ({ page }) => {
    // A full reload re-runs the BFF fetch on the server, bypassing the browser
    // interceptor. Hydrate on the overview first, then navigate client-side.
    await page.goto('/app');
    await waitForHydration(page);
    await page.route('**/api/v1/scans*', (route) =>
      route.fulfill({
        json: {
          data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } },
        },
      }),
    );

    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Scans', exact: true })
      .click();

    await expect(page).toHaveURL(/\/app\/scans$/);
    await expect(page.locator('main')).toContainText('No scans found.');
  });

  test('navigates from the list to the scan detail page', async ({ page }) => {
    await page
      .getByRole('link', { name: /acme\/payments-service/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/app\/scans\//);
    await expect(
      page.getByRole('heading', { level: 1, name: 'acme/payments-service' }),
    ).toBeVisible();
  });
});
