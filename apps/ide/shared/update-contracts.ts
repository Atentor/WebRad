export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'manual'
  | 'error';

export interface UpdateState {
  readonly status: UpdateStatus;
  readonly currentVersion: string;
  readonly latestVersion?: string;
  readonly mode?: 'automatic' | 'manual';
  readonly progress?: number;
  readonly message?: string;
}

/** No URLs, paths, credentials or commands are accepted from the renderer. */
export interface UpdateBridge {
  getState(): Promise<UpdateState>;
  check(): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  install(): Promise<UpdateState>;
  subscribe(listener: (state: UpdateState) => void): () => void;
}
