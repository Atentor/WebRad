import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  readdir,
  rm,
  symlink,
  realpath,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NATIVE_APPLICATION_SETTINGS,
  type NativeApplicationSettings,
} from '@webrad/project-model';
import {
  buildNativeApplication,
  checkNativePrerequisites,
  createNativeBuildPlan,
  createTauriConfiguration,
  exportNativeBuildProject,
  generateTauriProject,
  NativeProcessError,
  normalizeNativeNetworkOrigins,
  runNativeProcess,
} from '../src/index.js';
import { configureNativeMobileProject } from '../src/mobile.js';

const temporary: string[] = [];
async function temp(): Promise<string> {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'webrad-native-test-'));
  temporary.push(directory);
  return directory;
}
function settings(
  platform: NativeApplicationSettings['build']['platform'] = 'windows',
  architecture: NativeApplicationSettings['build']['architecture'] = 'host',
  bundleFormat: NativeApplicationSettings['build']['bundleFormat'] = 'nsis',
): NativeApplicationSettings {
  return {
    ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
    build: { ...DEFAULT_NATIVE_APPLICATION_SETTINGS.build, platform, architecture, bundleFormat },
  };
}
const frontend = {
  'index.html':
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><script src="assets/app.js"></script></body></html>',
  'assets/app.js': 'document.body.textContent = "Hello WebRAD";',
  'assets/app.css': 'body{margin:0}',
};
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0)) {
    if (!path.resolve(directory).startsWith((await realpath(os.tmpdir())) + path.sep))
      throw new Error('Unsafe test cleanup path.');
    await rm(directory, { recursive: true, force: true });
  }
});

describe('native target and security contracts', () => {
  it.each([
    ['windows', 'x64', 'nsis', 'win32', 'x64', 'x86_64-pc-windows-msvc'],
    ['windows', 'arm64', 'msi', 'win32', 'x64', 'aarch64-pc-windows-msvc'],
    ['linux', 'arm64', 'deb', 'linux', 'arm64', 'aarch64-unknown-linux-gnu'],
    ['macos', 'universal', 'dmg', 'darwin', 'arm64', 'universal-apple-darwin'],
    ['android', 'arm64', 'apk', 'win32', 'x64', 'aarch64'],
    ['ios', 'arm64-simulator', 'ios-app', 'darwin', 'arm64', 'aarch64-sim'],
  ] as const)(
    'maps %s/%s/%s to the official CLI target',
    (platform, architecture, bundle, host, hostArchitecture, target) => {
      const plan = createNativeBuildPlan(settings(platform, architecture, bundle), {
        platform: host,
        architecture: hostArchitecture,
      });
      expect(plan.cliTarget).toBe(target);
      expect(
        plan.commands.every(
          (command) => command.args[0] === 'tauri' && command.args.includes('--ci'),
        ),
      ).toBe(true);
    },
  );
  it('distinguishes raw Windows executable from installers and reports separate packaging', () => {
    expect(
      createNativeBuildPlan(settings('windows', 'x64', 'exe'), {
        platform: 'win32',
        architecture: 'x64',
      }).commands,
    ).toHaveLength(1);
    expect(
      createNativeBuildPlan(settings('windows', 'x64', 'msi'), {
        platform: 'win32',
        architecture: 'x64',
      }).commands.map((command) => command.stage),
    ).toEqual(['compiling-native', 'packaging']);
  });
  it('rejects unsupported hosts, Linux cross compilation and simulator IPA exports', () => {
    expect(() =>
      createNativeBuildPlan(settings('ios', 'arm64', 'ipa'), {
        platform: 'win32',
        architecture: 'x64',
      }),
    ).toThrow('requires a darwin host');
    expect(() =>
      createNativeBuildPlan(settings('linux', 'arm64', 'deb'), {
        platform: 'linux',
        architecture: 'x64',
      }),
    ).toThrow('sysroot');
    expect(() =>
      createNativeBuildPlan(settings('ios', 'x64', 'ipa'), {
        platform: 'darwin',
        architecture: 'x64',
      }),
    ).toThrow('physical-device');
    expect(() =>
      createNativeBuildPlan(settings('windows', 'x64', 'apk'), {
        platform: 'win32',
        architecture: 'x64',
      }),
    ).toThrow('not supported');
  });
  it('uses the stable CLI simulator app path without an unsupported export flag', () => {
    const args = createNativeBuildPlan(settings('ios', 'arm64-simulator', 'ios-app'), {
      platform: 'darwin',
      architecture: 'arm64',
    }).commands[0]?.args;
    expect(args).toContain('aarch64-sim');
    expect(args).not.toContain('--export-method');
    expect(args).not.toContain('--no-export');
  });
  it('generates restrictive Tauri 2 configuration without frontend native commands', () => {
    const config = createTauriConfiguration(
      { ...settings(), security: { networkOrigins: ['https://api.example.test'] } },
      ['wss://events.example.test'],
    );
    expect(config).toMatchObject({
      $schema: 'https://schema.tauri.app/config/2',
      build: { frontendDist: '../frontend' },
      app: {
        withGlobalTauri: false,
        security: { assetProtocol: { enable: false, scope: [] }, capabilities: ['main-window'] },
      },
    });
    const json = JSON.stringify(config);
    expect(json).toContain("script-src 'self'");
    expect(json).toContain('https://api.example.test');
    expect(json).not.toContain('unsafe-eval');
    expect(json).not.toContain('beforeBuildCommand');
  });
  it.each([
    'https://*.example.test',
    'https://user:password@example.test',
    'https://example.test/path',
    'https://example.test/?token=secret',
    'file:///tmp/test',
  ])('rejects broad or credentialed network origin %s', (origin) =>
    expect(() => normalizeNativeNetworkOrigins([origin])).toThrow(),
  );
  it('validates native metadata rather than passing invalid config to the CLI', () => {
    expect(() =>
      createTauriConfiguration({ ...settings(), identifier: 'bad identifier' }),
    ).toThrow();
    expect(() => createTauriConfiguration({ ...settings(), version: '1.x' })).toThrow();
  });
});

