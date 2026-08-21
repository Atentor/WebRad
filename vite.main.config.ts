import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Tailwind's PostCSS plugin loads a platform-native Oxide binary. Keep the
    // Node packages external so Electron can load the packaged native module.
    rollupOptions: {
      external: ['@tailwindcss/postcss', 'postcss'],
    },
    sourcemap: true,
  },
});
