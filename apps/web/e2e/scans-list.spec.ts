import { test, expect } from '@playwright/test';

/**
 * P5-03: Scan list page (filters, status, grade).
 * Verifies the scan history table, status filter, and navigation to detail.
 */
test.describe('Scan list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app/scans');
  });

  test('renders the scan list page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Scans' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Recent scans' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Start a scan' })).toBeVisible();
  });

  test('renders the status filter', async ({ page }) => {
    await expect(page.getByRole('radiogroup', { name: 'Status filter' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Completed' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Failed' })).toBeVisible();
  });

  test('displays the scan table with headers', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Repository' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Grade' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Findings' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Completed' })).toBeVisible();
  });

  test('shows completed and running fixture scans', async ({ page }) => {
    await expect(page.getByRole('table').getByText('acme/payments-service')).toHaveCount(3);
    await expect(page.getByText('82.6')).toBeVisible();
    await expect(page.getByText('74.1')).toBeVisible();
    // The grade renders as a pill (span), not a link.
    const scoredRow = page.getByRole('row').filter({ hasText: '82.6' });
    await expect(scoredRow.getByText('B', { exact: true })).toBeVisible();
    const partialRow = page.getByRole('row').filter({ hasText: '74.1' });
    await expect(partialRow.getByText('withheld')).toBeVisible();
  });

  test('filters by status and re-fetches', async ({ page }) => {
    await page.getByRole('radio', { name: 'Completed' }).click();
    // Both fixture scans are completed, so both remain visible.
    await expect(page.getByRole('table').getByText('acme/payments-service')).toHaveCount(2);

    // Filter to a status with no fixture scans; the list empties.
    await page.getByRole('radio', { name: 'Failed' }).click();
    await expect(page.getByRole('table')).toHaveCount(0);
    // Scope to main: the sidebar usage widget shows the same text.
    await expect(page.locator('main, #main').first().getByText('No scans yet')).toBeVisible();
  });

  test('navigates from the list to the scan detail page', async ({ page }) => {
    await page.getByRole('link', { name: 'acme/payments-service' }).first().click();
    await expect(page).toHaveURL(/\/app\/scans\//);
    await expect(
      page.getByRole('heading', { level: 1, name: 'acme/payments-service' }),
    ).toBeVisible();
  });
});
