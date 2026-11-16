import { test, expect } from '@playwright/test';

/**
 * P5-23: PDF parity test — rendered numbers in the HTML report preview must
 * match the API/dashboard numbers for the same scan.
 *
 * This ensures the single view model is shared between the dashboard and PDF,
 * preventing divergence in scores, grades, and key metadata.
 */
test.describe('PDF parity (P5-23)', () => {
  const FIXTURE_SCAN_ID = '0f000000-0000-4000-8000-000000000010';
  const FIXTURE_REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

  // Dashboard score/grade from the fixture scan
  const EXPECTED_SCORE = '82.6';
  const EXPECTED_GRADE = 'B';

  test('HTML report preview shows the same score and grade as the scan detail page', async ({
    page,
  }) => {
    // Navigate to the scan detail page first to capture dashboard values
    await page.goto(`/app/scans/${FIXTURE_SCAN_ID}`);

    // Wait for the scorecard to load
    await expect(page.getByRole('heading', { name: 'acme/payments-service' })).toBeVisible();

    // The score appears in the scorecard component
    const dashboardScore = page.getByText(EXPECTED_SCORE).first();
    await expect(dashboardScore).toBeVisible();

    // The grade badge is present (rendered as "Grade B")
    const gradeBadge = page.getByText('Grade B', { exact: true });
    await expect(gradeBadge).toBeVisible();

    // Navigate to the HTML report preview
    await page.goto(`/report/${FIXTURE_REPORT_ID}`);

    // Wait for the report to load
    await expect(
      page.getByRole('heading', { level: 1, name: 'acme/payments-service' }),
    ).toBeVisible();

    // Executive summary section contains the same score
    const executiveSummaryScore = page.getByText(EXPECTED_SCORE).first();
    await expect(executiveSummaryScore).toBeVisible();

    // Grade is shown in the executive summary (rendered as just "B" under the "Grade" label)
    // The grade <p> immediately follows the "Grade" <span>
    const reportGrade = page.locator('span:has-text("Grade") + p').first();
    await expect(reportGrade).toHaveText(EXPECTED_GRADE);
  });

  test('HTML report preview shows matching repository and scan metadata', async ({ page }) => {
    // Navigate to the scan detail page
    await page.goto(`/app/scans/${FIXTURE_SCAN_ID}`);

    // Wait for the scan detail to load
    await expect(page.getByRole('heading', { name: 'acme/payments-service' })).toBeVisible();

    // Capture repository name and commit ref
    const repoName = 'acme/payments-service';
    const commitRef = 'main';

    // Verify repo name appears on scan detail
    await expect(page.getByText(repoName).first()).toBeVisible();
    await expect(page.getByText(commitRef).first()).toBeVisible();

    // Navigate to the HTML report preview
    await page.goto(`/report/${FIXTURE_REPORT_ID}`);

    // Wait for the report to load
    await expect(page.getByRole('heading', { level: 1, name: repoName })).toBeVisible();

    // Verify the same metadata appears in the report
    await expect(page.getByText(repoName).first()).toBeVisible();
    await expect(page.getByText(commitRef).first()).toBeVisible();
  });

  test('PDF export button on scan detail triggers report generation', async ({ page }) => {
    await page.goto(`/app/scans/${FIXTURE_SCAN_ID}`);

    // The Export PDF button should be visible for auditors
    const exportButton = page.getByRole('button', { name: 'Export PDF' });
    await expect(exportButton).toBeVisible();

    // Click to request a report
    await exportButton.click();

    // After requesting, the button should show a Download PDF link
    const downloadLink = page.getByRole('link', { name: 'Download PDF' });
    await expect(downloadLink).toBeVisible({ timeout: 10_000 });

    // Preview link should also be available
    const previewLink = page.getByRole('link', { name: 'Preview' });
    await expect(previewLink).toBeVisible();

    // Clicking preview navigates to the HTML report
    await previewLink.click();
    await expect(page).toHaveURL(`/report/${FIXTURE_REPORT_ID}`);

    // The report should show the same score
    await expect(page.getByText(EXPECTED_SCORE).first()).toBeVisible();
  });
});
