import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NativeApplicationSettings } from '@webrad/project-model';
import type { NativePrerequisite, NativePrerequisiteReport } from './contracts.js';
import { createNativeBuildPlan } from './targets.js';
import {
  NativeProcessError,
  runNativeProcess,
  type NativeProcessOptions,
} from './process-runner.js';

const instructions = 'https://v2.tauri.app/start/prerequisites/';
export interface PrerequisiteOptions {
  readonly signal?: AbortSignal;
  readonly onLog?: NativeProcessOptions['onLog'];
  readonly env?: NodeJS.ProcessEnv;
}
export async function findNativeTool(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const filename = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = (env.PATH ?? env.Path ?? '')
    .split(path.delimiter)
    .filter((part) => path.isAbsolute(part))
    .map((part) => path.join(part, filename));
  if (['cargo', 'rustc', 'rustup', 'cargo-tauri'].includes(name))
    candidates.push(
      path.join(env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'), 'bin', filename),
    );
  if (name === 'java' && env.JAVA_HOME)
    candidates.unshift(path.join(env.JAVA_HOME, 'bin', filename));
  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {
      /* Try the next explicit tool path. */
    }
  }
  return undefined;
}
function versionAtLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}
async function exists(candidate: string | undefined): Promise<boolean> {
  if (!candidate) return false;
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}
async function children(candidate: string): Promise<readonly string[]> {
  try {
    return await readdir(candidate);
  } catch {
    return [];
  }
}
async function hasFiles(candidates: readonly string[]): Promise<boolean> {
  const files = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return (await stat(candidate)).isFile();
      } catch {
        return false;
      }
    }),
  );
  return files.every(Boolean);
}

function windowsHostArchitectures(): readonly string[] {
  return process.arch === 'arm64'
    ? ['arm64', 'x64', 'x86']
    : process.arch === 'ia32'
      ? ['x86']
      : ['x64', 'x86'];
}

