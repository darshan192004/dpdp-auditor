import { expect, test } from '@playwright/test';
import { waitForHydration } from './hydration';

const SCAN_ID = '0f000000-0000-4000-8000-000000000010';
const REPO_ID = '0f000000-0000-4000-8000-000000000020';
const REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

test.describe('Phase E walkthrough', () => {
  test('renders the five readiness pages from guarded fixtures', async ({ page }) => {
    const routes: Array<[string, string]> = [
      [`/app/readiness/inventory?scanId=${SCAN_ID}`, 'Data Inventory'],
      [`/app/readiness/gaps?scanId=${SCAN_ID}`, 'Compliance Gaps'],
      [`/app/readiness/fix-plan?scanId=${SCAN_ID}`, 'Fix Plan'],
      [`/app/readiness/attestations?repoId=${REPO_ID}`, 'Attestations'],
      [`/app/readiness/exports?scanId=${SCAN_ID}`, 'Exports'],
    ];
    for (const [url, heading] of routes) {
      await page.goto(url);
      await waitForHydration(page);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      if (heading === 'Attestations') {
        await expect(
          page.getByText('Human statements recorded for this repository.'),
        ).toBeVisible();
        await expect(
          page.getByText('Attestations are not code evidence and do not change coverage.'),
        ).toBeVisible();
      }
    }
  });

  test('renders detector explanations and attestation tiles', async ({ page }) => {
    await page.goto('/app/rules/DPDPA-8.4-ENC-01');
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'How evidence is found' })).toBeVisible();

    await page.goto(`/app/scans/${SCAN_ID}`);
    await waitForHydration(page);
    await expect(page.locator('#main').getByRole('link', { name: 'Attestations' })).toBeVisible();
  });

  test('exports SARIF and Markdown from control results', async ({ request }) => {
    const sarif = await request.get(`/api/v1/scan/${SCAN_ID}/export/sarif`);
    expect(sarif.ok()).toBeTruthy();
    expect((await sarif.json()).version).toBe('2.1.0');

    const markdown = await request.get(`/api/v1/scan/${SCAN_ID}/export/markdown`);
    expect(markdown.ok()).toBeTruthy();
    expect(await markdown.text()).toContain('# Readiness gaps');
  });

  test('produces a real PDF from the report flow', async ({ page }) => {
    await page.goto(`/report/${REPORT_ID}`);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Export PDF' }).click();
    const download = page.getByRole('link', { name: 'Download PDF' });
    await expect(download).toBeVisible({ timeout: 15_000 });
    await expect(download).toHaveAttribute('href', /^\/api\/v1\/report\/pdf\/.+\/download$/);
  });
});
