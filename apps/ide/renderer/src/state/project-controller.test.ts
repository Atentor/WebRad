import {
  addPage as addPageToProject,
  createPage,
  createProject,
  setComponentStyle,
} from '@webrad/project-model';
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
    styles: { compile: vi.fn(async () => ({ css: '' })) },
    commands: { subscribe: vi.fn(() => () => undefined) },
    lifecycle: { setDirty: vi.fn() },
    platform: 'win32',
  };
}

describe('ProjectController', () => {
  it('publishes a monotonic content revision and ignores identical source updates', () => {
    const project = createProject('Project1');
    const session = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project,
      userSources: {},
    };
    const controller = new ProjectController(fakeBridge(session));
    controller.load(session);
    const loaded = controller.getSnapshot();
    const source = loaded.userSources['pages/PageMain.ts'];
    expect(source).toBeDefined();

    controller.setUserSource('pages\\PageMain.ts', source!);
    expect(controller.getSnapshot()).toBe(loaded);

    controller.setUserSource('pages/PageMain.ts', `${source!}\n// edited`);
    expect(controller.getSnapshot().revision).toBe(loaded.revision + 1);
    controller.close();
    expect(controller.getSnapshot().revision).toBe(loaded.revision + 2);
  });

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
    controller.addPage(createPage('PageOther'));
    expect(controller.getSnapshot().project?.pages).toHaveLength(2);
    expect(controller.getSnapshot().dirty).toBe(true);
    await controller.save();
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  it('projects style CRUD into the aggregate and clears assigned references on delete', () => {
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

    const style = controller.createStyle('Page Surface', 'WebPage');
    controller.updateStyle({
      ...style,
      name: 'Application Surface',
      states: {
        ...style.states,
        base: { backgroundColor: '#f1f5f9', textColor: '#0f172a' },
      },
    });
    const page = controller.getSnapshot().project?.pages[0];
    expect(page).toBeDefined();
    controller.replaceProject(
      setComponentStyle(
        controller.getSnapshot().project!,
        page!.id,
        page!.rootComponentId,
        style.id,
      ),
    );

    expect(controller.getSnapshot().project?.styles[0]).toMatchObject({
      id: style.id,
      name: 'Application Surface',
      componentType: 'WebPage',
      states: { base: { backgroundColor: '#f1f5f9', textColor: '#0f172a' } },
    });
    expect(controller.getSnapshot().project?.pages[0]?.components[0]?.styleId).toBe(style.id);
    expect(controller.getSnapshot().dirty).toBe(true);
    expect(bridge.lifecycle.setDirty).toHaveBeenCalledWith(true);

    controller.removeStyle(style.id);
    expect(controller.getSnapshot().project?.styles).toEqual([]);
    expect(controller.getSnapshot().project?.pages[0]?.components[0]?.styleId).toBeUndefined();
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

    controller.setUserSource('pages/PageMain.ts', '// before save');
    const saving = controller.save();
    controller.setUserSource('pages/PageMain.ts', '// during save');
    finishFirstSave?.({
      ...session,
      userSources: { 'pages/PageMain.ts': '// before save' },
    });

    await saving;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].userSources['pages/PageMain.ts']).toBe('// during save');
    expect(controller.getSnapshot().userSources['pages/PageMain.ts']).toBe('// during save');
    expect(controller.getSnapshot().dirty).toBe(false);
  });

  it('does not mutate sources when remove or rename validation fails', () => {
    const initialProject = createProject('Project1');
    const initialSession = {
      rootPath: 'C:/projects/Project1',
      projectFilePath: 'C:/projects/Project1/Project1.wrproj',
      project: initialProject,
      userSources: { 'pages/PageMain.ts': '// main source' },
    };
    const controller = new ProjectController(fakeBridge(initialSession));
    controller.load(initialSession);
    const beforeRemove = controller.getSnapshot();

    expect(() => controller.removePage(initialProject.pages[0]!.id)).toThrow('at least one page');
    expect(controller.getSnapshot()).toBe(beforeRemove);

    const otherPage = createPage('PageOther');
    const projectWithOther = addPageToProject(initialProject, otherPage);
    const sessionWithOther = {
      ...initialSession,
      project: projectWithOther,
      userSources: {
        'pages/PageMain.ts': '// main source',
        'pages/PageOther.ts': '// other source',
      },
    };
    controller.load(sessionWithOther);
    const beforeRename = controller.getSnapshot();

    expect(() => controller.renamePage(otherPage.id, 'PageMain')).toThrow('already exists');
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
      userSources: { 'pages/PageMain.ts': '// initial' },
    };
    const destinationSession = {
      ...session,
      rootPath: 'C:/copies/Project1',
      projectFilePath: 'C:/copies/Project1/Project1.wrproj',
      userSources: { 'pages/PageMain.ts': '// before save as' },
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
    controller.setUserSource('pages/PageMain.ts', '// before save as');

    const saving = controller.saveAs();
    controller.setUserSource('pages/PageMain.ts', '// during save as');
    saveAsResult.resolve(destinationSession);

    await expect(saving).resolves.toMatchObject({ rootPath: destinationSession.rootPath });
    expect(bridge.project.save).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: destinationSession.rootPath,
        userSources: { 'pages/PageMain.ts': '// during save as' },
      }),
    );
    expect(controller.getSnapshot()).toMatchObject({
      rootPath: destinationSession.rootPath,
      dirty: false,
      userSources: { 'pages/PageMain.ts': '// during save as' },
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
    controller.setUserSource('pages/PageMain.ts', '// project A');

    const savingA = controller.save();
    controller.load(sessionB);
    controller.setUserSource('pages/PageMain.ts', '// project B');
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
      userSources: { 'pages/PageMain.ts': '// initial' },
    };
    const destination = {
      ...session,
      rootPath: 'C:/copies/Project1',
      projectFilePath: 'C:/copies/Project1/Project1.wrproj',
      userSources: { 'pages/PageMain.ts': '// before' },
    };
    const saveAsResult = deferred<ProjectSession | null>();
    const followUpSave = deferred<ProjectSession>();
    const bridge = fakeBridge(session);
    bridge.project.saveAs = vi.fn(() => saveAsResult.promise);
    bridge.project.save = vi.fn(() => followUpSave.promise);
    const controller = new ProjectController(bridge);
    controller.load(session);
    controller.setUserSource('pages/PageMain.ts', '// before');

    const saving = controller.saveAs();
    controller.setUserSource('pages/PageMain.ts', '// during');
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
