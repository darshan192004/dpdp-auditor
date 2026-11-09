import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entrypoint: exercised by the e2e smoke in CI, not unit tests.
      exclude: ['src/main.ts'],
      thresholds: { lines: 80, branches: 70 },
    },
  },
});
