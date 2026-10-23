import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import { checkNativePrerequisites } from '@webrad/native-build';
import type * as NativeProcessModule from '../packages/native-build/src/process-runner.js';

// Keep process execution, deadlines and termination real. Only replace the Rust
// executable with a portable child that deliberately never answers --version.
vi.mock('../packages/native-build/src/process-runner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof NativeProcessModule>();
  return {
    ...actual,
    runNativeProcess: (options: NativeProcessModule.NativeProcessOptions) =>
      actual.runNativeProcess({
        ...options,
        command: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000);'],
      }),
  };
});

it('finishes the checklist before smoke readiness expires when a real tool process never responds', async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'webrad-stalled-tool-'));
  try {
    await writeFile(path.join(root, process.platform === 'win32' ? 'rustc.exe' : 'rustc'), '', {
      mode: 0o755,
    });
    const settings = createProject('StalledTool').settings.nativeApplication;
    const log: string[] = [];
    const started = performance.now();
    const report = await checkNativePrerequisites(
      {
        ...settings,
        build: { ...settings.build, platform: 'windows', architecture: 'x64', bundleFormat: 'exe' },
      },
      {
        env: {
          ...process.env,
          PATH: root,
          Path: root,
          CARGO_HOME: path.join(root, 'cargo'),
          'ProgramFiles(x86)': path.join(root, 'program-files'),
          WindowsSdkDir: path.join(root, 'sdk'),
        },
        onLog: (message) => log.push(message),
      },
    );
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(report.ready).toBe(false);
    expect(report.checks.find((check) => check.id === 'rustc')).toMatchObject({
      status: 'missing',
      instruction: expect.stringContaining('did not respond within the inspection time limit'),
    });
    expect(
      log.some((message) => message.includes('rustc') && message.includes('did not respond')),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
