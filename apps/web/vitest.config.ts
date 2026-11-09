import { defineVitestProject } from '@nuxt/test-utils/config';
import { defineConfig } from 'vitest/config';

// Two projects:
// - `nuxt`: component tests that need the Nuxt runtime (`mountSuspended`).
// - `e2e`: server tests that build and boot Nitro (`setup()` from
//   `@nuxt/test-utils/e2e`), which cannot run inside the Nuxt environment.
export default defineConfig(async () => ({
  test: {
    projects: [
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['test/**/*.test.ts'],
          exclude: ['test/security-headers.test.ts'],
        },
      }),
      {
        test: {
          name: 'e2e',
          environment: 'node',
          include: ['test/security-headers.test.ts'],
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
}));
