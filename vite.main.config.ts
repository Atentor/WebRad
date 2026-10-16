import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __WEBRAD_RELEASE_REPOSITORY__: JSON.stringify(
      process.env.WEBRAD_RELEASE_REPOSITORY || 'Atentor/WebRad-Releases',
    ),
  },
  build: {
    // Tailwind's PostCSS plugin loads a platform-native Oxide binary. Keep the
    // Node packages external so Electron can load the packaged native module.
    rollupOptions: {
      external: ['@tailwindcss/postcss', 'postcss', 'sharp'],
    },
    sourcemap: true,
  },
});
