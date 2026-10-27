import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, type WebRadProject } from '@webrad/project-model';
import type { NativePrerequisiteReport } from '@webrad/native-build/contracts';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import {
  cancelNativeBuildForOwner,
  nativeNetworkOrigins,
  registerNativeBuildIpc,
} from './native-build-ipc';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, ...input: unknown[]) => unknown>(),
  picker: vi.fn(),
  compile: vi.fn(),
  native: vi.fn(),
  prerequisites: vi.fn(),
  exportCi: vi.fn(),
  save: vi.fn(),
  open: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: IpcMainInvokeEvent, ...input: unknown[]) => unknown,
    ) => mocks.handlers.set(channel, handler),
  },
  dialog: { showOpenDialog: mocks.picker },
  shell: { openPath: mocks.open },
  clipboard: { writeText: mocks.copy },
}));
vi.mock('./compiler-service', () => ({ compileProject: mocks.compile }));
vi.mock('@webrad/native-build', () => ({
  buildNativeApplication: mocks.native,
  checkNativePrerequisites: mocks.prerequisites,
  exportNativeBuildProject: mocks.exportCi,
}));
vi.mock('./project-files', () => ({ saveProjectFiles: mocks.save }));

let root = '';
let output = '';
let owner = 200;
let project: WebRadProject;
let trusted = true;
let opened = true;
let event: IpcMainInvokeEvent;
const send = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  owner += 1;
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-native-ipc-')));
  output = path.join(root, 'build-output');
  await fs.mkdir(output);
  project = createProject('NativeApplication');
  project = {
    ...project,
    settings: {
      ...project.settings,
      nativeApplication: {
        ...project.settings.nativeApplication,
        build: {
          ...project.settings.nativeApplication.build,
          platform: 'web',
          bundleFormat: 'web',
        },
      },
    },
  };
  trusted = true;
  opened = true;
  event = {
    sender: { id: owner, send, isDestroyed: () => false },
  } as unknown as IpcMainInvokeEvent;
  mocks.compile.mockResolvedValue({
    success: true,
    diagnostics: [],
    files: { 'index.html': '<html>hello</html>' },
    binaryFiles: {},
  });
  mocks.picker.mockResolvedValue({ canceled: false, filePaths: [output] });
  mocks.save.mockResolvedValue(undefined);
  mocks.open.mockResolvedValue('');
  mocks.native.mockReset();
  mocks.exportCi.mockReset();
  mocks.prerequisites.mockReset();
  mocks.prerequisites.mockResolvedValue({
    platform: 'web',
    hostPlatform: process.platform,
    ready: true,
    checks: [
      {
        id: 'webrad-compiler',
        name: 'WebRAD compiler',
        status: 'available',
        instruction: 'Included with WebRAD.',
      },
    ],
  } satisfies NativePrerequisiteReport);
  registerNativeBuildIpc({
    userDataPath: path.join(root, 'state'),
    requireTrustedSender: () => {
      if (!trusted) throw new Error('Untrusted renderer.');
      return {} as BrowserWindow;
    },
    requireProject: (_event, requestedRoot, id) => {
      if (!trusted || !opened || requestedRoot !== root || (id !== undefined && id !== project.id))
        throw new Error('Not the opened project.');
    },
  });
});
afterEach(async () => {
  cancelNativeBuildForOwner(owner);
  await fs.rm(root, { recursive: true, force: true });
});
function invoke(action: string, ...args: unknown[]): Promise<unknown> {
  const handler = mocks.handlers.get(`webrad:native-build:${action}`);
  if (!handler) throw new Error(`Missing ${action}.`);
  return Promise.resolve().then(() => handler(event, ...args));
}
function request() {
  return { requestId: `request-${owner}`, rootPath: root, project, userSources: {} };
}

