import { test, expect } from '@playwright/test';

/**
 * P5-01: Overview dashboard visual and accessibility tests.
 * Verifies the glass-morphism OpsPulse-style design renders correctly.
 */
test.describe('Overview Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('overview page renders with glass-morphism design', async ({ page }) => {
    // The app layout renders the page title as an h1 inside the main content
    // region; scope to the main landmark to avoid matching the sidebar header.
    await expect(page.locator('main h1, #main h1').first()).toHaveText('Overview');

    // Verify main section headings exist. Scope to the main content region so
    // the sidebar's "Recent scans" usage widget doesn't collide with the main
    // "Recent scans" section heading.
    const main = page.locator('main, #main').first();
    await expect(main.getByRole('heading', { level: 2, name: 'Control catalog' })).toBeVisible();
    // "Plan" is a small uppercase label inside the usage meter, not an h2.
    await expect(main.getByText('PLAN')).toBeVisible();
    await expect(
      main.getByRole('heading', { level: 2, name: 'Controls by section' }),
    ).toBeVisible();
    await expect(main.getByRole('heading', { level: 2, name: 'Signal sources' })).toBeVisible();
    await expect(main.getByRole('heading', { level: 2, name: 'Recent scans' })).toBeVisible();
  });

  test('displays catalog statistics', async ({ page }) => {
    // KPI labels render uppercase inside <dt>; scope to the KPI grid so the
    // "Scanner mappings" prose label doesn't collide.
    const kpiGrid = page.locator('dl.grid').first();
    await expect(kpiGrid.getByText('SCORED CONTROLS')).toBeVisible();
    await expect(kpiGrid.getByText('NOT YET SCORED')).toBeVisible();
    await expect(kpiGrid.getByText('SECTIONS COVERED')).toBeVisible();
    await expect(kpiGrid.getByText('SCANNER MAPPINGS')).toBeVisible();
  });

  test('displays usage meter with plan information', async ({ page }) => {
    // Fixture plan is "starter" → UsageMeter renders "Starter".
    await expect(page.getByText('Starter')).toBeVisible();

    // Verify usage labels
    await expect(page.getByText('Scans this month')).toBeVisible();
    await expect(page.getByText('Reports this month')).toBeVisible();

    // Verify progress bars exist (role="progressbar")
    const progressBars = page.locator('[role="progressbar"]');
    await expect(progressBars).toHaveCount(2);
  });

  test('displays sections table with controls', async ({ page }) => {
    const table = page.locator('table').first();
    await expect(table).toBeVisible();

    // Check table headers (uppercase in markup)
    await expect(page.getByRole('columnheader', { name: 'Section' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Controls' })).toBeVisible();

    // Check table has section rows
    const rows = table.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('displays signal sources with progress bars', async ({ page }) => {
    const scannersSection = page.locator('section').filter({ hasText: 'Signal sources' });
    await expect(scannersSection).toBeVisible();
  });

  test('displays quick links', async ({ page }) => {
    // Quick links are the bottom grid of cards. Scope by the visible description
    // text to avoid colliding with sidebar nav links of the same name.
    await expect(page.getByRole('link', { name: /Connect a GitHub repository/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /See what each control asks for/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Every score, triage decision/i })).toBeVisible();
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    // Inject axe-core
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
    });

    // Run axe
    const accessibilityScanResults = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (window as any).axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
        },
      });
      return results;
    });

    const seriousViolations = accessibilityScanResults.violations.filter(
      (v: { impact: string }) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (seriousViolations.length > 0) {
      console.log('Accessibility violations:', JSON.stringify(seriousViolations, null, 2));
    }

    expect(seriousViolations).toHaveLength(0);
  });

  test('responsive layout on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Verify page still renders
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    // On mobile, sections should stack vertically
    const catalogSection = page.locator('section').filter({ hasText: 'Control catalog' });
    await expect(catalogSection).toBeVisible();
  });
});
