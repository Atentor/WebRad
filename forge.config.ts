import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';

const iconBasePath = path.resolve('Icon');
const iconIcoPath = path.resolve('Icon.ico');
const iconPngPath = path.resolve('Icon.png');

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: iconBasePath,
    extraResource: [
      iconIcoPath,
      iconPngPath,
      path.resolve('node_modules', 'esbuild'),
      path.resolve('node_modules', '@esbuild', `${process.platform}-${process.arch}`),
      path.resolve('node_modules', 'typescript'),
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ authors: 'WebRAD', setupIcon: iconIcoPath }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({ options: { icon: iconPngPath } }),
    new MakerRpm({ options: { icon: iconPngPath } }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'apps/ide/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'apps/ide/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
