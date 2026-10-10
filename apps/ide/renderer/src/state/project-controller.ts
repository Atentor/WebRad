import {
  addComponentStyle,
  projectSourceFilePath,
  type ProjectSourceFile,
  type ProjectAsset,
  addPage as addPageToProject,
  addReusableElement as addReusableElementToProject,
  createComponentStyle,
  getPage,
  getReusableElement,
  parseProject,
  removeComponentStyle,
  removePage as removePageFromProject,
  removeReusableElement as removeReusableElementFromProject,
  renamePage as renamePageInProject,
  renameReusableElement as renameReusableElementInProject,
  updateProjectSettings as updateSettingsInProject,
  updateComponentStyle,
  updatePage as updateProjectPage,
  updateReusableElement as updateProjectReusableElement,
  type ComponentStyleModel,
  type PageModel,
  type ProjectSettings,
  type ProjectDebuggerSettings,
  type ReusableElementModel,
  type WebRadProject,
} from '@webrad/project-model';
import {
  createUserPageSource,
  createUserProjectSource,
  createUserReusableElementSource,
  renamePageUserSource,
} from '@webrad/language';
import type { ProjectSession, WebRadBridge } from '../../../shared/contracts';

export interface ProjectControllerSnapshot {
  readonly session: ProjectSession | null;
  readonly project: WebRadProject | null;
  readonly rootPath: string | null;
  readonly projectFilePath: string | null;
  readonly userSources: Readonly<Record<string, string>>;
  /** Monotonic content revision used to reject stale compiler results. */
  readonly revision: number;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

type SnapshotListener = () => void;

interface SaveTask {
  readonly contextRevision: number;
  readonly promise: Promise<ProjectSession | null>;
}

const EMPTY_SNAPSHOT: ProjectControllerSnapshot = Object.freeze({
  session: null,
  project: null,
  rootPath: null,
  projectFilePath: null,
  userSources: Object.freeze({}),
  revision: 0,
  dirty: false,
  saving: false,
  error: null,
});

function sourcePath(pageName: string): string {
  return `pages/${pageName}.ts`;
}

function reusableSourcePath(reusableElementName: string): string {
  return `reusables/${reusableElementName}.ts`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renameDebugSource(
  project: WebRadProject,
  oldPath: string,
  newPath: string,
): WebRadProject {
  if (project.debugger === undefined) return project;
  return {
    ...project,
    debugger: {
      ...project.debugger,
      breakpoints: project.debugger.breakpoints.map((breakpoint) =>
        breakpoint.path === oldPath ? { ...breakpoint, path: newPath } : breakpoint,
      ),
    },
  };
}

export class ProjectController {
  readonly #bridge: WebRadBridge;
  readonly #listeners = new Set<SnapshotListener>();
  #snapshot: ProjectControllerSnapshot = EMPTY_SNAPSHOT;
  #saveTask: SaveTask | null = null;
  #contextRevision = 0;
  #projectOperationRevision = 0;
  #restoreTask: Promise<ProjectSession | null> | null = null;
  #editRevision = 0;

  public constructor(bridge: WebRadBridge) {
    this.#bridge = bridge;
  }

  public readonly getSnapshot = (): ProjectControllerSnapshot => this.#snapshot;

  public readonly subscribe = (listener: SnapshotListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public restoreLastProject(): Promise<ProjectSession | null> {
    this.#restoreTask ??= this.#restoreAtStartup(this.#projectOperationRevision);
    return this.#restoreTask;
  }

  public async create(name: string): Promise<ProjectSession | null> {
    const operationRevision = ++this.#projectOperationRevision;
    this.#publish({ saving: true, error: null });
    try {
      const session = await this.#bridge.project.create({ name });
      if (operationRevision !== this.#projectOperationRevision) {
        this.#releaseInactiveSession(session);
        return null;
      }
      if (session) this.load(session);
      else this.#publish({ saving: false });
      return session;
    } catch (error) {
      if (operationRevision !== this.#projectOperationRevision) return null;
      this.#publish({ saving: false, error: errorMessage(error) });
      throw error;
    }
  }

  public async open(): Promise<ProjectSession | null> {
    const operationRevision = ++this.#projectOperationRevision;
    this.#publish({ saving: true, error: null });
    try {
      const session = await this.#bridge.project.open();
      if (operationRevision !== this.#projectOperationRevision) {
        this.#releaseInactiveSession(session);
        return null;
      }
      if (session) this.load(session);
      else this.#publish({ saving: false });
      return session;
    } catch (error) {
      if (operationRevision !== this.#projectOperationRevision) return null;
      this.#publish({ saving: false, error: errorMessage(error) });
      throw error;
    }
  }

  public load(session: ProjectSession): void {
    const project = parseProject(session.project);
    const userSources: Record<string, string> = { ...session.userSources };
    for (const page of project.pages) {
      userSources[sourcePath(page.name)] ??= createUserPageSource(page);
    }
    for (const reusableElement of project.reusableElements) {
      userSources[reusableSourcePath(reusableElement.name)] ??=
        createUserReusableElementSource(reusableElement);
    }
    const normalizedSession = { ...session, project, userSources };
    const previousRoot = this.#snapshot.rootPath;
    if (previousRoot && !this.#sameProjectRoot(previousRoot, session.rootPath)) {
      void this.#bridge.project.release(previousRoot);
    }
    this.#contextRevision += 1;
    this.#projectOperationRevision += 1;
    this.#editRevision += 1;
    this.#snapshot = {
      session: normalizedSession,
      project,
      rootPath: session.rootPath,
      projectFilePath: session.projectFilePath,
      userSources,
      revision: this.#editRevision,
      dirty: false,
      saving: false,
      error: null,
    };
    this.#bridge.lifecycle.setDirty(false);
    this.#emit();
  }

  public close(): void {
    const rootPath = this.#snapshot.rootPath;
    if (rootPath) void this.#bridge.project.release(rootPath);
    this.#contextRevision += 1;
    this.#projectOperationRevision += 1;
    this.#editRevision += 1;
    this.#snapshot = { ...EMPTY_SNAPSHOT, revision: this.#editRevision };
    this.#bridge.lifecycle.setDirty(false);
    this.#emit();
  }

  public async save(): Promise<ProjectSession | null> {
    if (!this.#snapshot.project || !this.#snapshot.rootPath) return null;
    const contextRevision = this.#contextRevision;
    if (this.#saveTask?.contextRevision === contextRevision) return this.#saveTask.promise;

    let task: SaveTask | null = null;
    const promise = this.#saveUntilCurrent(contextRevision)
      .catch((error: unknown) => {
        if (contextRevision !== this.#contextRevision) return null;
        this.#publish({ saving: false, error: errorMessage(error) });
        this.#bridge.lifecycle.setDirty(true);
        throw error;
      })
      .finally(() => {
        if (this.#saveTask === task) this.#saveTask = null;
      });
    task = { contextRevision, promise };
    this.#saveTask = task;
    return promise;
  }

  public async saveAs(): Promise<ProjectSession | null> {
    if (!this.#snapshot.project) return null;
    const contextRevision = this.#contextRevision;
    const initialEditRevision = this.#editRevision;
    let destinationRoot: string | null = null;
    this.#publish({ saving: true, error: null });
    try {
      const session = await this.#bridge.project.saveAs({
        project: this.#snapshot.project,
        userSources: { ...this.#snapshot.userSources },
      });
      destinationRoot = session?.rootPath ?? null;
      if (contextRevision !== this.#contextRevision) {
        if (destinationRoot) void this.#bridge.project.release(destinationRoot);
        return null;
      }
      if (!session) {
        this.#publish({ saving: false });
        return null;
      }
      if (initialEditRevision === this.#editRevision) {
        this.load(session);
        return session;
      }

      let savedSession = session;
      while (contextRevision === this.#contextRevision) {
        const snapshot = this.#snapshot;
        if (!snapshot.project) return null;
        const editRevision = this.#editRevision;
        savedSession = await this.#bridge.project.save({
          rootPath: session.rootPath,
          project: snapshot.project,
          userSources: { ...snapshot.userSources },
        });
        if (contextRevision !== this.#contextRevision) {
          void this.#bridge.project.release(session.rootPath);
          return null;
        }
        if (editRevision === this.#editRevision) {
          this.load(savedSession);
          return savedSession;
        }
      }
      return null;
    } catch (error) {
      if (contextRevision !== this.#contextRevision) {
        if (destinationRoot && this.#snapshot.rootPath !== destinationRoot) {
          void this.#bridge.project.release(destinationRoot);
        }
        return null;
      }
      this.#publish({ saving: false, error: errorMessage(error) });
      this.#bridge.lifecycle.setDirty(true);
      if (destinationRoot) void this.#bridge.project.release(destinationRoot);
      throw error;
    }
  }

  public replaceProject(projectInput: WebRadProject): void {
    this.#commitEdit(projectInput, this.#snapshot.userSources);
  }

  public updateProjectSettings(patch: Partial<ProjectSettings>): void {
    this.replaceProject(updateSettingsInProject(this.#requireProject(), patch));
  }

  public createStyle(name: string, componentType: string): ComponentStyleModel {
    const project = this.#requireProject();
    const style = createComponentStyle(name, componentType);
    this.replaceProject(addComponentStyle(project, style));
    return style;
  }

  public updateStyle(style: ComponentStyleModel): void {
    const project = this.#requireProject();
    this.replaceProject(updateComponentStyle(project, style.id, () => style));
  }

  public removeStyle(styleId: string): void {
    this.replaceProject(removeComponentStyle(this.#requireProject(), styleId));
  }

  public updatePage(pageId: string, updater: (page: PageModel) => PageModel): void {
    const project = this.#requireProject();
    this.replaceProject(updateProjectPage(project, pageId, updater));
  }

  public findPage(pageId: string): PageModel | undefined {
    return this.#snapshot.project?.pages.find((page) => page.id === pageId);
  }

  public getPage(pageId: string): PageModel {
    return getPage(this.#requireProject(), pageId);
  }

  public updateReusableElement(
    reusableElementId: string,
    updater: (reusableElement: ReusableElementModel) => ReusableElementModel,
  ): void {
    const project = this.#requireProject();
    this.replaceProject(updateProjectReusableElement(project, reusableElementId, updater));
  }

  public findReusableElement(reusableElementId: string): ReusableElementModel | undefined {
    return this.#snapshot.project?.reusableElements.find(
      (reusableElement) => reusableElement.id === reusableElementId,
    );
  }

  public getReusableElement(reusableElementId: string): ReusableElementModel {
    return getReusableElement(this.#requireProject(), reusableElementId);
  }

  public setUserSource(relativePath: string, source: string): void {
    const normalizedPath = relativePath.replaceAll('\\', '/');
    if (this.#snapshot.userSources[normalizedPath] === source) return;
    const userSources = {
      ...this.#snapshot.userSources,
      [normalizedPath]: source,
    };
    const session = this.#snapshot.session ? { ...this.#snapshot.session, userSources } : null;
    this.#editRevision += 1;
    this.#snapshot = {
      ...this.#snapshot,
      session,
      userSources,
      revision: this.#editRevision,
      dirty: true,
      error: null,
    };
    this.#bridge.lifecycle.setDirty(true);
    this.#emit();
  }

  public addSourceFile(kind: ProjectSourceFile['kind'], name: string): ProjectSourceFile {
    const current = this.#requireProject();
    const file: ProjectSourceFile = { id: globalThis.crypto.randomUUID(), name, kind };
    const project = parseProject({
      ...current,
      sourceFiles: [...(current.sourceFiles ?? []), file],
    });
    this.#commitEdit(project, {
      ...this.#snapshot.userSources,
      [projectSourceFilePath(file)]: createUserProjectSource(file),
    });
    return file;
  }

  public addAsset(asset: ProjectAsset): void {
    const current = this.#requireProject();
    this.replaceProject(parseProject({ ...current, assets: [...(current.assets ?? []), asset] }));
  }

  public addPage(page: PageModel, setAsEntry = false): void {
    const project = addPageToProject(this.#requireProject(), page, setAsEntry);
    const key = sourcePath(page.name);
    const userSources = {
      ...this.#snapshot.userSources,
      [key]: this.#snapshot.userSources[key] ?? createUserPageSource(page),
    };
    this.#commitEdit(project, userSources);
  }

  public addReusableElement(reusableElement: ReusableElementModel): void {
    const project = addReusableElementToProject(this.#requireProject(), reusableElement);
    const key = reusableSourcePath(reusableElement.name);
    const userSources = {
      ...this.#snapshot.userSources,
      [key]: this.#snapshot.userSources[key] ?? createUserReusableElementSource(reusableElement),
    };
    this.#commitEdit(project, userSources);
  }

  public updateDebugger(settings: ProjectDebuggerSettings): void {
    this.#commitEdit({ ...this.#requireProject(), debugger: settings }, this.#snapshot.userSources);
  }

  public removeReusableElement(reusableElementId: string): void {
    const project = this.#requireProject();
    const reusableElement = getReusableElement(project, reusableElementId);
    const nextProject = removeReusableElementFromProject(project, reusableElementId);
    const userSources = { ...this.#snapshot.userSources };
    delete userSources[reusableSourcePath(reusableElement.name)];
    this.#commitEdit(nextProject, userSources);
  }

  public renameReusableElement(reusableElementId: string, name: string): void {
    const project = this.#requireProject();
    const reusableElement = getReusableElement(project, reusableElementId);
    const nextProject = renameReusableElementInProject(project, reusableElementId, name);
    const oldKey = reusableSourcePath(reusableElement.name);
    const newKey = reusableSourcePath(name);
    const source =
      this.#snapshot.userSources[oldKey] ?? createUserReusableElementSource(reusableElement);
    const renamedSource = renamePageUserSource(
      source,
      reusableElement.name,
      name,
      oldKey,
    ).sourceText;
    const userSources = { ...this.#snapshot.userSources, [newKey]: renamedSource };
    delete userSources[oldKey];
    this.#commitEdit(renameDebugSource(nextProject, oldKey, newKey), userSources);
  }

  public removePage(pageId: string): void {
    const project = this.#requireProject();
    const page = getPage(project, pageId);
    const nextProject = removePageFromProject(project, pageId);
    const userSources = { ...this.#snapshot.userSources };
    delete userSources[sourcePath(page.name)];
    this.#commitEdit(nextProject, userSources);
  }

  public renamePage(pageId: string, newName: string): void {
    const project = this.#requireProject();
    const oldPage = getPage(project, pageId);
    const nextProject = renamePageInProject(project, pageId, newName);
    const oldKey = sourcePath(oldPage.name);
    const newKey = sourcePath(newName);
    const source = this.#snapshot.userSources[oldKey] ?? createUserPageSource(oldPage);
    const renamedSource = renamePageUserSource(source, oldPage.name, newName, oldKey).sourceText;
    const userSources = { ...this.#snapshot.userSources, [newKey]: renamedSource };
    delete userSources[oldKey];
    this.#commitEdit(renameDebugSource(nextProject, oldKey, newKey), userSources);
  }

  async #restoreAtStartup(operationRevision: number): Promise<ProjectSession | null> {
    if (operationRevision !== 0) return null;
    try {
      const session = await this.#bridge.project.restore();
      if (operationRevision !== this.#projectOperationRevision) {
        this.#releaseInactiveSession(session);
        return null;
      }
      if (session) this.load(session);
      return session;
    } catch (error) {
      if (operationRevision !== this.#projectOperationRevision) return null;
      throw error;
    }
  }

  #sameProjectRoot(left: string, right: string | null): boolean {
    if (right === null) return false;
    if (this.#bridge.platform === 'win32') {
      return left.replaceAll('\\', '/').toLowerCase() === right.replaceAll('\\', '/').toLowerCase();
    }
    return left === right;
  }

  #releaseInactiveSession(session: ProjectSession | null): void {
    if (session && !this.#sameProjectRoot(session.rootPath, this.#snapshot.rootPath)) {
      void this.#bridge.project.release(session.rootPath);
    }
  }

  #requireProject(): WebRadProject {
    if (!this.#snapshot.project) throw new Error('No WebRAD project is open.');
    return this.#snapshot.project;
  }

  async #saveUntilCurrent(contextRevision: number): Promise<ProjectSession | null> {
    let lastSession: ProjectSession | null = null;
    while (contextRevision === this.#contextRevision) {
      const snapshot = this.#snapshot;
      if (!snapshot.project || !snapshot.rootPath) return null;
      const editRevision = this.#editRevision;
      this.#publish({ saving: true, error: null });
      lastSession = await this.#bridge.project.save({
        rootPath: snapshot.rootPath,
        project: snapshot.project,
        userSources: { ...snapshot.userSources },
      });
      if (contextRevision !== this.#contextRevision) return null;
      if (editRevision === this.#editRevision) {
        return this.#acceptSavedSession(lastSession);
      }
      // An edit landed while the IPC save was in flight. Persist the current
      // revision before resolving so no change is overwritten or marked clean.
    }
    return lastSession;
  }

  #acceptSavedSession(session: ProjectSession): ProjectSession {
    const project = parseProject(session.project);
    const userSources = { ...session.userSources };
    const normalizedSession = { ...session, project, userSources };
    this.#snapshot = {
      session: normalizedSession,
      project,
      rootPath: session.rootPath,
      projectFilePath: session.projectFilePath,
      userSources,
      revision: this.#editRevision,
      dirty: false,
      saving: false,
      error: null,
    };
    this.#bridge.lifecycle.setDirty(false);
    this.#emit();
    return normalizedSession;
  }

  #commitEdit(
    projectInput: WebRadProject,
    userSourcesInput: Readonly<Record<string, string>>,
  ): void {
    const debuggerSettings = projectInput.debugger;
    const availablePaths = new Set(Object.keys(userSourcesInput));
    const project = parseProject(
      debuggerSettings === undefined
        ? projectInput
        : {
            ...projectInput,
            debugger: {
              ...debuggerSettings,
              breakpoints: debuggerSettings.breakpoints.filter((breakpoint) =>
                availablePaths.has(breakpoint.path),
              ),
            },
          },
    );
    const userSources = { ...userSourcesInput };
    const session = this.#snapshot.session
      ? { ...this.#snapshot.session, project, userSources }
      : null;
    this.#editRevision += 1;
    this.#snapshot = {
      ...this.#snapshot,
      project,
      session,
      userSources,
      revision: this.#editRevision,
      dirty: true,
      error: null,
    };
    this.#bridge.lifecycle.setDirty(true);
    this.#emit();
  }

  #publish(patch: Partial<ProjectControllerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}
