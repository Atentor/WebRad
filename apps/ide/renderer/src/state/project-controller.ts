import {
  addForm as addFormToProject,
  getForm,
  parseProject,
  removeForm as removeFormFromProject,
  renameForm as renameFormInProject,
  updateForm as updateProjectForm,
  type FormModel,
  type WebRadProject,
} from '@webrad/project-model';
import { createUserFormSource, renameFormUserSource } from '@webrad/language';
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

function sourcePath(formName: string): string {
  return `forms/${formName}.ts`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProjectController {
  readonly #bridge: WebRadBridge;
  readonly #listeners = new Set<SnapshotListener>();
  #snapshot: ProjectControllerSnapshot = EMPTY_SNAPSHOT;
  #saveTask: SaveTask | null = null;
  #contextRevision = 0;
  #editRevision = 0;

  public constructor(bridge: WebRadBridge) {
    this.#bridge = bridge;
  }

  public readonly getSnapshot = (): ProjectControllerSnapshot => this.#snapshot;

  public readonly subscribe = (listener: SnapshotListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public async create(name: string): Promise<ProjectSession | null> {
    const contextRevision = this.#contextRevision;
    this.#publish({ saving: true, error: null });
    try {
      const session = await this.#bridge.project.create({ name });
      if (contextRevision !== this.#contextRevision) {
        if (session) void this.#bridge.project.release(session.rootPath);
        return null;
      }
      if (session) this.load(session);
      else this.#publish({ saving: false });
      return session;
    } catch (error) {
      if (contextRevision !== this.#contextRevision) return null;
      this.#publish({ saving: false, error: errorMessage(error) });
      throw error;
    }
  }

  public async open(): Promise<ProjectSession | null> {
    const contextRevision = this.#contextRevision;
    this.#publish({ saving: true, error: null });
    try {
      const session = await this.#bridge.project.open();
      if (contextRevision !== this.#contextRevision) {
        if (session) void this.#bridge.project.release(session.rootPath);
        return null;
      }
      if (session) this.load(session);
      else this.#publish({ saving: false });
      return session;
    } catch (error) {
      if (contextRevision !== this.#contextRevision) return null;
      this.#publish({ saving: false, error: errorMessage(error) });
      throw error;
    }
  }

  public load(session: ProjectSession): void {
    const project = parseProject(session.project);
    const userSources: Record<string, string> = { ...session.userSources };
    for (const form of project.forms) {
      userSources[sourcePath(form.name)] ??= createUserFormSource(form);
    }
    const normalizedSession = { ...session, project, userSources };
    const previousRoot = this.#snapshot.rootPath;
    if (previousRoot && previousRoot !== session.rootPath) {
      void this.#bridge.project.release(previousRoot);
    }
    this.#contextRevision += 1;
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

  public updateForm(formId: string, updater: (form: FormModel) => FormModel): void {
    const project = this.#requireProject();
    this.replaceProject(updateProjectForm(project, formId, updater));
  }

  public findForm(formId: string): FormModel | undefined {
    return this.#snapshot.project?.forms.find((form) => form.id === formId);
  }

  public getForm(formId: string): FormModel {
    return getForm(this.#requireProject(), formId);
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

  public addForm(form: FormModel, setAsEntry = false): void {
    const project = addFormToProject(this.#requireProject(), form, setAsEntry);
    const key = sourcePath(form.name);
    const userSources = {
      ...this.#snapshot.userSources,
      [key]: this.#snapshot.userSources[key] ?? createUserFormSource(form),
    };
    this.#commitEdit(project, userSources);
  }

  public removeForm(formId: string): void {
    const project = this.#requireProject();
    const form = getForm(project, formId);
    const nextProject = removeFormFromProject(project, formId);
    const userSources = { ...this.#snapshot.userSources };
    delete userSources[sourcePath(form.name)];
    this.#commitEdit(nextProject, userSources);
  }

  public renameForm(formId: string, newName: string): void {
    const project = this.#requireProject();
    const oldForm = getForm(project, formId);
    const nextProject = renameFormInProject(project, formId, newName);
    const oldKey = sourcePath(oldForm.name);
    const newKey = sourcePath(newName);
    const source = this.#snapshot.userSources[oldKey] ?? createUserFormSource(oldForm);
    const renamedSource = renameFormUserSource(source, oldForm.name, newName, oldKey).sourceText;
    const userSources = { ...this.#snapshot.userSources, [newKey]: renamedSource };
    delete userSources[oldKey];
    this.#commitEdit(nextProject, userSources);
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
    const project = parseProject(projectInput);
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
