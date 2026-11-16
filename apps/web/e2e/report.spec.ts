import { test, expect } from '@playwright/test';

/**
 * P5-21/P5-22: report request, status polling, and the accessible HTML
 * preview route. Fixtures answer the report APIs in e2e.
 */
test.describe('Report preview', () => {
  test('renders the report view model sections', async ({ page }) => {
    await page.goto('/report/rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2');

    await expect(
      page.getByRole('heading', { level: 1, name: 'acme/payments-service' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Executive summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Findings by severity' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Score breakdown' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top findings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible();
  });

  test('shows the same score numbers as the scan', async ({ page }) => {
    await page.goto('/report/rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2');

    // Fixture scan score 82.6 appears in the executive summary.
    await expect(page.getByText('82.6').first()).toBeVisible();
    await expect(page.getByText('B', { exact: true }).first()).toBeVisible();
    // Section table marks section 12 as not assessed.
    await expect(page.getByText('not assessed')).toBeVisible();
    // Disclaimer from the view model is present.
    await expect(page.getByText(/not legal advice/i)).toBeVisible();
  });

  test('scan detail page offers the PDF export button', async ({ page }) => {
    await page.goto('/app/scans/0f000000-0000-4000-8000-000000000010');

    const exportButton = page.getByRole('button', { name: 'Export PDF' });
    await expect(exportButton).toBeVisible();

    // Requesting a report moves the button into a polling/ready state.
    await exportButton.click();
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Preview' })).toBeVisible();
  });
});
