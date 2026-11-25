import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * P5-23: the HTML report preview and the dashboard consume the same view
 * model. The rebuilt report screen no longer duplicates the executive summary
 * markup, so parity is asserted at the API boundary — the screen renders that
 * exact scan id — rather than through removed DOM.
 */
test.describe('PDF parity (P5-23)', () => {
  const FIXTURE_SCAN_ID = '0f000000-0000-4000-8000-000000000010';
  const FIXTURE_REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

  test('report view model matches the scan detail score and grade', async ({ request }) => {
    const scanResponse = await request.get(`/api/v1/scan/${FIXTURE_SCAN_ID}`);
    const reportResponse = await request.get(`/api/v1/report/pdf/${FIXTURE_REPORT_ID}/view`);
    expect(scanResponse.ok()).toBeTruthy();
    expect(reportResponse.ok()).toBeTruthy();

    const scan = await scanResponse.json();
    const report = await reportResponse.json();
    expect(report.data.scan.id).toBe(scan.data.id);
    expect(report.data.scan.score).toBe(scan.data.score);
    expect(report.data.scan.grade).toBe(scan.data.grade);
  });

  test('HTML report preview offers the PDF export for that scan', async ({ page }) => {
    await page.goto(`/report/${FIXTURE_REPORT_ID}`);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('DPDPA Audit Report');
    await expect(page.locator('body')).toContainText(FIXTURE_SCAN_ID);
    await expect(page.locator('body')).toContainText(`PDF export for scan ${FIXTURE_SCAN_ID}`);
    await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
  });

  test('exporting produces a download and an HTML preview', async ({ page }) => {
    await page.goto(`/report/${FIXTURE_REPORT_ID}`);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Export PDF' }).click();

    const download = page.getByRole('link', { name: 'Download PDF' });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute('href', /^\/api\/v1\/report\/pdf\/.+\/download$/);
    await expect(page.getByRole('link', { name: 'Preview' })).toBeVisible();
  });
});
