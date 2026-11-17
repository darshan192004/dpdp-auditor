import { test, expect } from '@playwright/test';

/**
 * Audit trail (P5-05/P5-31): fixture-backed list, filters, and export.
 * Guards the fixtures branch in `audit-logs/index.get.ts` - without it the
 * route 401s and the page renders "Sign in to continue".
 */
test.describe('Audit log', () => {
  test('lists the fixture audit trail', async ({ page }) => {
    await page.goto('/app/audit');

    await expect(page.getByRole('heading', { level: 1, name: 'Audit' })).toBeVisible();
    await expect(page.getByText('9 entries')).toBeVisible();
    await expect(page.getByText('finding.triaged').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export NDJSON' })).toBeVisible();
    // No auth error surfaced for a fixture session.
    await expect(page.getByText('Sign in to continue')).toHaveCount(0);
  });

  test('filters the trail by action', async ({ page }) => {
    await page.goto('/app/audit');

    await page.getByLabel('Action').fill('scan.rescored');
    await page.getByRole('button', { name: 'Apply filters' }).click();

    await expect(page.getByText('1 entry')).toBeVisible();
    await expect(page.getByText('scan.rescored').first()).toBeVisible();
    await expect(page.getByText('repo.connected')).toHaveCount(0);
  });
});
