import { expect, test } from '@playwright/test';

/**
 * P5-21/P5-22: the report preview is a print-layout PDF export card driven by
 * the report view model, and the scan detail links into the score drill-down.
 */
const REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';
const SCAN_ID = '0f000000-0000-4000-8000-000000000010';

test.describe('Report preview', () => {
  test('renders the PDF export card from the report view model', async ({ page }) => {
    await page.goto(`/report/${REPORT_ID}`);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('DPDPA Audit Report');
    await expect(page.locator('body')).toContainText(SCAN_ID);
    await expect(page.locator('body')).toContainText(`PDF export for scan ${SCAN_ID}`);
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });

  test('uses the print layout without console chrome', async ({ page }) => {
    await page.goto(`/report/${REPORT_ID}`);

    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
  });

  test('scan detail links into findings, coverage and remediation', async ({ page }) => {
    await page.goto(`/app/scans/${SCAN_ID}`);

    const main = page.locator('main');
    await expect(main.getByRole('link', { name: 'Findings', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Coverage', exact: true })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Remediation', exact: true })).toBeVisible();
  });
});
