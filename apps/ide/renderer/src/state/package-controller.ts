import type {
  PackageAction,
  PackageProgress,
  PackageStatus,
  PackagesBridge,
} from '../../../shared/package-contracts';
import type { ProjectController } from './project-controller';

export interface PackageControllerSnapshot {
  readonly open: boolean;
  readonly selectedName: string;
  readonly status: PackageStatus | null;
  readonly busy: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly message: string | null;
  readonly logs: readonly string[];
}

const INITIAL: PackageControllerSnapshot = Object.freeze({
  open: false,
  selectedName: '',
  status: null,
  busy: false,
  refreshing: false,
  error: null,
  message: null,
  logs: [],
});

/** One manager per open project. Its results never cross project context boundaries. */
export class PackageController {
  readonly #project: ProjectController;
  readonly #bridge: PackagesBridge;
  readonly #context: string;
  readonly #listeners = new Set<() => void>();
  #snapshot = INITIAL;
  #activeRequest: string | null = null;
  #cancelRequested = false;
  #statusRevision = 0;
  #active = false;

  constructor(project: ProjectController, bridge: PackagesBridge, context: string) {
    this.#project = project;
    this.#bridge = bridge;
    this.#context = context;
  }

  readonly getSnapshot = (): PackageControllerSnapshot => this.#snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  activate(): () => void {
    this.#active = true;
    const unsubscribe = this.#bridge?.subscribe((progress: PackageProgress) => {
      if (progress.requestId !== this.#activeRequest) return;
      this.#publish({
        message: progress.message,
        logs: [...this.#snapshot.logs, progress.message].slice(-1500),
      });
    });
    void this.refresh();
    return () => {
      this.#active = false;
      this.#statusRevision += 1;
      const requestId = this.#activeRequest;
      this.#activeRequest = null;
      unsubscribe?.();
      if (requestId) void this.#bridge.cancel(requestId).catch(() => undefined);
    };
  }

  readonly refresh = async (): Promise<void> => {
    const current = this.#project.getSnapshot();
    if (!current.rootPath || !current.project || !this.#bridge || !this.#isCurrent()) return;
    const revision = ++this.#statusRevision;
    this.#publish({ refreshing: true });
    try {
      const status = await this.#bridge.status({
        rootPath: current.rootPath,
        projectId: current.project.id,
      });
      if (revision === this.#statusRevision) this.#publish({ status });
    } catch (failure) {
      if (revision === this.#statusRevision) this.#publish({ error: this.#error(failure) });
    } finally {
      if (revision === this.#statusRevision) this.#publish({ refreshing: false });
    }
  };

  readonly show = (name = ''): void => {
    if (!this.#project.getSnapshot().project || !this.#isCurrent()) return;
    this.#publish({ selectedName: name, open: true });
    void this.refresh();
  };

  readonly close = (): void => {
    if (!this.#activeRequest) this.#publish({ open: false });
  };

  readonly run = async (action: PackageAction, name?: string, version?: string): Promise<void> => {
    if (this.#activeRequest || !this.#bridge || !this.#isCurrent()) return;
    const initial = this.#project.getSnapshot();
    if (!initial.project) return;
    if (!window.dispatchEvent(new Event('webrad:commit-editor-drafts', { cancelable: true })))
      return;
    const requestId = crypto.randomUUID();
    this.#activeRequest = requestId;
    this.#cancelRequested = false;
    this.#statusRevision += 1;
    this.#publish({
      open: true,
      selectedName: name ?? this.#snapshot.selectedName,
      busy: true,
      refreshing: false,
      error: null,
      logs: [],
      message: 'Preparing package operation...',
    });
    try {
      const saved = initial.rootPath ? await this.#project.save() : await this.#project.saveAs();
      if (!saved) throw new Error('Save the project before managing its packages.');
      if (!this.#isCurrent()) return;
      if (this.#cancelRequested) {
        this.#publish({ message: 'Package operation cancelled.' });
        return;
      }
      const current = this.#project.getSnapshot();
      if (!current.rootPath || current.project?.id !== initial.project.id)
        throw new Error('The project changed before the package operation could start.');
      const result = await this.#bridge.run({
        requestId,
        action,
        name,
        version,
        rootPath: current.rootPath,
        project: current.project,
        userSources: { ...current.userSources },
      });
      if (!this.#isCurrent() || this.#activeRequest !== requestId) return;
      this.#publish({ status: result.state });
      const latest = this.#project.getSnapshot();
      if (result.success && latest.project?.id === initial.project.id) {
        this.#project.replaceProject({ ...latest.project, packages: result.project.packages });
        await this.#project.save();
      }
      if (result.cancelled)
        this.#publish({
          message:
            'Package operation cancelled. Restore dependencies before compiling if files are incomplete.',
        });
      else if (!result.success)
        this.#publish({
          error: result.error ?? 'The package operation failed. See the operation log for details.',
          message: 'Package operation failed.',
        });
      else this.#publish({ message: 'Package operation completed.' });
    } catch (failure) {
      this.#publish({ error: this.#error(failure), message: 'Package operation failed.' });
    } finally {
      if (this.#activeRequest === requestId) {
        this.#activeRequest = null;
        this.#publish({ busy: false });
      }
    }
  };

  readonly cancel = async (): Promise<void> => {
    const requestId = this.#activeRequest;
    if (!requestId) return;
    this.#cancelRequested = true;
    try {
      await this.#bridge.cancel(requestId);
      if (this.#activeRequest === requestId)
        this.#publish({ message: 'Cancelling package operation...' });
    } catch (failure) {
      this.#publish({ error: this.#error(failure) });
    }
  };

  #currentContext(): string {
    const current = this.#project.getSnapshot();
    return `${current.rootPath ?? ''}\n${current.project?.id ?? ''}`;
  }

  #isCurrent(): boolean {
    return this.#active && this.#context === this.#currentContext();
  }
  #error(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
  }
  #publish(patch: Partial<PackageControllerSnapshot>): void {
    if (!this.#isCurrent()) return;
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
