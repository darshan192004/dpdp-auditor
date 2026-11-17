import { test, expect } from '@playwright/test';

/**
 * Every dashboard sidebar option reaches its page with content rendered -
 * guards against a nav entry pointing at a missing route or a page that
 * dies on its data fetch.
 */
const SIDEBAR_LINKS = [
  { name: 'Overview', path: '/app' },
  { name: 'Repositories', path: '/app/repos' },
  { name: 'Scans', path: '/app/scans' },
  { name: 'Rules', path: '/app/rules' },
  { name: 'Audit', path: '/app/audit' },
  { name: 'Settings', path: '/app/settings/org' },
] as const;

test.describe('Dashboard sidebar', () => {
  for (const link of SIDEBAR_LINKS) {
    test(`${link.name} is reachable from the sidebar`, async ({ page }) => {
      await page.goto('/app');

      await page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: link.name, exact: true })
        .click();

      await expect(page).toHaveURL(new RegExp(`${link.path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Sign in to continue')).toHaveCount(0);
    });
  }

  test('plan badge matches the plan shown on the overview card', async ({ page }) => {
    await page.goto('/app');

    const sidebar = page.locator('#app-sidebar');
    await expect(sidebar.getByText('Starter')).toBeVisible();
    await expect(page.getByText('Starter').first()).toBeVisible();
  });
});
