import type { UpdateState } from '../shared/update-contracts';
import {
  isNewerVersion,
  parseUpdateManifest,
  type UpdateManifest,
  type UpdateTarget,
} from './update-release';

export interface UpdateBackend {
  readonly mode: 'automatic' | 'manual';
  readonly message?: string;
  download(
    manifest: UpdateManifest,
    target: UpdateTarget,
    progress: (percent: number) => void,
  ): Promise<void>;
  install(): Promise<void>;
}

export interface UpdateServiceOptions {
  readonly currentVersion: string;
  readonly disabled?: boolean;
  readonly readManifest: () => Promise<unknown>;
  readonly selectBackend: (
    manifest: UpdateManifest,
  ) => Promise<{ target: UpdateTarget; backend: UpdateBackend }>;
  readonly canInstall: () => boolean;
}

/** One main-process owner serializes checks/download/install across all IDE windows. */
export class UpdateService {
  readonly #options: UpdateServiceOptions;
  readonly #listeners = new Set<(state: UpdateState) => void>();
  #state: UpdateState;
  #manifest?: UpdateManifest;
  #target?: UpdateTarget;
  #backend?: UpdateBackend;
  #task?: Promise<UpdateState>;

  public constructor(options: UpdateServiceOptions) {
    this.#options = options;
    this.#state = {
      status: options.disabled ? 'disabled' : 'idle',
      currentVersion: options.currentVersion,
      ...(options.disabled
        ? { message: 'Updates are available in the installed WebRad application.' }
        : {}),
    };
  }

  public getState = (): UpdateState => ({ ...this.#state });

  public subscribe(listener: (state: UpdateState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #publish(patch: Partial<UpdateState>): UpdateState {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener(this.getState());
    return this.getState();
  }

  #run(task: () => Promise<UpdateState>): Promise<UpdateState> {
    if (this.#task) return this.#task;
    // Defer execution until #task owns the operation (including synchronous failures).
    this.#task = Promise.resolve()
      .then(task)
      .catch((error: unknown) =>
        this.#publish({
          status: 'error',
          progress: undefined,
          message: error instanceof Error ? error.message : 'Update failed. Please try again.',
        }),
      )
      .finally(() => {
        this.#task = undefined;
      });
    return this.#task;
  }

  public check = (): Promise<UpdateState> => {
    if (['disabled', 'ready', 'installing', 'manual'].includes(this.#state.status))
      return Promise.resolve(this.getState());
    return this.#run(async () => {
      this.#publish({ status: 'checking', message: undefined, progress: undefined });
      const manifest = parseUpdateManifest(await this.#options.readManifest());
      if (!isNewerVersion(manifest.version, this.#options.currentVersion)) {
        return this.#publish({ status: 'current', latestVersion: undefined, mode: undefined });
      }
      const { target, backend } = await this.#options.selectBackend(manifest);
      this.#manifest = manifest;
      this.#target = target;
      this.#backend = backend;
      return this.#publish({
        status: 'available',
        latestVersion: manifest.version,
        mode: backend.mode,
        message: backend.message,
      });
    });
  };

  public download = (): Promise<UpdateState> => {
    if (this.#task) return this.#task;
    if (this.#state.status !== 'available') return Promise.resolve(this.getState());
    return this.#run(async () => {
      if (!this.#backend || !this.#manifest || !this.#target)
        throw new Error('Check for updates first.');
      this.#publish({ status: 'downloading', progress: undefined, message: undefined });
      await this.#backend.download(this.#manifest, this.#target, (progress) => {
        if (progress !== this.#state.progress) this.#publish({ progress });
      });
      return this.#publish({
        status: this.#backend.mode === 'manual' ? 'manual' : 'ready',
        progress: undefined,
        message: this.#backend.mode === 'manual' ? this.#backend.message : undefined,
      });
    });
  };

  public install = (): Promise<UpdateState> => {
    if (this.#task) return this.#task;
    if (this.#state.status !== 'ready' || this.#backend?.mode !== 'automatic')
      return Promise.resolve(this.getState());
    if (!this.#options.canInstall())
      return Promise.resolve(
        this.#publish({ message: 'Save your changes before installing the update.' }),
      );
    return this.#run(async () => {
      this.#publish({ status: 'installing', message: undefined });
      await this.#backend!.install();
      return this.getState();
    });
  };
}
