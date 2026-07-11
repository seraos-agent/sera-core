import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Thresholds intentionally disabled for now to baseline E2E coverage
    },
    testTimeout: 10000, // E2E tests may take a bit longer
  },
});
