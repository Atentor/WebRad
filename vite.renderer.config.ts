import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repositoryRoot, 'apps/ide/renderer'),
  plugins: [react()],
  build: {
    outDir: path.join(repositoryRoot, '.vite', 'renderer', 'main_window'),
    // Monaco and the TypeScript worker contain several megabytes of generated sources. Rollup's
    // production source-map graph pushes the renderer beyond the package command's 4 GB heap.
    // DevTools still maps the unbundled development server sources; release bundles omit maps.
    sourcemap: false,
  },
});
