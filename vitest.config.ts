import { configDefaults, defineConfig } from 'vitest/config';

// Compilation, compiled Preview and UI interaction tests need headroom on shared CI runners.
const integrationTestFiles = [
  'packages/compiler/**/*.test.{ts,tsx}',
  'apps/ide/renderer/src/**/*.test.tsx',
  'tests/**/*.test.{ts,tsx}',
];

const ideIntegrationTestFiles = ['apps/ide/renderer/src/App.integration.test.tsx'];

export default defineConfig({
  test: {
    environment: 'node',
    // Bound CPU/memory contention consistently in local tests, validation and releases.
    maxWorkers: 2,
    minWorkers: 1,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'apps/**/*.test.{ts,tsx}',
            'packages/**/*.test.{ts,tsx}',
            'tests/**/*.test.{ts,tsx}',
          ],
          exclude: [...configDefaults.exclude, ...integrationTestFiles],
          testTimeout: 5_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: integrationTestFiles,
          testTimeout: 30_000,
          exclude: [...configDefaults.exclude, ...ideIntegrationTestFiles],
        },
      },
      // Run full IDE workflows after other tests to avoid contention with compilation.
      {
        extends: true,
        test: {
          name: 'ide',
          include: ideIntegrationTestFiles,
          testTimeout: 30_000,
          sequence: {
            groupOrder: 1,
          },
        },
      },
    ],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
