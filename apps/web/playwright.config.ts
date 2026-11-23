import { defineConfig, devices } from '@playwright/test';

// E2E harness (plan Task 7, P1-30): chromium against the dev server.
// `pnpm preview` forces NODE_ENV=production, which disables the dev-only
// /api/auth/dev-session route used to seed a fixture session.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    // Fixtures keep the workbench verifiable without Docker, Postgres, or the
    // Phase 2 session.
    env: {
      NUXT_FIXTURES: '1',
    },
    // Cold-start headroom: the dev server re-bootstraps modules before serving
    // (observed 14s+ for @nuxt/ui alone on a cold cache).
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
