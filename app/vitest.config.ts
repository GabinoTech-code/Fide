import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web-portal/src/**/*.test.{ts,tsx}'],
    // Phase 0: suites land with the packages in Phase 2; don't fail CI before then.
    passWithNoTests: true,
  },
});
