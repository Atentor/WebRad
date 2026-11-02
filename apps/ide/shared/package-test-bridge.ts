import type { PackagesBridge } from './package-contracts';

/** Empty-package fixture for workflows that do not exercise external libraries. */
export function createPackageTestBridge(): PackagesBridge {
  const state = {
    dependencies: [],
    toolchain: { available: false, message: 'NPM is unavailable in this test fixture.' },
    revision: 'empty',
  };
  return {
    status: async () => state,
    run: async (request) => ({
      success: false,
      error: 'Package operations are outside this fixture.',
      state,
      project: request.project,
    }),
    search: async (request) => ({ packages: [], total: 0, offset: request.offset ?? 0 }),
    cancel: async () => undefined,
    types: async () => ({ revision: 'empty', files: {}, warnings: [] }),
    subscribe: () => () => undefined,
  };
}