async function windowsSdkVersion(
  env: NodeJS.ProcessEnv,
  architecture: string,
): Promise<string | undefined> {
  const root =
    env.WindowsSdkDir ??
    path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10');
  const configuredVersion = env.WindowsSDKVersion?.replace(/[\\/]+$/, '');
  const versions = configuredVersion
    ? [configuredVersion]
    : [...(await children(path.join(root, 'Include')))].sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      );
  for (const version of versions) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) continue;
    // A directory or installer registration alone does not establish that the
    // selected target has both Win32/UCRT headers and import libraries.
    const headersAndLibraries = await hasFiles([
      path.join(root, 'Include', version, 'um', 'Windows.h'),
      path.join(root, 'Include', version, 'shared', 'sdkddkver.h'),
      path.join(root, 'Include', version, 'ucrt', 'stdlib.h'),
      path.join(root, 'Lib', version, 'um', architecture, 'kernel32.lib'),
      path.join(root, 'Lib', version, 'ucrt', architecture, 'ucrt.lib'),
    ]);
    if (!headersAndLibraries) continue;
    for (const host of windowsHostArchitectures())
      if (await hasFiles([path.join(root, 'bin', version, host, 'rc.exe')])) return version;
  }
  return undefined;
}
export async function checkNativePrerequisites(
  settings: NativeApplicationSettings,
  options: PrerequisiteOptions = {},
): Promise<NativePrerequisiteReport> {
  options.signal?.throwIfAborted();
  if (settings.build.platform === 'web')
    return {
      platform: 'web',
      hostPlatform: process.platform,
      ready: true,
      checks: [
        {
          id: 'webrad-compiler',
          name: 'WebRAD compiler',
          status: 'available',
          instruction: 'Included with WebRAD. Web/PWA builds do not require Rust or Tauri.',
        },
      ],
    };
  const checks: NativePrerequisite[] = [];
  // Rustup proxies may install an absent active toolchain even for --version
  // and target list. Inspection must remain read-only, including on CI images.
  const env = options.env ?? process.env;
  const add = (
    id: string,
    name: string,
    available: boolean,
    instruction: string,
    version?: string,
    minimumVersion?: string,
  ) =>
    checks.push({
      id,
      name,
      status: available ? 'available' : 'missing',
      instruction,
      ...(version ? { version } : {}),
      ...(minimumVersion ? { minimumVersion } : {}),
    });
  let plan;
  try {
    plan = createNativeBuildPlan(settings);
  } catch (error) {
    checks.push({
      id: 'platform',
      name: 'Host platform and target',
      status: 'unsupported',
      instruction: error instanceof Error ? error.message : String(error),
    });
  }
  const run = async (command: string, args: readonly string[]) => {
    const started = Date.now();
    options.onLog?.(`[COMPILER] Inspecting ${path.basename(command)} ${args.join(' ')}`, 'stdout');
    try {
      return await runNativeProcess({
        command,
        args,
        cwd: os.tmpdir(),
        env: { ...env, RUSTUP_AUTO_INSTALL: '0' },
        signal: options.signal,
        timeoutMs: 20_000,
        onLog: options.onLog,
      });
    } finally {
      options.onLog?.(
        `[COMPILER] Inspection of ${path.basename(command)} ended after ${Date.now() - started}ms`,
        'stdout',
      );
    }
  };
  const versionCheck = async (
    name: string,
    args: readonly string[],
    minimum?: string,
    instruction?: string,
  ) => {
    const command = await findNativeTool(name, env);
    let detected: string | undefined;
    if (command) {
      try {
        const result = await run(command, args);
        detected = `${result.stdout}\n${result.stderr}`.match(/\b(\d+\.\d+(?:\.\d+)?)/)?.[1];
      } catch (error) {
        if (error instanceof NativeProcessError && error.reason === 'cancelled') throw error;
      }
    }
    const available = detected !== undefined && (!minimum || versionAtLeast(detected, minimum));
    add(
      name,
      name === 'cargo-tauri'
        ? 'Tauri CLI 2'
        : name === 'rustc'
          ? 'Rust compiler (rustc)'
          : name === 'cargo'
            ? 'Cargo (Rust package manager)'
            : name,
      available,
      instruction ?? `Install/configure ${name}${minimum ? ` >= ${minimum}` : ''}. ${instructions}`,
      detected,
      minimum,
    );
    return { command, detected, available };
  };
  await versionCheck('rustc', ['--version'], '1.77.2');
  const cargo = await versionCheck('cargo', ['--version']);
  const cli = await versionCheck(
    'cargo-tauri',
    ['--version'],
    '2.0.0',
    'Install the official Tauri 2 CLI explicitly: cargo install tauri-cli --version "^2" --locked.',
  );
  if (cli.detected && !cli.detected.startsWith('2.')) {
    const check = checks.findIndex((item) => item.id === 'cargo-tauri');
    checks[check] = {
      id: 'cargo-tauri',
      name: 'Tauri CLI 2',
      status: 'unsupported',
      version: cli.detected,
      minimumVersion: '2.0.0',
      instruction: 'This engine requires Tauri CLI major version 2.',
    };
  }
  const rustup = await findNativeTool('rustup', env);
  let installed: readonly string[] = [];
  if (rustup) {
    try {
      installed = (await run(rustup, ['target', 'list', '--installed'])).stdout.split(/\s+/);
    } catch (error) {
      if (error instanceof NativeProcessError && error.reason === 'cancelled') throw error;
    }
  }
  for (const target of plan?.rustTargets ?? [])
    add(
      `rust-target:${target}`,
      `Rust target ${target}`,
      installed.includes(target),
      `Install explicitly: rustup target add ${target}.`,
    );
  if (plan?.platform === 'windows') {
    const architecture = plan.rustTargets[0]?.startsWith('aarch64-')
      ? 'arm64'
      : plan.rustTargets[0]?.startsWith('i686-')
        ? 'x86'
        : 'x64';
    const vswhere = path.join(
      env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe',
    );
    let toolVersion: string | undefined;
    if (await exists(vswhere)) {
      try {
        const installation = (
          await run(vswhere, [
            '-latest',
            '-products',
            '*',
            '-requires',
            architecture === 'arm64'
              ? 'Microsoft.VisualStudio.Component.VC.Tools.ARM64'
              : 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
            '-property',
            'installationPath',
          ])
        ).stdout.trim();
        if (installation && path.isAbsolute(installation)) {
          const version = (
            await readFile(
              path.join(
                installation,
                'VC',
                'Auxiliary',
                'Build',
                'Microsoft.VCToolsVersion.default.txt',
              ),
              'utf8',
            )
          ).trim();
          if (/^\d+\.\d+\.\d+$/.test(version)) {
            const toolRoot = path.join(installation, 'VC', 'Tools', 'MSVC', version);
            for (const host of windowsHostArchitectures()) {
              if (
                await hasFiles([
                  path.join(toolRoot, 'bin', `Host${host}`, architecture, 'cl.exe'),
                  path.join(toolRoot, 'bin', `Host${host}`, architecture, 'link.exe'),
                  path.join(toolRoot, 'lib', architecture, 'vcruntime.lib'),
                ])
              ) {
                toolVersion = version;
                break;
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof NativeProcessError && error.reason === 'cancelled') throw error;
        /* Report a missing installation. */
      }
    }
    add(
      'msvc',
      `MSVC C++ Build Tools (${architecture === 'arm64' ? 'ARM64' : architecture})`,
      toolVersion !== undefined,
      `Install Visual Studio Build Tools with Desktop development with C++ and the ${architecture === 'arm64' ? 'ARM64' : 'x64/x86'} MSVC build tools, including the compiler, linker and runtime libraries. ${instructions}`,
      toolVersion,
    );
    const sdkVersion = await windowsSdkVersion(env, architecture);
    add(
      'windows-sdk',
      `Windows SDK (${architecture === 'arm64' ? 'ARM64' : architecture})`,
      sdkVersion !== undefined,
      `Install a Windows 10/11 SDK with Win32/UCRT headers, ${architecture} libraries and the Windows Resource Compiler. For a custom location, configure WindowsSdkDir. ${instructions}`,
      sdkVersion,
    );
    const webviewRoot = path.join(
      env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      'Microsoft',
      'EdgeWebView',
      'Application',
    );
    add(
      'webview2',
      'Microsoft Edge WebView2 Runtime',
      (await children(webviewRoot)).some((value) => /^\d+\./.test(value)),
      `Install Microsoft Edge WebView2 Evergreen Runtime. ${instructions}`,
    );
    if (settings.build.bundleFormat === 'msi')
      add(
        'vbscript',
        'VBScript host for MSI packaging',
        await exists(path.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'cscript.exe')),
        'Enable the Windows VBScript optional feature for WiX/MSI packaging.',
      );
    if (settings.signing.windowsCertificateThumbprint)
      add(
        'signtool',
        'Windows SDK SignTool',
        Boolean(await findNativeTool('signtool', env)),
        'Install Windows SDK signing tools and make signtool available in PATH. The selected certificate must be installed in the user certificate store.',
      );
  }
  if (plan?.platform === 'linux') {
    const pkgConfig = await versionCheck('pkg-config', ['--version']);
    for (const dependency of [
      'webkit2gtk-4.1',
      'gtk+-3.0',
      'openssl',
      'ayatana-appindicator3-0.1',
    ]) {
      let detected: string | undefined;
      if (pkgConfig.command) {
        try {
          detected = (await run(pkgConfig.command, ['--modversion', dependency])).stdout.trim();
        } catch {
          /* Missing development package. */
        }
      }
      add(
        dependency,
        `${dependency} development libraries`,
        Boolean(detected),
        `Install the ${dependency} development package for your distribution. Debian/Ubuntu: build-essential libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev. ${instructions}`,
        detected,
      );
    }
    add(
      'cc',
      'C/C++ linker',
      Boolean(await findNativeTool('cc', env)),
      `Install your distribution C/C++ build tools. ${instructions}`,
    );
    if (settings.build.bundleFormat === 'appimage')
      add(
        'patchelf',
        'patchelf',
        Boolean(await findNativeTool('patchelf', env)),
        'Install patchelf using the system package manager before AppImage packaging.',
      );
  }
  if (plan?.platform === 'macos' || plan?.platform === 'ios') {
    const xcrun = await findNativeTool('xcrun', env);
    let xcode = false;
    if (xcrun) {
      try {
        await run(xcrun, ['--find', plan.platform === 'ios' ? 'xcodebuild' : 'clang']);
        xcode = true;
      } catch {
        /* Missing Xcode selection. */
      }
    }
    add(
      'xcode',
      plan.platform === 'ios' ? 'Full Xcode and iOS SDK' : 'Xcode Command Line Tools',
      xcode,
      `Install ${plan.platform === 'ios' ? 'full Xcode, launch it and accept its license' : 'Xcode Command Line Tools'}, then configure xcode-select. ${instructions}`,
    );
    if (plan.platform === 'ios') {
      await versionCheck(
        'pod',
        ['--version'],
        undefined,
        'Install CocoaPods for the official Tauri iOS toolchain.',
      );
      if (settings.build.architecture === 'arm64' || settings.build.architecture === 'host')
        add(
          'apple-team',
          'Apple development team',
          Boolean(settings.signing.appleTeamId || env.APPLE_DEVELOPMENT_TEAM),
          'Configure an Apple development team, certificate and valid provisioning profile. Physical device and IPA builds require signing.',
        );
    }
  }
  if (plan?.platform === 'android') {
    await versionCheck(
      'java',
      ['-version'],
      '17.0.0',
      `Install Android Studio JDK 17 or later and configure JAVA_HOME. ${instructions}`,
    );
    const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT;
    add(
      'android-sdk',
      'Android SDK',
      Boolean(sdk) &&
        (await exists(
          path.join(sdk ?? '', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb'),
        )) &&
        (await children(path.join(sdk ?? '', 'platforms'))).length > 0,
      `Configure ANDROID_HOME and install Android SDK Platform, Platform-Tools, Build-Tools and Command-line Tools. ${instructions}`,
    );
    add(
      'android-build-tools',
      'Android Build-Tools and Command-line Tools',
      Boolean(sdk) &&
        (await children(path.join(sdk ?? '', 'build-tools'))).length > 0 &&
        (await exists(path.join(sdk ?? '', 'cmdline-tools'))),
      `Install Android SDK Build-Tools and Command-line Tools using Android Studio SDK Manager. ${instructions}`,
    );
    let ndkVersion: string | undefined;
    if (env.NDK_HOME) {
      try {
        ndkVersion = (await readFile(path.join(env.NDK_HOME, 'source.properties'), 'utf8')).match(
          /Pkg.Revision\s*=\s*([^\r\n]+)/,
        )?.[1];
      } catch {
        /* Missing or invalid NDK. */
      }
    }
    add(
      'android-ndk',
      'Android NDK',
      Boolean(ndkVersion) && (await exists(path.join(env.NDK_HOME ?? '', 'toolchains', 'llvm'))),
      `Install Android NDK (Side by side) and configure NDK_HOME. ${instructions}`,
      ndkVersion,
    );
    const signing = settings.signing;
    const refs = [
      signing.androidKeystorePathEnvironmentVariable,
      signing.androidKeystorePasswordEnvironmentVariable,
      signing.androidKeyAliasEnvironmentVariable,
      signing.androidKeyPasswordEnvironmentVariable,
    ];
    if (refs.some(Boolean))
      add(
        'android-signing',
        'Android release signing environment',
        refs.every((key) => Boolean(key && env[key])) &&
          (await exists(env[signing.androidKeystorePathEnvironmentVariable])),
        'Set all four Android signing environment variables and a readable keystore; passwords remain outside the project.',
      );
    else if (settings.build.bundleFormat === 'aab' || settings.build.configuration === 'release')
      add(
        'android-signing',
        'Android release signing',
        false,
        'Configure keystore, store password, key alias and key password environment variable names for release APK/AAB builds. Select Debug + APK for a development certificate without publication credentials.',
      );
  }
  if (settings.signing.appleNotarizationProfile && plan?.platform === 'macos')
    add(
      'notarization',
      'Apple notarization',
      Boolean(settings.signing.appleSigningIdentity || env.APPLE_SIGNING_IDENTITY),
      'Configure signing identity and an existing notarytool keychain profile on this Mac.',
    );
  if (!cargo.available)
    options.onLog?.(
      'Cargo is unavailable; no native toolchain or dependency will be installed automatically.',
      'stderr',
    );
  options.signal?.throwIfAborted();
  return {
    platform: settings.build.platform,
    hostPlatform: process.platform,
    ready: checks.length > 0 && checks.every((item) => item.status === 'available'),
    checks,
  };
}
