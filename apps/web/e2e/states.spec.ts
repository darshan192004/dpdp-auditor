import { expect, test } from '@playwright/test';

/**
 * P5-13: every data surface implements all five states from design.md 8 -
 * loading, empty, error, partial, permission.
 *
 * Fixtures always return populated data, so empty/error/loading are forced by
 * intercepting the BFF after the initial load. Each case navigates
 * client-side from the overview so the page fetches on the client (a full
 * page load would reuse the SSR payload and never hit the interceptor).
 */

const SCANS_EMPTY = {
  data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } },
};

const AUDIT_EMPTY = {
  data: [],
  pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 },
};

function errorBody(message: string, requestId: string) {
  return { error: { code: 'INTERNAL', message, requestId } };
}

async function gotoOverview(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
}

async function navTo(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name, exact: true })
    .click();
}

test.describe('five states (P5-13)', () => {
  test('empty: scans list explains there is nothing to show yet', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/scans*', (route) => route.fulfill({ json: SCANS_EMPTY }));

    await navTo(page, 'Scans');

    await expect(page).toHaveURL(/\/app\/scans$/);
    await expect(page.locator('#main').getByText('No scans yet', { exact: true })).toBeVisible();
    await expect(
      page.locator('#main').getByText('Connect a repository and start a scan'),
    ).toBeVisible();
  });

  test('empty: audit trail offers filter adjustment', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/audit-logs?*', (route) => route.fulfill({ json: AUDIT_EMPTY }));

    await navTo(page, 'Audit');

    await expect(page).toHaveURL(/\/app\/audit$/);
    await expect(page.getByText('No audit entries', { exact: true })).toBeVisible();
    await expect(page.getByText('Try adjusting the filters')).toBeVisible();
  });

  test('error: scans list shows a plain message, request ID and retry', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/scans*', (route) =>
      route.fulfill({
        status: 500,
        json: errorBody('Scans are temporarily unavailable.', 'req_state_500'),
      }),
    );

    await navTo(page, 'Scans');

    await expect(
      page.getByRole('alert').filter({ hasText: 'Scans are temporarily unavailable.' }),
    ).toBeVisible();
    await expect(page.getByText('Request req_state_500')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    // No stack trace leaks to the operator.
    await expect(page.getByText(/at .*\.ts:\d+/)).toHaveCount(0);
  });

  test('loading: audit trail is announced while a refetch is in flight', async ({ page }) => {
    await gotoOverview(page);
    // The first load resolves empty so the page renders with no rows.
    await page.route('**/api/v1/audit-logs?*', (route) => route.fulfill({ json: AUDIT_EMPTY }));

    await navTo(page, 'Audit');
    await expect(page.getByText('No audit entries', { exact: true })).toBeVisible();

    // A filter change refetches. Hold the response so the loading state is
    // observable (the initial load suspends setup, so it cannot show one).
    await page.route('**/api/v1/audit-logs?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ json: AUDIT_EMPTY });
    });
    await page.getByLabel('Action').fill('scan.started');

    // Skeleton-free loading state: announced, not a full-page spinner.
    await expect(page.getByRole('status').filter({ hasText: 'Loading audit trail' })).toBeVisible();

    // And it resolves rather than hanging forever.
    await expect(page.getByText('No audit entries', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('partial: incomplete scanner coverage is named on the scan detail', async ({ page }) => {
    // Fixture scan ...0011 has gitleaks timed_out and no grade.
    await page.goto('/app/scans/0f000000-0000-4000-8000-000000000011');

    await expect(page.getByText('Coverage incomplete: Gitleaks timed out.')).toBeVisible();
    await expect(page.getByText('Grade withheld until every scanner completes.')).toBeVisible();
  });

  test('permission: read-only role sees an explained view, not a dead end', async ({ page }) => {
    await page.goto('/app/settings/org');

    // The fixture identity is an auditor: they can triage findings but cannot
    // manage the organisation, so mutations are disabled and explained.
    await expect(page.getByText('You have read-only access to this organisation.')).toBeVisible();
    await expect(page.getByText('An owner or admin can change these settings.')).toBeVisible();

    await expect(page.getByLabel('Organisation name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save name' })).toBeDisabled();
  });
});
