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
    sourcemap: true,
  },
});
