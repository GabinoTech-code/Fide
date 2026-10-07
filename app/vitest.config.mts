import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web-portal/src/**/*.test.{ts,tsx}', 'apps/mobile/src/lib/**/*.test.ts', 'apps/site/src/**/*.test.ts'],
    // Phase 0: suites land with the packages in Phase 2; don't fail CI before then.
    passWithNoTests: true,
  },
});
