import { expect, test, type Page } from '@playwright/test';

import { waitForHydration } from './hydration';

/**
 * P5-13: every data surface implements the five states from design.md §8.
 * Fixtures always return populated data, so empty/error states are forced by
 * intercepting the BFF and navigating client-side from the overview (a full
 * page load would reuse the SSR payload and never hit the interceptor).
 */

const SCANS_EMPTY = {
  data: { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } },
};

const AUDIT_EMPTY = {
  data: [],
  pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 },
};

const RULES_EMPTY = {
  data: [],
  pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 1 },
};

function errorBody(message: string, requestId: string) {
  return { error: { code: 'INTERNAL', message, requestId } };
}

async function gotoOverview(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await waitForHydration(page);
}

async function navTo(page: Page, name: string): Promise<void> {
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
    await expect(page.locator('main')).toContainText('No scans yet.');
  });

  test('empty: audit trail offers a clear empty state', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/audit-logs*', (route) => route.fulfill({ json: AUDIT_EMPTY }));

    await navTo(page, 'Audit');

    await expect(page).toHaveURL(/\/app\/audit$/);
    await expect(page.locator('main')).toContainText('No audit events');
  });

  test('error: rules catalog shows a plain message without a stack trace', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/rules*', (route) =>
      route.fulfill({
        status: 500,
        json: errorBody('Rules are temporarily unavailable.', 'req_state_500'),
      }),
    );

    await navTo(page, 'Rules');

    const alert = page.getByRole('alert').filter({ hasText: 'Rules are temporarily unavailable.' });
    await expect(alert).toBeVisible();
    await expect(page.getByText(/at .*\.ts:\d+/)).toHaveCount(0);
  });

  test('empty: rules catalog explains that no controls matched', async ({ page }) => {
    await gotoOverview(page);
    await page.route('**/api/v1/rules*', (route) => route.fulfill({ json: RULES_EMPTY }));

    await navTo(page, 'Rules');

    await expect(page.locator('main')).toContainText('No rules found');
  });

  test('partial: incomplete scanner coverage is named on the scan detail', async ({ page }) => {
    await page.goto('/app/scans/0f000000-0000-4000-8000-000000000011');

    await expect(page.locator('main')).toContainText('Coverage incomplete: Gitleaks timed out.');
    await expect(page.locator('main')).toContainText('partial coverage');
  });

  test('permission: the fixture auditor sees the organisation read-only', async ({ page }) => {
    await page.goto('/app/settings/org');

    await expect(page.locator('main')).toContainText('Acme Payments');
    await expect(page.getByRole('button', { name: 'Save name' })).toHaveCount(0);
  });
});
