import { addForm as addFormToProject, createForm, createProject } from '@webrad/project-model';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSession, WebRadBridge } from '../../../shared/contracts';
import { ProjectController } from './project-controller';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeBridge(session: ProjectSession): WebRadBridge {
  return {
    project: {
      create: vi.fn(async () => session),
      open: vi.fn(async () => session),
      save: vi.fn(async (request) => ({ ...session, ...request })),
      saveAs: vi.fn(async (request) => ({ ...session, ...request })),
      release: vi.fn(async () => undefined),
    },
    files: { read: vi.fn(), write: vi.fn() },
    build: { run: vi.fn() },
    commands: { subscribe: vi.fn(() => () => undefined) },
    lifecycle: { setDirty: vi.fn() },
    platform: 'win32',
  };
}

describe('ProjectController', () => {
  it('keeps the aggregate authoritative and tracks dirty/save transitions', async () => {
    const project = createProject('Project1');
    const session = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project,
      userSources: {},
    };
    const bridge = fakeBridge(session);
    const controller = new ProjectController(bridge);
    controller.load(session);
    controller.addForm(createForm('FrmOther'));
    expect(controller.getSnapshot().project?.forms).toHaveLength(2);
    expect(controller.getSnapshot().dirty).toBe(true);
    await controller.save();
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  it('queues edits made while a save is in flight and never restores the stale response', async () => {
    const project = createProject('Project1');
    const session = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project,
      userSources: {},
    };
    const bridge = fakeBridge(session);
    let finishFirstSave: ((value: ProjectSession) => void) | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        (request: ProjectSession) =>
          new Promise<ProjectSession>((resolve) => {
            finishFirstSave = resolve;
            void request;
          }),
      )
      .mockImplementation(async (request: ProjectSession) => ({ ...session, ...request }));
    bridge.project.save = save;
    const controller = new ProjectController(bridge);
    controller.load(session);

    controller.setUserSource('forms/FrmMain.ts', '// before save');
    const saving = controller.save();
    controller.setUserSource('forms/FrmMain.ts', '// during save');
    finishFirstSave?.({
      ...session,
      userSources: { 'forms/FrmMain.ts': '// before save' },
    });

    await saving;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].userSources['forms/FrmMain.ts']).toBe('// during save');
    expect(controller.getSnapshot().userSources['forms/FrmMain.ts']).toBe('// during save');
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  it('does not mutate sources when remove or rename validation fails', () => {
    const initialProject = createProject('Project1');
    const initialSession = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project: initialProject,
      userSources: { 'forms/FrmMain.ts': '// main source' },
    };
    const controller = new ProjectController(fakeBridge(initialSession));
    controller.load(initialSession);
    const beforeRemove = controller.getSnapshot();

    expect(() => controller.removeForm(initialProject.forms[0]!.id)).toThrow('at least one form');
    expect(controller.getSnapshot()).toBe(beforeRemove);

    const otherForm = createForm('FrmOther');
    const projectWithOther = addFormToProject(initialProject, otherForm);
    const sessionWithOther = {
      ...initialSession,
      project: projectWithOther,
      userSources: {
        'forms/FrmMain.ts': '// main source',
        'forms/FrmOther.ts': '// other source',
      },
    };
    controller.load(sessionWithOther);
    const beforeRename = controller.getSnapshot();

    expect(() => controller.renameForm(otherForm.id, 'FrmMain')).toThrow('already exists');
    expect(controller.getSnapshot()).toBe(beforeRename);
  });

  it('discards a project picker result if the current context was closed', async () => {
    const projectA = createProject('ProjectA');
    const sessionA = {
      rootPath: 'C:/projects/ProjectA',
      projectFilePath: 'C:/projects/ProjectA/ProjectA.wrproj',
      project: projectA,
      userSources: {},
    };
    const projectB = createProject('ProjectB');
    const sessionB = {
      rootPath: 'C:/projects/ProjectB',
      projectFilePath: 'C:/projects/ProjectB/ProjectB.wrproj',
      project: projectB,
      userSources: {},
    };
    const bridge = fakeBridge(sessionA);
    const opening = deferred<ProjectSession | null>();
    bridge.project.open = vi.fn(() => opening.promise);
    const controller = new ProjectController(bridge);
    controller.load(sessionA);

    const result = controller.open();
    controller.close();
    opening.resolve(sessionB);

    await expect(result).resolves.toBeNull();
    expect(controller.getSnapshot().project).toBeNull();
    expect(bridge.project.release).toHaveBeenCalledWith(sessionA.rootPath);
    expect(bridge.project.release).toHaveBeenCalledWith(sessionB.rootPath);
  });

  it('persists edits made while Save As is in flight before switching roots', async () => {
    const project = createProject('Project1');
    const session = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project,
      userSources: { 'forms/FrmMain.ts': '// initial' },
    };
    const destinationSession = {
      ...session,
      rootPath: 'C:/copies/Project1',
      projectFilePath: 'C:/copies/Project1/Project1.wrproj',
      userSources: { 'forms/FrmMain.ts': '// before save as' },
    };
    const bridge = fakeBridge(session);
    const saveAsResult = deferred<ProjectSession | null>();
    bridge.project.saveAs = vi.fn(() => saveAsResult.promise);
    bridge.project.save = vi.fn(async (request) => ({
      rootPath: request.rootPath,
      projectFilePath: `${request.rootPath}/Project1.wrproj`,
      project: request.project,
      userSources: request.userSources,
    }));
    const controller = new ProjectController(bridge);
    controller.load(session);
    controller.setUserSource('forms/FrmMain.ts', '// before save as');

    const saving = controller.saveAs();
    controller.setUserSource('forms/FrmMain.ts', '// during save as');
    saveAsResult.resolve(destinationSession);

    await expect(saving).resolves.toMatchObject({ rootPath: destinationSession.rootPath });
    expect(bridge.project.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: destinationSession.rootPath,
        userSources: { 'forms/FrmMain.ts': '// during save as' },
      }),
    );
    expect(controller.getSnapshot()).toMatchObject({
      rootPath: destinationSession.rootPath,
      dirty: false,
      userSources: { 'forms/FrmMain.ts': '// during save as' },
    });
  });

  it('starts a new-context save immediately and ignores a stale save failure', async () => {
    const projectA = createProject('ProjectA');
    const sessionA = {
      rootPath: 'C:/projects/ProjectA',
      projectFilePath: 'C:/projects/ProjectA/ProjectA.wrproj',
      project: projectA,
      userSources: {},
    };
    const projectB = createProject('ProjectB');
    const sessionB = {
      rootPath: 'C:/projects/ProjectB',
      projectFilePath: 'C:/projects/ProjectB/ProjectB.wrproj',
      project: projectB,
      userSources: {},
    };
    const staleSave = deferred<ProjectSession>();
    const bridge = fakeBridge(sessionA);
    const save = vi
      .fn()
      .mockImplementationOnce(() => staleSave.promise)
      .mockImplementationOnce(async (request: ProjectSession) => ({ ...sessionB, ...request }));
    bridge.project.save = save;
    const controller = new ProjectController(bridge);
    controller.load(sessionA);
    controller.setUserSource('forms/FrmMain.ts', '// project A');

    const savingA = controller.save();
    controller.load(sessionB);
    controller.setUserSource('forms/FrmMain.ts', '// project B');
    const savingB = controller.save();

    await expect(savingB).resolves.toMatchObject({ rootPath: sessionB.rootPath });
    staleSave.reject(new Error('Project A failed'));
    await expect(savingA).resolves.toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      project: expect.objectContaining({ name: 'ProjectB' }),
      rootPath: sessionB.rootPath,
      dirty: false,
      error: null,
    });
  });

  it('releases a Save As destination when its follow-up save becomes stale', async () => {
    const project = createProject('Project1');
    const session = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project,
      userSources: { 'forms/FrmMain.ts': '// initial' },
    };
    const destination = {
      ...session,
      rootPath: 'C:/copies/Project1',
      projectFilePath: 'C:/copies/Project1/Project1.wrproj',
      userSources: { 'forms/FrmMain.ts': '// before' },
    };
    const saveAsResult = deferred<ProjectSession | null>();
    const followUpSave = deferred<ProjectSession>();
    const bridge = fakeBridge(session);
    bridge.project.saveAs = vi.fn(() => saveAsResult.promise);
    bridge.project.save = vi.fn(() => followUpSave.promise);
    const controller = new ProjectController(bridge);
    controller.load(session);
    controller.setUserSource('forms/FrmMain.ts', '// before');

    const saving = controller.saveAs();
    controller.setUserSource('forms/FrmMain.ts', '// during');
    saveAsResult.resolve(destination);
    await vi.waitFor(() => expect(bridge.project.save).toHaveBeenCalledOnce());
    controller.close();
    followUpSave.reject(new Error('stale destination failed'));

    await expect(saving).resolves.toBeNull();
    expect(bridge.project.release).toHaveBeenCalledWith(destination.rootPath);
    expect(controller.getSnapshot()).toEqual(
      expect.objectContaining({ project: null, error: null, saving: false }),
    );
  });
});
