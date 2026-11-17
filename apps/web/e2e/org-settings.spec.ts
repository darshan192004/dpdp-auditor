import { expect, test } from '@playwright/test';

// P2-B: organisation settings and onboarding against the fixture BFF.

test('organisation settings render the fixture workspace read-only for an auditor', async ({
  page,
}) => {
  await page.goto('/app/settings/org');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Organisation settings' }),
  ).toBeVisible();
  await expect(page.getByText('You have read-only access to this organisation.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Organisation name' })).toBeDisabled();
  await expect(page.getByRole('table', { name: /Organisation members/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0);
});

test('onboarding creates an organisation and lands in the app', async ({ page }) => {
  await page.goto('/onboarding');

  await page.getByLabel('Organisation name').fill('New Workspace');
  await expect(page.getByLabel('Workspace URL')).toHaveValue('new-workspace');

  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page).toHaveURL(/\/app$/);
});