describe('isolated Tauri generator and export', () => {
  it('includes the real compiled frontend, binary assets and Rust mobile entry without Electron', async () => {
    const directory = path.join(await temp(), 'generated');
    await generateTauriProject({
      directory,
      settings: settings(),
      files: frontend,
      binaryFiles: { 'assets/pixel.bin': Uint8Array.from([1, 2, 3, 4]) },
    });
    expect(await readFile(path.join(directory, 'frontend/assets/app.js'), 'utf8')).toBe(
      frontend['assets/app.js'],
    );
    expect([...(await readFile(path.join(directory, 'frontend/assets/pixel.bin')))]).toEqual([
      1, 2, 3, 4,
    ]);
    expect(await readFile(path.join(directory, 'src-tauri/src/lib.rs'), 'utf8')).toContain(
      'tauri::mobile_entry_point',
    );
    expect(await readFile(path.join(directory, 'src-tauri/Cargo.toml'), 'utf8')).toContain(
      'tauri = { version = "2"',
    );
    expect(await readFile(path.join(directory, 'src-tauri/Cargo.toml'), 'utf8')).not.toMatch(
      /electron|native-build/,
    );
    expect(
      JSON.parse(
        await readFile(path.join(directory, 'src-tauri/capabilities/main-window.json'), 'utf8'),
      ).permissions,
    ).toEqual([]);
    expect((await readFile(path.join(directory, 'app-icon.png'))).subarray(1, 4).toString()).toBe(
      'PNG',
    );
  });
  it.each([
    '../outside.txt',
    '/absolute.txt',
    'C:/outside.txt',
    'assets\\outside.txt',
    'assets/CON.txt',
    'assets/file.txt:stream',
    'assets/../outside.txt',
  ])('rejects traversal and nonportable output %s before writing', async (filename) => {
    const root = await temp();
    const directory = path.join(root, 'generated');
    await expect(
      generateTauriProject({
        directory,
        settings: settings(),
        files: { ...frontend, [filename]: 'unsafe' },
      }),
    ).rejects.toThrow('Unsafe');
    expect(await readdir(root)).toEqual([]);
  });
  it('preserves existing source and rejects case-insensitive asset collisions', async () => {
    const directory = await temp();
    await writeFile(path.join(directory, 'authored.ts'), 'keep me');
    await expect(
      generateTauriProject({ directory, settings: settings(), files: frontend }),
    ).rejects.toThrow('empty directory');
    expect(await readFile(path.join(directory, 'authored.ts'), 'utf8')).toBe('keep me');
    await expect(
      generateTauriProject({
        directory: path.join(await temp(), 'generated'),
        settings: settings(),
        files: { ...frontend, 'assets/APP.js': 'duplicate' },
      }),
    ).rejects.toThrow('Duplicate');
  });
  it('rejects directory symlinks and junctions', async () => {
    const root = await temp();
    const outside = await temp();
    const link = path.join(root, 'linked');
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(
      generateTauriProject({
        directory: path.join(link, 'generated'),
        settings: settings(),
        files: frontend,
      }),
    ).rejects.toThrow('ordinary directory');
    expect(await readdir(outside)).toEqual([]);
  });
  it('refuses native frontend that would still install a PWA worker', async () => {
    await expect(
      generateTauriProject({
        directory: path.join(await temp(), 'generated'),
        settings: settings(),
        files: { ...frontend, 'index.html': '<script src="assets/pwa-register.js"></script>' },
      }),
    ).rejects.toThrow('native target');
  });
  it('exports manual CI desktop and mobile jobs with shared mobile setup and no publishing', async () => {
    const directory = path.join(await temp(), 'export');
    await exportNativeBuildProject({ directory, settings: settings(), files: frontend });
    const workflow = await readFile(
      path.join(directory, '.github/workflows/native-application.yml'),
      'utf8',
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('android:');
    expect(workflow).toContain('ios:');
    expect(workflow).toContain('node configure-mobile.mjs android');
    expect(workflow).toContain('node configure-mobile.mjs ios');
    expect(workflow).toContain('--skip-targets-install');
    expect(workflow).not.toMatch(/contents: write|gh release|Atentor\/WebRad|publish:/);
  });
  it('runs the shared mobile setup using real Node and preserves only environment refs in Gradle', async () => {
    const directory = path.join(await temp(), 'mobile');
    const options: NativeApplicationSettings = {
      ...settings('android', 'arm64', 'apk'),
      mobile: { ...settings().mobile, orientation: 'landscape', fullscreen: true, safeArea: false },
      signing: {
        ...settings().signing,
        androidKeystorePathEnvironmentVariable: 'APP_STORE_FILE',
        androidKeystorePasswordEnvironmentVariable: 'APP_STORE_PASSWORD',
        androidKeyAliasEnvironmentVariable: 'APP_KEY_ALIAS',
        androidKeyPasswordEnvironmentVariable: 'APP_KEY_PASSWORD',
      },
    };
    await generateTauriProject({ directory, settings: options, files: frontend });
    const android = path.join(directory, 'src-tauri/gen/android/app');
    const java = path.join(android, 'src/main/java/com/example/application');
    await mkdir(java, { recursive: true });
    await writeFile(
      path.join(java, 'MainActivity.kt'),
      'package com.example.application\nimport app.tauri.TauriActivity\nclass MainActivity : TauriActivity() {}',
    );
    await writeFile(
      path.join(android, 'src/main/AndroidManifest.xml'),
      '<manifest><application><activity android:name=".MainActivity" /></application></manifest>',
    );
    await writeFile(path.join(android, 'build.gradle.kts'), 'plugins {}\nandroid {}\n');
    await runNativeProcess({
      command: process.execPath,
      args: [path.join(directory, 'configure-mobile.mjs'), 'android'],
      cwd: directory,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    expect(await readFile(path.join(java, 'MainActivity.kt'), 'utf8')).toContain(
      'package com.example.application',
    );
    expect(await readFile(path.join(java, 'MainActivity.kt'), 'utf8')).toContain(
      'setDecorFitsSystemWindows(window, false)',
    );
    expect(await readFile(path.join(android, 'src/main/AndroidManifest.xml'), 'utf8')).toContain(
      'android:screenOrientation="landscape"',
    );
    expect(await readFile(path.join(android, 'build.gradle.kts'), 'utf8')).toContain(
      'System.getenv("APP_STORE_PASSWORD")',
    );
    const paths = [
      'src/main/java/com/example/application/MainActivity.kt',
      'src/main/AndroidManifest.xml',
      'build.gradle.kts',
    ];
    const scriptOutput = await Promise.all(
      paths.map((filename) => readFile(path.join(android, filename), 'utf8')),
    );
    await writeFile(
      path.join(java, 'MainActivity.kt'),
      'package com.example.application\nimport app.tauri.TauriActivity\nclass MainActivity : TauriActivity() {}',
    );
    await writeFile(
      path.join(android, 'src/main/AndroidManifest.xml'),
      '<manifest><application><activity android:name=".MainActivity" /></application></manifest>',
    );
    await writeFile(path.join(android, 'build.gradle.kts'), 'plugins {}\nandroid {}\n');
    // The packaged IDE runs this directly with its RunAsNode fuse disabled.
    await configureNativeMobileProject(directory, options);
    const mainOutput = await Promise.all(
      paths.map((filename) => readFile(path.join(android, filename), 'utf8')),
    );
    expect(mainOutput).toEqual(scriptOutput);
  });
});

describe('real native process execution and failures', () => {
  it('captures stdout/stderr and preserves shell-looking arguments literally', async () => {
    const literal = '$(echo secret); & | > < %PATH%';
    const output = await runNativeProcess({
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write(process.argv[1]); process.stderr.write("diagnostic");',
        literal,
      ],
      cwd: await temp(),
    });
    expect(output.stdout.trim()).toBe(literal);
    expect(output.stderr.trim()).toBe('diagnostic');
  });
  it('redacts split secret chunks and HTTP credentials before listeners and retained output', async () => {
    const log: string[] = [];
    const output = await runNativeProcess({
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write("split-"); setTimeout(() => { process.stdout.write("secret https://user:password@api.example.test Bearer eyJ.token.value\\n"); }, 10);',
      ],
      cwd: await temp(),
      secrets: ['split-secret'],
      onLog: (message) => log.push(message),
    });
    expect(log.join('\n')).not.toContain('split-secret');
    expect(output.stdout).not.toContain('user:password');
    expect(output.stdout).not.toContain('eyJ.token.value');
    expect(output.stdout).toContain('[REDACTED]');
  });
  it('cancels a running native process after its real readiness output', async () => {
    const controller = new AbortController();
    const running = runNativeProcess({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000);'],
      cwd: await temp(),
      signal: controller.signal,
      onLog: (message) => {
        if (message === 'ready') controller.abort();
      },
    });
    await expect(running).rejects.toMatchObject({ reason: 'cancelled' });
  });
  it('cancels the native process tree, including a running compiler child', async () => {
    const controller = new AbortController();
    let compilerPid: number | undefined;
    const directory = await temp();
    const heartbeat = path.join(directory, 'compiler-heartbeat.txt');
    const compilerSource = `const fs=require('node:fs');const filename=${JSON.stringify(heartbeat)};fs.writeFileSync(filename,'started');setInterval(()=>fs.appendFileSync(filename,'.'),20);process.stdout.write('ready\\n');`;
    const source = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(compilerSource)}],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>process.stdout.write('compiler:'+child.pid+'\\n'));setInterval(()=>{},1000);`;
    await expect(
      runNativeProcess({
        command: process.execPath,
        args: ['-e', source],
        cwd: directory,
        signal: controller.signal,
        onLog: (line) => {
          if (line.startsWith('compiler:')) {
            compilerPid = Number(line.slice(9));
            controller.abort();
          }
        },
      }),
    ).rejects.toMatchObject({ reason: 'cancelled' });
    expect(compilerPid).toBeTypeOf('number');
    const before = await readFile(heartbeat, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await readFile(heartbeat, 'utf8')).toBe(before);
  });
  it('terminates on timeout and reports nonzero exits and spawn errors', async () => {
    await expect(
      runNativeProcess({
        command: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000);'],
        cwd: await temp(),
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ reason: 'timeout' });
    await expect(
      runNativeProcess({
        command: process.execPath,
        args: ['-e', 'process.stderr.write("compiler failed");process.exit(3);'],
        cwd: await temp(),
      }),
    ).rejects.toMatchObject({
      reason: 'failed',
      result: { exitCode: 3, stderr: expect.stringContaining('compiler failed') },
    });
    await expect(
      runNativeProcess({
        command: path.join(await temp(), 'missing-native-tool'),
        args: [],
        cwd: os.tmpdir(),
      }),
    ).rejects.toBeInstanceOf(NativeProcessError);
  });
  it('reports missing tools objectively without installation or fake native artifacts', async () => {
    const directory = await temp();
    const env = { PATH: '', Path: '', CARGO_HOME: path.join(directory, 'missing-cargo') };
    const report = await checkNativePrerequisites(settings('android', 'arm64', 'apk'), { env });
    expect(report.ready).toBe(false);
    expect(report.checks.find((item) => item.id === 'cargo')?.status).toBe('missing');
    expect(report.checks.find((item) => item.id === 'java')?.instruction).toContain('JAVA_HOME');
    vi.stubEnv('PATH', '');
    vi.stubEnv('Path', '');
    vi.stubEnv('CARGO_HOME', path.join(directory, 'missing-cargo'));
    const result = await buildNativeApplication({
      buildId: 'missing-toolchain',
      settings: settings(),
      files: frontend,
      workspaceRoot: path.join(directory, 'workspace'),
      outputDirectory: path.join(directory, 'output'),
    });
    expect(result.status).toBe('failed');
    expect(result.artifacts).toEqual([]);
    expect(result.prerequisites?.ready).toBe(false);
    expect(
      await readFile(path.join(result.workspaceDirectory, 'native-build.log'), 'utf8'),
    ).toContain('No system tools are installed automatically');
  });
  it('rejects a cancelled build before creating a workspace', async () => {
    const directory = await temp();
    const controller = new AbortController();
    controller.abort();
    const result = await buildNativeApplication({
      buildId: 'cancelled',
      settings: settings(),
      files: frontend,
      workspaceRoot: path.join(directory, 'workspace'),
      outputDirectory: path.join(directory, 'output'),
      signal: controller.signal,
    });
    expect(result.status).toBe('cancelled');
    expect(await readdir(directory)).toEqual([]);
  });
});
