import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import { checkNativePrerequisites } from '../src/prerequisites.js';
import { NativeProcessError, runNativeProcess } from '../src/process-runner.js';
import type * as NativeProcessModule from '../src/process-runner.js';

vi.mock('../src/process-runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof NativeProcessModule>()),
  runNativeProcess: vi.fn(),
}));

const temporary: string[] = [];
const toolVersion = '14.44.35207';
const sdkVersion = '10.0.26100.0';

async function file(filename: string, contents = ''): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
}

async function windowsFixture() {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'webrad-prerequisites-'));
  temporary.push(root);
  const installation = path.join(root, 'VisualStudio');
  const programFiles = path.join(root, 'ProgramFiles');
  const sdk = path.join(programFiles, 'Windows Kits', '10');
  const env = {
    PATH: '',
    CARGO_HOME: path.join(root, 'cargo'),
    'ProgramFiles(x86)': programFiles,
  };
  await file(path.join(programFiles, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'));
  vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'x64' });
  vi.mocked(runNativeProcess).mockResolvedValue({
    exitCode: 0,
    stdout: installation,
    stderr: '',
  });
  const original = createProject('WindowsPrerequisites').settings.nativeApplication;
  return {
    root,
    installation,
    sdk,
    env,
    settings: {
      ...original,
      build: {
        ...original.build,
        platform: 'windows' as const,
        architecture: 'x64' as const,
        bundleFormat: 'exe' as const,
      },
    },
  };
}

async function installMsvcFixture(installation: string, architecture = 'x64'): Promise<void> {
  await file(
    path.join(installation, 'VC', 'Auxiliary', 'Build', 'Microsoft.VCToolsVersion.default.txt'),
    `${toolVersion}\r\n`,
  );
  const tools = path.join(installation, 'VC', 'Tools', 'MSVC', toolVersion);
  await Promise.all([
    file(path.join(tools, 'bin', 'Hostx64', architecture, 'cl.exe')),
    file(path.join(tools, 'bin', 'Hostx64', architecture, 'link.exe')),
    file(path.join(tools, 'lib', architecture, 'vcruntime.lib')),
  ]);
}

async function installSdkFixture(
  root: string,
  architecture = 'x64',
  version = sdkVersion,
): Promise<void> {
  await Promise.all([
    file(path.join(root, 'Include', version, 'um', 'Windows.h')),
    file(path.join(root, 'Include', version, 'shared', 'sdkddkver.h')),
    file(path.join(root, 'Include', version, 'ucrt', 'stdlib.h')),
    file(path.join(root, 'Lib', version, 'um', architecture, 'kernel32.lib')),
    file(path.join(root, 'Lib', version, 'ucrt', architecture, 'ucrt.lib')),
    file(path.join(root, 'bin', version, 'x64', 'rc.exe')),
  ]);
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const directory of temporary.splice(0)) {
    if (!path.resolve(directory).startsWith((await realpath(os.tmpdir())) + path.sep))
      throw new Error('Unsafe prerequisite fixture cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
});

