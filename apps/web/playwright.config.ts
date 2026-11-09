import { defineConfig, devices } from '@playwright/test';

// E2E harness (plan Task 7, P1-30): chromium against the built preview server.
export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm preview',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    // Cold-start headroom: `nuxt preview` re-bootstraps modules before serving
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
