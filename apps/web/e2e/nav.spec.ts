import { expect, test } from '@playwright/test';

/**
 * Every console sidebar entry reaches its page with a rendered h1, and the
 * breadcrumb names the active section.
 */
const SIDEBAR_LINKS = [
  { name: 'Overview', path: '/app' },
  { name: 'Scans', path: '/app/scans' },
  { name: 'Remediation', path: '/app/remediation' },
  { name: 'Rules', path: '/app/rules' },
  { name: 'Audit', path: '/app/audit' },
  { name: 'Settings', path: '/app/settings/org' },
  { name: 'Health', path: '/health' },
] as const;

test.describe('Console navigation', () => {
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

  test('breadcrumb names the active section', async ({ page }) => {
    await page.goto('/app/scans');

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Scans');
  });
});