describe('native prerequisite inspection', () => {
  it('reports the included Web compiler without native toolchain requirements or invented versions', async () => {
    const original = createProject('WebPrerequisites').settings.nativeApplication;
    const report = await checkNativePrerequisites(
      { ...original, build: { ...original.build, platform: 'web', bundleFormat: 'web' } },
      { env: { PATH: '' } },
    );
    expect(report).toEqual({
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
    });
  });

  it('does not return a ready report for an already cancelled inspection', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      checkNativePrerequisites(createProject('Cancelled').settings.nativeApplication, {
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it('does not mark a Windows SDK as installed just because MSVC is installed', async () => {
    const fixture = await windowsFixture();
    await installMsvcFixture(fixture.installation);
    const report = await checkNativePrerequisites(fixture.settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'msvc')).toMatchObject({
      status: 'available',
      name: 'MSVC C++ Build Tools (x64)',
      version: toolVersion,
    });
    expect(report.checks.find((check) => check.id === 'windows-sdk')).toMatchObject({
      status: 'missing',
      name: 'Windows SDK (x64)',
    });
    expect(report.ready).toBe(false);
  });

  it('reports a complete SDK independently from a missing MSVC toolset', async () => {
    const fixture = await windowsFixture();
    await installSdkFixture(fixture.sdk);
    const report = await checkNativePrerequisites(fixture.settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'msvc')?.status).toBe('missing');
    expect(report.checks.find((check) => check.id === 'windows-sdk')).toMatchObject({
      status: 'available',
      version: sdkVersion,
    });
  });

  it('does not reuse x64 compiler, linker or SDK libraries for an ARM64 target', async () => {
    const fixture = await windowsFixture();
    await installMsvcFixture(fixture.installation);
    await installSdkFixture(fixture.sdk);
    const settings = {
      ...fixture.settings,
      build: { ...fixture.settings.build, architecture: 'arm64' as const },
    };
    const report = await checkNativePrerequisites(settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'msvc')).toMatchObject({
      status: 'missing',
      name: 'MSVC C++ Build Tools (ARM64)',
    });
    expect(report.checks.find((check) => check.id === 'windows-sdk')).toMatchObject({
      status: 'missing',
      name: 'Windows SDK (ARM64)',
    });
    expect(vi.mocked(runNativeProcess).mock.calls[0]?.[0].args).toContain(
      'Microsoft.VisualStudio.Component.VC.Tools.ARM64',
    );
  });

  it('detects ARM64 cross tools and libraries with a resource compiler that runs on the x64 host', async () => {
    const fixture = await windowsFixture();
    await installMsvcFixture(fixture.installation, 'arm64');
    await installSdkFixture(fixture.sdk, 'arm64');
    const settings = {
      ...fixture.settings,
      build: { ...fixture.settings.build, architecture: 'arm64' as const },
    };
    const report = await checkNativePrerequisites(settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'msvc')?.status).toBe('available');
    expect(report.checks.find((check) => check.id === 'windows-sdk')?.status).toBe('available');
  });

  it.each([
    ['Win32 headers', ['Include', sdkVersion, 'um', 'Windows.h']],
    ['UCRT headers', ['Include', sdkVersion, 'ucrt', 'stdlib.h']],
    ['target import libraries', ['Lib', sdkVersion, 'um', 'x64', 'kernel32.lib']],
    ['target UCRT libraries', ['Lib', sdkVersion, 'ucrt', 'x64', 'ucrt.lib']],
    ['resource compiler', ['bin', sdkVersion, 'x64', 'rc.exe']],
  ])('does not mark an incomplete SDK ready without %s', async (_name, segments) => {
    const fixture = await windowsFixture();
    await installSdkFixture(fixture.sdk);
    await rm(path.join(fixture.sdk, ...segments));
    const report = await checkNativePrerequisites(fixture.settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'windows-sdk')?.status).toBe('missing');
  });

  it('does not combine headers and libraries from different SDK versions', async () => {
    const fixture = await windowsFixture();
    await installSdkFixture(fixture.sdk);
    await rm(path.join(fixture.sdk, 'Include', sdkVersion, 'um', 'Windows.h'));
    await file(path.join(fixture.sdk, 'Include', '10.0.22621.0', 'um', 'Windows.h'));
    const report = await checkNativePrerequisites(fixture.settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'windows-sdk')?.status).toBe('missing');
  });

  it('honors a custom SDK location and explicitly selected version', async () => {
    const fixture = await windowsFixture();
    const customSdk = path.join(fixture.root, 'CustomSdk');
    await installSdkFixture(customSdk);
    const env = { ...fixture.env, WindowsSdkDir: customSdk, WindowsSDKVersion: `${sdkVersion}\\` };
    const report = await checkNativePrerequisites(fixture.settings, { env });
    expect(report.checks.find((check) => check.id === 'windows-sdk')).toMatchObject({
      status: 'available',
      version: sdkVersion,
    });
    const missingVersion = await checkNativePrerequisites(fixture.settings, {
      env: { ...env, WindowsSDKVersion: '10.0.22621.0\\' },
    });
    expect(missingVersion.checks.find((check) => check.id === 'windows-sdk')?.status).toBe(
      'missing',
    );
  });

  it('does not treat a component registration with a missing linker as a usable MSVC toolset', async () => {
    const fixture = await windowsFixture();
    await installMsvcFixture(fixture.installation);
    await rm(
      path.join(
        fixture.installation,
        'VC',
        'Tools',
        'MSVC',
        toolVersion,
        'bin',
        'Hostx64',
        'x64',
        'link.exe',
      ),
    );
    const report = await checkNativePrerequisites(fixture.settings, { env: fixture.env });
    expect(report.checks.find((check) => check.id === 'msvc')?.status).toBe('missing');
  });

  it('propagates cancellation during Visual Studio inspection', async () => {
    const fixture = await windowsFixture();
    vi.mocked(runNativeProcess).mockRejectedValue(new NativeProcessError('Cancelled', 'cancelled'));
    await expect(
      checkNativePrerequisites(fixture.settings, { env: fixture.env }),
    ).rejects.toMatchObject({
      reason: 'cancelled',
    });
  });
});
