import { expect, test } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * P5-23: the HTML report preview and the dashboard consume the same view
 * model. Parity is asserted at the API boundary and through the preview heading,
 * not by duplicating the PDF renderer's DOM structure.
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

  test('HTML report preview offers the PDF download for that scan', async ({ page }) => {
    await page.goto(`/report/${FIXTURE_REPORT_ID}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('acme/payments-service');
    await expect(page.locator('body')).toContainText('Priority findings');
    await expect(page.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      /^\/api\/v1\/report\/pdf\/.+\/download$/,
    );
  });

  test('exporting from scan detail produces a download and an HTML preview', async ({ page }) => {
    await page.goto(`/app/scans/${FIXTURE_SCAN_ID}`);
    await waitForHydration(page);
    await page.locator('main').getByRole('button', { name: 'Export PDF' }).click();

    const main = page.locator('main');
    const download = main.getByRole('link', { name: 'Download PDF' });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute('href', /^\/api\/v1\/report\/pdf\/.+\/download$/);

    const preview = main.getByRole('link', { name: 'Preview' });
    await expect(preview).toBeVisible();
    await preview.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('acme/payments-service');
  });
});
