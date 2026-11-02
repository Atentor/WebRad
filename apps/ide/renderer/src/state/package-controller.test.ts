// @vitest-environment jsdom
import { createProject, type WebRadProject } from '@webrad/project-model';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSession } from '../../../shared/contracts';
import type {
  PackageOperationResult,
  PackageProgress,
  PackagesBridge,
  PackageStatus,
} from '../../../shared/package-contracts';
import type { ProjectController, ProjectControllerSnapshot } from './project-controller';
import { PackageController } from './package-controller';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const emptyStatus: PackageStatus = {
  dependencies: [],
  toolchain: { available: true },
  revision: 'empty',
};

function setup() {
  const initial = createProject('Packages');
  let session: ProjectSession = {
    rootPath: '/projects/Packages',
    projectFilePath: '/projects/Packages/Packages.wrproj',
    project: initial,
    userSources: {},
  };
  let state: ProjectControllerSnapshot = {
    session,
    project: initial,
    rootPath: session.rootPath,
    projectFilePath: session.projectFilePath,
    userSources: {},
    revision: 0,
    dirty: false,
    saving: false,
    error: null,
  };
  const update = (project: WebRadProject): void => {
    session = { ...session, project };
    state = { ...state, project, session, revision: state.revision + 1 };
  };
  const project = {
    getSnapshot: () => state,
    save: vi.fn(async () => session),
    saveAs: vi.fn(async () => session),
    replaceProject: vi.fn(update),
  } as unknown as ProjectController;
  let listener: ((event: PackageProgress) => void) | undefined;
  const operation = deferred<PackageOperationResult>();
  const bridge = {
    status: vi.fn(async () => emptyStatus),
    run: vi.fn<PackagesBridge['run']>(() => operation.promise),
    search: vi.fn<PackagesBridge['search']>(),
    types: vi.fn<PackagesBridge['types']>(),
    cancel: vi.fn<PackagesBridge['cancel']>(async () => undefined),
    subscribe: vi.fn((next: (event: PackageProgress) => void) => {
      listener = next;
      return () => {
        listener = undefined;
      };
    }),
  } satisfies PackagesBridge;
  const manager = new PackageController(project, bridge, `${session.rootPath}\n${initial.id}`);
  const dispose = manager.activate();
  const complete = (success = true): void =>
    operation.resolve({
      success,
      state: {
        ...emptyStatus,
        revision: 'installed',
        dependencies: [{ name: 'dayjs', requested: '1.11.13', installedVersion: '1.11.13' }],
      },
      project: {
        ...initial,
        packages: { version: 1, dependencies: { dayjs: '1.11.13' }, lockfile: '{}' },
      },
    });
  return {
    initial,
    project,
    manager,
    bridge,
    complete,
    update,
    dispose,
    emit: (event: PackageProgress) => listener?.(event),
  };
}

describe('Project package controller', () => {
  it('prevents duplicate operations, streams logs and preserves edits made during installation', async () => {
    const context = setup();
    const running = context.manager.run('install', 'dayjs');
    await vi.waitFor(() => expect(context.bridge.run).toHaveBeenCalledOnce());
    await context.manager.run('remove', 'dayjs');
    expect(context.bridge.run).toHaveBeenCalledOnce();
    const requestId = context.bridge.run.mock.calls[0]?.[0].requestId;
    if (!requestId) throw new Error('Missing package request');
    context.emit({ requestId: 'other-operation', phase: 'running', message: 'Ignore this' });
    context.emit({ requestId, phase: 'running', stream: 'stdout', message: 'Installing dayjs' });
    expect(context.manager.getSnapshot().logs).toEqual(['Installing dayjs']);
    context.update({ ...context.initial, name: 'Edited during installation' });
    context.complete();
    await running;
    expect(context.project.getSnapshot().project?.name).toBe('Edited during installation');
    expect(context.project.getSnapshot().project?.packages?.dependencies).toEqual({
      dayjs: '1.11.13',
    });
    expect(context.manager.getSnapshot().message).toBe('Package operation completed.');
    expect(context.manager.getSnapshot().busy).toBe(false);
    context.dispose();
  });

  it('does not launch NPM when cancelled while saving the project', async () => {
    const context = setup();
    const saving = deferred<ProjectSession | null>();
    vi.spyOn(context.project, 'save').mockReturnValueOnce(saving.promise);
    const running = context.manager.run('install', 'dayjs');
    await context.manager.cancel();
    saving.resolve(context.project.getSnapshot().session);
    await running;
    expect(context.bridge.run).not.toHaveBeenCalled();
    expect(context.manager.getSnapshot().message).toBe('Package operation cancelled.');
    expect(context.manager.getSnapshot().busy).toBe(false);
    context.dispose();
  });

  it('rejects stale completions after switching project context and cancels on disposal', async () => {
    const context = setup();
    const running = context.manager.run('install', 'dayjs');
    await vi.waitFor(() => expect(context.bridge.run).toHaveBeenCalledOnce());
    const requestId = context.bridge.run.mock.calls[0]?.[0].requestId;
    context.update(createProject('Another project'));
    context.dispose();
    context.complete();
    await running;
    expect(context.bridge.cancel).toHaveBeenCalledWith(requestId);
    expect(context.project.replaceProject).not.toHaveBeenCalled();
    expect(context.project.getSnapshot().project?.packages).toBeUndefined();
  });

  it('does not overwrite a completed operation with an earlier status response', async () => {
    const context = setup();
    const status = deferred<PackageStatus>();
    context.bridge.status.mockReturnValueOnce(status.promise);
    const refreshing = context.manager.refresh();
    const running = context.manager.run('install', 'dayjs');
    await vi.waitFor(() => expect(context.bridge.run).toHaveBeenCalledOnce());
    context.complete();
    await running;
    status.resolve(emptyStatus);
    await refreshing;
    expect(context.manager.getSnapshot().status?.revision).toBe('installed');
    context.dispose();
  });
});
