import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // The determinism suite runs 4 x 50k ticks and the ESLint probe boots a
    // full linter; both are comfortably slower than the 5s default.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
