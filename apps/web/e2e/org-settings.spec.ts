import { expect, test } from '@playwright/test';

// P2-B: organisation settings and onboarding against the fixture BFF.

test('organisation settings render the fixture workspace', async ({ page }) => {
  await page.goto('/app/settings/org');

  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Settings');
  await expect(main).toContainText('Acme Payments');
});

test('onboarding creates an organisation and lands in the app', async ({ page }) => {
  await page.goto('/onboarding');

  await page.getByLabel('Organisation name').fill('New Workspace');
  await expect(page.getByLabel('Workspace URL')).toHaveValue('new-workspace');

  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page).toHaveURL(/\/app$/);
});
