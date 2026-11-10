import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**', 'coverage/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entrypoint: exercised by the e2e smoke in CI, not unit tests.
      exclude: ['src/main.ts'],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
