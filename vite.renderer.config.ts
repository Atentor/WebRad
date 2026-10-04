import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const workspacePackages = [
  '@webrad/compiler',
  '@webrad/component-registry',
  '@webrad/components',
  '@webrad/designer',
  '@webrad/language',
  '@webrad/project-model',
  '@webrad/restgo-sdk',
  '@webrad/runtime',
] as const;

export default defineConfig({
  root: path.join(repositoryRoot, 'apps/ide/renderer'),
  plugins: [react()],
  // Workspace packages are source-first and change without an npm version bump.
  // Serving them directly prevents Vite from reusing a stale optimized bundle
  // after a public export is added or renamed.
  optimizeDeps: {
    exclude: [...workspacePackages],
    force: true,
    // Language services import the CommonJS TypeScript distribution, which
    // still needs Vite's ESM interop even when its workspace consumer is excluded.
    include: ['typescript'],
  },
  build: {
    outDir: path.join(repositoryRoot, '.vite', 'renderer', 'main_window'),
    // Monaco and the TypeScript worker contain several megabytes of generated sources. Rollup's
    // production source-map graph pushes the renderer beyond the package command's 4 GB heap.
    // DevTools still maps the unbundled development server sources; release bundles omit maps.
    sourcemap: false,
  },
});
