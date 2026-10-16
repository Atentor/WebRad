import type { ForgeConfig } from '@electron-forge/shared-types';
import { promises as fs } from 'node:fs';
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
const jetBrainsMonoLicensePath = path.resolve('licenses', 'JetBrainsMono-OFL.txt');

const productionNodeModulesPath = path.resolve('node_modules');

function packageDirectory(packageName: string): string {
  return path.join(productionNodeModulesPath, ...packageName.split('/'));
}

async function copyNativeRuntimeDependencies(buildPath: string): Promise<void> {
  const pending = ['@tailwindcss/postcss', 'postcss', 'sharp'];
  const copied = new Set<string>();

  while (pending.length > 0) {
    const packageName = pending.pop();
    if (packageName === undefined || copied.has(packageName)) continue;
    const source = packageDirectory(packageName);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')) as {
        readonly dependencies?: Readonly<Record<string, string>>;
        readonly optionalDependencies?: Readonly<Record<string, string>>;
      };
      const target = path.join(buildPath, 'node_modules', ...packageName.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(source, target, {
        recursive: true,
        dereference: true,
        filter: (candidate) => !candidate.startsWith(path.join(source, 'node_modules')),
      });
      copied.add(packageName);
      pending.push(...Object.keys(manifest.dependencies ?? {}));
      for (const optionalPackage of Object.keys(manifest.optionalDependencies ?? {})) {
        try {
          await fs.access(packageDirectory(optionalPackage));
          pending.push(optionalPackage);
        } catch {
          // Platform-specific optional packages that are not installed are omitted.
        }
      }
    } catch (error) {
      throw new Error(`Unable to package runtime dependency "${packageName}".`, {
        cause: error,
      });
    }
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.atentor.webrad',
    ...(process.platform === 'darwin' && process.env.WEBRAD_MAC_SIGNED === 'true'
      ? {
          osxSign: {
            identity: process.env.APPLE_SIGNING_IDENTITY,
            keychain: process.env.WEBRAD_MAC_KEYCHAIN,
            optionsForFile: () => ({
              hardenedRuntime: true,
              entitlements: path.resolve('scripts', 'macos-entitlements.plist'),
            }),
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
    asar: { unpack: '{**/*.node,**/node_modules/@img/**/*}' },
    icon: iconBasePath,
    extraResource: [
      iconIcoPath,
      iconPngPath,
      jetBrainsMonoLicensePath,
      path.resolve('node_modules', 'esbuild'),
      path.resolve('node_modules', '@esbuild', `${process.platform}-${process.arch}`),
      path.resolve('node_modules', 'typescript'),
    ],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterPrune: async (_forgeConfig, buildPath) => {
      await copyNativeRuntimeDependencies(buildPath);
    },
  },
  makers: [
    new MakerSquirrel({
      authors: 'WebRAD',
      setupIcon: iconIcoPath,
      nuspecTemplate: path.resolve('scripts', 'windows-installer.nuspectemplate'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        name: 'webrad',
        productName: 'WebRad',
        bin: 'WebRad',
        icon: iconPngPath,
        homepage: 'https://webrad.atentor.com',
        maintainer: 'Atentor',
        categories: ['Development'],
      },
    }),
    new MakerRpm({
      options: {
        name: 'webrad',
        productName: 'WebRad',
        bin: 'WebRad',
        icon: iconPngPath,
        homepage: 'https://webrad.atentor.com',
        license: 'Proprietary',
        categories: ['Development'],
      },
    }),
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
