import type {
  NativeApplicationSettings,
  NativeTargetArchitecture,
  NativeTargetPlatform,
} from '@webrad/project-model';

export interface NativeHost {
  readonly platform: string;
  readonly architecture: string;
}
export interface NativeCommand {
  readonly args: readonly string[];
  readonly stage: 'compiling-native' | 'packaging';
}
export interface NativeBuildPlan {
  readonly platform: Exclude<NativeTargetPlatform, 'web'>;
  readonly rustTargets: readonly string[];
  readonly cliTarget: string;
  readonly commands: readonly NativeCommand[];
}
function hostArchitecture(host: NativeHost): NativeTargetArchitecture {
  if (host.architecture === 'x64') return 'x64';
  if (host.architecture === 'arm64') return 'arm64';
  if (host.architecture === 'ia32') return 'x86';
  throw new Error(`Unsupported host architecture: ${host.architecture}.`);
}
export function createNativeBuildPlan(
  settings: NativeApplicationSettings,
  host: NativeHost = { platform: process.platform, architecture: process.arch },
): NativeBuildPlan {
  const { platform, architecture, bundleFormat, configuration } = settings.build;
  if (platform === 'web') throw new Error('Web/PWA uses the WebRAD compiler and Deploy flow.');
  const expectedHost = {
    windows: 'win32',
    linux: 'linux',
    macos: 'darwin',
    ios: 'darwin',
    android: host.platform,
  }[platform];
  if (host.platform !== expectedHost)
    throw new Error(
      `${platform} requires a ${expectedHost} host. Export the build project to a compatible CI runner.`,
    );
  const arch =
    architecture === 'host'
      ? platform === 'android'
        ? 'arm64'
        : platform === 'ios'
          ? 'arm64'
          : hostArchitecture(host)
      : architecture;
  const triples: Record<string, Partial<Record<NativeTargetArchitecture, string>>> = {
    windows: {
      x64: 'x86_64-pc-windows-msvc',
      x86: 'i686-pc-windows-msvc',
      arm64: 'aarch64-pc-windows-msvc',
    },
    linux: { x64: 'x86_64-unknown-linux-gnu', arm64: 'aarch64-unknown-linux-gnu' },
    macos: {
      x64: 'x86_64-apple-darwin',
      arm64: 'aarch64-apple-darwin',
      universal: 'universal-apple-darwin',
    },
    android: {
      arm64: 'aarch64-linux-android',
      armv7: 'armv7-linux-androideabi',
      x86: 'i686-linux-android',
      x64: 'x86_64-linux-android',
    },
    ios: {
      arm64: 'aarch64-apple-ios',
      'arm64-simulator': 'aarch64-apple-ios-sim',
      x64: 'x86_64-apple-ios',
    },
  };
  const target = triples[platform]?.[arch];
  if (!target) throw new Error(`Architecture ${architecture} is not supported for ${platform}.`);
  if (platform === 'linux' && arch !== hostArchitecture(host))
    throw new Error(
      'Linux cross compilation requires a configured linker and target sysroot. Use a runner matching the target architecture.',
    );
  const formats: Record<Exclude<NativeTargetPlatform, 'web'>, readonly string[]> = {
    windows: ['exe', 'nsis', 'msi'],
    linux: ['deb', 'rpm', 'appimage'],
    macos: ['app', 'dmg'],
    android: ['apk', 'aab'],
    ios: ['ios-app', 'ipa'],
  };
  if (!formats[platform].includes(bundleFormat))
    throw new Error(`Bundle format ${bundleFormat} is not supported for ${platform}.`);
  if (platform === 'ios' && bundleFormat === 'ipa' && arch !== 'arm64')
    throw new Error(
      'IPA export requires a physical-device arm64 target and valid Apple signing/provisioning.',
    );
  const debug = configuration === 'debug' ? ['--debug'] : [];
  const mobileTarget =
    platform === 'android'
      ? { arm64: 'aarch64', armv7: 'armv7', x86: 'i686', x64: 'x86_64' }[
          arch as 'arm64' | 'armv7' | 'x86' | 'x64'
        ]
      : { arm64: 'aarch64', 'arm64-simulator': 'aarch64-sim', x64: 'x86_64' }[
          arch as 'arm64' | 'arm64-simulator' | 'x64'
        ];
  const commands: NativeCommand[] =
    platform === 'android'
      ? [
          {
            args: [
              'tauri',
              'android',
              'build',
              '--ci',
              '--target',
              mobileTarget,
              `--${bundleFormat}`,
              ...debug,
            ],
            stage: 'compiling-native',
          },
        ]
      : platform === 'ios'
        ? [
            {
              args: [
                'tauri',
                'ios',
                'build',
                '--ci',
                '--target',
                mobileTarget,
                ...(arch === 'arm64' ? ['--export-method', settings.signing.iosExportMethod] : []),
                ...debug,
              ],
              stage: 'compiling-native',
            },
          ]
        : [
            {
              args: ['tauri', 'build', '--ci', '--target', target, '--no-bundle', ...debug],
              stage: 'compiling-native',
            },
            ...(bundleFormat === 'exe'
              ? []
              : [
                  {
                    args: [
                      'tauri',
                      'bundle',
                      '--ci',
                      '--target',
                      target,
                      '--bundles',
                      bundleFormat,
                      ...debug,
                    ],
                    stage: 'packaging' as const,
                  },
                ]),
          ];
  return {
    platform,
    rustTargets:
      target === 'universal-apple-darwin'
        ? ['x86_64-apple-darwin', 'aarch64-apple-darwin']
        : [target],
    cliTarget: platform === 'android' || platform === 'ios' ? mobileTarget : target,
    commands,
  };
}
