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
  '@webrad/native-build',
  '@webrad/project-model',
  '@webrad/restgo-sdk',
  '@webrad/runtime',
] as const;

export default defineConfig({
  root: path.join(repositoryRoot, 'apps/ide/renderer'),
  plugins: [react()],
  server: {
    headers: {
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  },
  // Workspace packages are source-first and change without an npm version bump.
  // Serving them directly prevents Vite from reusing a stale optimized bundle
  // after a public export is added or renamed.
  optimizeDeps: {
    exclude: [...workspacePackages],
    force: true,
    // TypeScript and pdf-lib's CommonJS dependencies (including pako) need
    // Vite's ESM interop even when their workspace consumers are excluded.
    // Preload the custom worker's Monaco dependency to avoid a renderer reload
    // when the Code view starts its language service for the first time.
    include: ['typescript', 'pdf-lib', 'monaco-editor/languages/features/typescript/ts.worker.js'],
  },
  build: {
    outDir: path.join(repositoryRoot, '.vite', 'renderer', 'main_window'),
    // Monaco and the TypeScript worker contain several megabytes of generated sources. Rollup's
    // production source-map graph pushes the renderer beyond the package command's 4 GB heap.
    // DevTools still maps the unbundled development server sources; release bundles omit maps.
    sourcemap: false,
  },
});