describe('Native Build IPC', () => {
  it('updates the project-named folder on subsequent builds and preserves unrelated files', async () => {
    const first = (await invoke('run', request())) as { outputDirectory: string };
    expect(first.outputDirectory).toBe(path.join(output, project.name));
    await fs.writeFile(path.join(first.outputDirectory, 'notes.txt'), 'keep');
    mocks.compile.mockResolvedValue({
      success: true,
      diagnostics: [],
      files: { 'index.html': '<html>updated</html>' },
      binaryFiles: {},
    });
    const second = (await invoke('run', { ...request(), requestId: 'second-build' })) as {
      success: boolean;
      outputDirectory: string;
    };
    expect(second.success).toBe(true);
    expect(second.outputDirectory).toBe(first.outputDirectory);
    expect(await fs.readFile(path.join(second.outputDirectory, 'index.html'), 'utf8')).toBe(
      '<html>updated</html>',
    );
    expect(await fs.readFile(path.join(second.outputDirectory, 'notes.txt'), 'utf8')).toBe('keep');
  });
  it('uses an explicitly configured destination without reopening the picker', async () => {
    project = {
      ...project,
      settings: {
        ...project.settings,
        nativeApplication: {
          ...project.settings.nativeApplication,
          build: { ...project.settings.nativeApplication.build, outputDirectory: output },
        },
      },
    };
    await expect(invoke('run', request())).resolves.toMatchObject({
      success: true,
      configuredOutputDirectory: output,
    });
    expect(mocks.picker).not.toHaveBeenCalled();
  });
  it('validates inspection arguments and restricts inspections to the trusted opened project', async () => {
    const inspection = { rootPath: root, settings: project.settings.nativeApplication };
    trusted = false;
    await expect(invoke('inspect', inspection)).rejects.toThrow('Untrusted');
    trusted = true;
    await expect(invoke('inspect', inspection, 'extra')).rejects.toThrow('exactly one');
    await expect(invoke('inspect', { ...inspection, command: 'cargo' })).rejects.toThrow();
    await expect(
      invoke('inspect', {
        ...inspection,
        settings: { ...inspection.settings, command: 'cargo' },
      }),
    ).rejects.toThrow();
    await expect(
      invoke('inspect', {
        ...inspection,
        settings: { ...inspection.settings, version: 'invalid' },
      }),
    ).rejects.toThrow();
    await expect(
      invoke('inspect', { ...inspection, rootPath: path.dirname(root) }),
    ).rejects.toThrow('opened project');
    expect(mocks.prerequisites).not.toHaveBeenCalled();
  });

  it('returns the actual prerequisite report without saving, compiling, building or choosing output', async () => {
    const settings = project.settings.nativeApplication;
    const report: NativePrerequisiteReport = {
      platform: 'web',
      hostPlatform: process.platform,
      ready: true,
      checks: [
        {
          id: 'webrad-compiler',
          name: 'WebRAD compiler',
          status: 'available',
          instruction: 'Included with WebRAD; Rust and Tauri are not required.',
        },
      ],
    };
    mocks.prerequisites.mockResolvedValue(report);
    await expect(invoke('inspect', { rootPath: root, settings })).resolves.toEqual(report);
    expect(mocks.prerequisites).toHaveBeenCalledWith(settings, {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.compile).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.exportCi).not.toHaveBeenCalled();
    expect(mocks.picker).not.toHaveBeenCalled();
  });

  it('aborts a replaced inspection and rejects its stale report without cancelling the replacement', async () => {
    const pending: { signal: AbortSignal; resolve: (report: NativePrerequisiteReport) => void }[] =
      [];
    mocks.prerequisites.mockImplementation(
      (_settings: unknown, options: { signal: AbortSignal }) =>
        new Promise<NativePrerequisiteReport>((resolve) => {
          pending.push({ signal: options.signal, resolve });
        }),
    );
    const inspection = { rootPath: root, settings: project.settings.nativeApplication };
    const first = invoke('inspect', inspection);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const second = invoke('inspect', inspection);
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const report: NativePrerequisiteReport = {
      platform: 'web',
      hostPlatform: process.platform,
      ready: true,
      checks: [],
    };
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);
    const rejectedFirst = expect(first).rejects.toThrow();
    pending[0]?.resolve(report);
    await rejectedFirst;
    expect(pending[1]?.signal.aborted).toBe(false);
    pending[1]?.resolve(report);
    await expect(second).resolves.toEqual(report);
  });

  it('cancels inspection on owner release and rejects a result after the opened project changes', async () => {
    let finish: (report: NativePrerequisiteReport) => void = () => undefined;
    let signal: AbortSignal | undefined;
    mocks.prerequisites.mockImplementation(
      (_settings: unknown, options: { signal: AbortSignal }) =>
        new Promise<NativePrerequisiteReport>((resolve) => {
          signal = options.signal;
          finish = resolve;
        }),
    );
    const inspection = { rootPath: root, settings: project.settings.nativeApplication };
    const report: NativePrerequisiteReport = {
      platform: 'web',
      hostPlatform: process.platform,
      ready: true,
      checks: [],
    };
    const cancelled = invoke('inspect', inspection);
    await vi.waitFor(() => expect(signal).toBeDefined());
    cancelNativeBuildForOwner(owner);
    expect(signal?.aborted).toBe(true);
    const rejectedCancelled = expect(cancelled).rejects.toThrow();
    finish(report);
    await rejectedCancelled;

    signal = undefined;
    const stale = invoke('inspect', inspection);
    await vi.waitFor(() => expect(signal).toBeDefined());
    opened = false;
    const rejectedStale = expect(stale).rejects.toThrow('opened project');
    finish(report);
    await rejectedStale;
  });

  it('requires a trusted opened project and rejects extra arguments, process commands and project identities', async () => {
    trusted = false;
    await expect(invoke('run', request())).rejects.toThrow('Untrusted');
    trusted = true;
    await expect(invoke('run', request(), 'extra')).rejects.toThrow('exactly one');
    await expect(invoke('run', { ...request(), command: 'cmd.exe' })).rejects.toThrow();
    await expect(invoke('run', { ...request(), rootPath: path.dirname(root) })).rejects.toThrow(
      'opened project',
    );
    await expect(
      invoke('run', { ...request(), project: { ...project, id: 'different-id' } }),
    ).rejects.toThrow('opened project');
    expect(mocks.compile).not.toHaveBeenCalled();
    expect(mocks.native).not.toHaveBeenCalled();
  });

  it('writes actual Web/PWA output to a fresh picker-authorized directory and scopes artifact actions', async () => {
    const response = (await invoke('run', request())) as {
      success: boolean;
      outputDirectory: string;
      artifacts: { path: string }[];
    };
    expect(response.success, JSON.stringify(response)).toBe(true);
    expect(response).toMatchObject({ configuredOutputDirectory: output });
    expect(response.outputDirectory).not.toBe(output);
    expect(await fs.readFile(path.join(response.outputDirectory, 'index.html'), 'utf8')).toBe(
      '<html>hello</html>',
    );
    expect(mocks.compile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ target: 'deploy', write: false }),
    );
    expect(mocks.native).not.toHaveBeenCalled();
    await invoke('copy-artifact', { requestId: request().requestId, artifactIndex: 0 });
    expect(mocks.copy).toHaveBeenCalledWith(response.artifacts[0]?.path);
    await invoke('open-output', { requestId: request().requestId });
    expect(mocks.open).toHaveBeenCalledWith(response.outputDirectory);
    await expect(
      invoke('copy-artifact', { requestId: 'another-window', artifactIndex: 0 }),
    ).rejects.toThrow('belongs to this window');
    await expect(
      invoke('copy-artifact', { requestId: request().requestId, artifactIndex: 10 }),
    ).rejects.toThrow('Unknown');
    await expect(
      invoke('open-output', { requestId: request().requestId, path: 'C:\\Windows' }),
    ).rejects.toThrow();
  });

  it('treats a dismissed folder picker as cancellation without compiling', async () => {
    mocks.picker.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(invoke('run', request())).resolves.toMatchObject({
      success: false,
      cancelled: true,
      artifacts: [],
    });
    expect(mocks.compile).not.toHaveBeenCalled();
  });

  it('keeps the opened root capability when a project is opened through a filesystem alias', async () => {
    const originalRoot = root;
    const alias = `${root}-alias`;
    await fs.symlink(originalRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
    root = alias;
    try {
      const response = (await invoke('run', request())) as { success: boolean };
      expect(response.success, JSON.stringify(response)).toBe(true);
      await invoke('open-output', { requestId: request().requestId });
      expect(mocks.open).toHaveBeenCalled();
    } finally {
      root = originalRoot;
      await fs.unlink(alias);
    }
  });

  it('rejects success without a produced native artifact and returns prerequisite diagnostics', async () => {
    project = {
      ...project,
      settings: {
        ...project.settings,
        nativeApplication: {
          ...project.settings.nativeApplication,
          build: {
            ...project.settings.nativeApplication.build,
            platform: 'windows',
            bundleFormat: 'exe',
          },
        },
      },
    };
    mocks.native.mockResolvedValue({
      status: 'completed',
      artifacts: [],
      prerequisites: {
        platform: 'windows',
        hostPlatform: process.platform,
        ready: false,
        checks: [
          {
            id: 'rustc',
            name: 'Rust',
            status: 'missing',
            minimumVersion: '1.77.2',
            instruction: 'Install Rust.',
          },
        ],
      },
    });
    await expect(invoke('run', request())).resolves.toMatchObject({
      success: false,
      artifacts: [],
      prerequisites: {
        platform: 'windows',
        ready: false,
        checks: [expect.objectContaining({ id: 'rustc', status: 'missing' })],
      },
      diagnostics: [expect.objectContaining({ message: 'Rust; minimum 1.77.2: Install Rust.' })],
    });
    expect(mocks.native).toHaveBeenCalledWith(
      expect.objectContaining({ cargoTargetRoot: path.join(root, 'state', 'cargo-targets') }),
    );
    expect(mocks.compile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ target: 'native' }),
    );
    expect(send).toHaveBeenCalledWith(
      'webrad:native-build:progress',
      expect.objectContaining({ stage: 'failed' }),
    );
    await expect(invoke('open-output', { requestId: request().requestId })).rejects.toThrow(
      'No completed build',
    );
  });

  it('cancels during the web compilation boundary and blocks overlapping builds', async () => {
    let release: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.compile.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const running = invoke('run', request());
    await ready;
    await expect(invoke('run', { ...request(), requestId: 'other' })).rejects.toThrow(
      'already running',
    );
    await invoke('cancel', 'another-window');
    await invoke('cancel', request().requestId);
    release({ success: true, files: {}, diagnostics: [] });
    await expect(running).resolves.toMatchObject({
      success: false,
      cancelled: true,
      artifacts: [],
    });
    expect(mocks.native).not.toHaveBeenCalled();
    expect(await fs.readdir(output)).toEqual([]);
  });

  it('keeps compiler failures as failures and refuses linked output destinations', async () => {
    mocks.compile.mockResolvedValue({
      success: false,
      diagnostics: [{ category: 'error', source: 'typescript', message: 'Invalid event body.' }],
    });
    await expect(invoke('run', request())).resolves.toMatchObject({
      success: false,
      artifacts: [],
      diagnostics: [{ message: 'Invalid event body.', category: 'error', source: 'typescript' }],
    });
    const linked = path.join(root, 'linked');
    await fs.symlink(output, linked, process.platform === 'win32' ? 'junction' : 'dir');
    mocks.picker.mockResolvedValue({ canceled: false, filePaths: [linked] });
    await expect(invoke('choose-directory', root)).rejects.toThrow(/symbolic links|junctions/u);
  });
});

describe('native CSP origins', () => {
  it('derives only static network origins and never grants paths, credentials or arbitrary schemes', () => {
    const selected = {
      ...project,
      settings: {
        ...project.settings,
        nativeApplication: {
          ...project.settings.nativeApplication,
          security: { networkOrigins: ['https://media.example'] },
        },
        restGo: {
          ...project.settings.restGo,
          enabled: true,
          baseUrl: 'https://api.example/restgo',
        },
        environmentVariables: [
          {
            name: 'API',
            values: { development: 'https://dev.example', production: 'https://prod.example/v1' },
          },
        ],
      },
    };
    expect(nativeNetworkOrigins(selected)).toEqual([
      'https://api.example',
      'https://media.example',
      'https://prod.example',
    ]);
  });
});
