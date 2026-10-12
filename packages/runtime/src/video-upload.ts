import type {
  RestGoVideo,
  RestGoVideoDetails,
  RestGoVideoProgress,
  RestGoVideoResumeToken,
  RestGoVideoUploadOptions,
  RestGoVideoUploadSession,
  RestGoVideoWaitOptions,
} from '@webrad/restgo-sdk';
import {
  WebNonvisualComponent,
  type WebComponentEventHandler,
  type WebNonvisualComponentOptions,
} from './component.js';
import { getRestGoClient } from './restgo.js';
import {
  inspectVideo,
  validateVideoDuration,
  validateVideoFile,
  type WebVideoUploadSelection,
} from './video-file-selection.js';
export type { WebVideoUploadSelection } from './video-file-selection.js';

export interface WebVideoUploadConfiguration extends WebNonvisualComponentOptions {
  readonly accept?: string;
  readonly enabled?: boolean;
  readonly title?: string;
  readonly descri?: string;
  readonly isPublic?: boolean;
  readonly chunkSizeBytes?: number;
  /** MiB (1024² bytes). Null disables the local file-size limit. */
  readonly maxFileSizeMB?: number | null;
  /** Null disables the local duration limit. */
  readonly maxDurationSeconds?: number | null;
}
export interface WebVideoUploadOptions {
  readonly title?: string;
  readonly descri?: string;
  readonly isPublic?: boolean;
  readonly signal?: AbortSignal;
}
export interface WebVideoUploadResumeOptions extends WebVideoUploadOptions {
  /** Supply a saved checkpoint after reload, after selecting the original file again. */
  readonly resumeToken?: RestGoVideoResumeToken;
}
export type WebVideoUploadState =
  | 'idle'
  | 'selecting'
  | 'selected'
  | 'hashing'
  | 'creating'
  | 'uploading'
  | 'paused'
  | 'finalizing'
  | 'uploaded'
  | 'waiting'
  | 'ready'
  | 'cancelling'
  | 'cancelled'
  | 'error';
export type WebVideoUploadProgressEventDetail = RestGoVideoProgress;
export type WebVideoUploadProcessingEventDetail = RestGoVideoDetails;
export type WebVideoUploadChangeEventDetail = WebVideoUploadSelection | null;
export type WebVideoUploadResult = RestGoVideo;
export interface WebVideoUploadStateEventDetail {
  readonly previous: WebVideoUploadState;
  readonly state: WebVideoUploadState;
}
export interface WebVideoUploadCompleteEventDetail {
  readonly operation: 'upload' | 'processing' | 'cancel';
  readonly video: RestGoVideo | null;
  readonly error: Error | null;
}

function limit(value: number | null, name: string): number | null {
  if (value !== null && (!Number.isFinite(value) || value <= 0))
    throw new RangeError(`${name} must be positive or null.`);
  return value;
}
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Nonvisual resumable uploader. Conversion runs on RestGo; waiting is explicit. */
export class WebVideoUpload extends WebNonvisualComponent {
  readonly #input: HTMLInputElement;
  #enabled = true;
  #disposed = false;
  #file: File | null = null;
  #selection: WebVideoUploadSelection | null = null;
  #session: RestGoVideoUploadSession | null = null;
  #token: RestGoVideoResumeToken | null = null;
  #video: RestGoVideo | null = null;
  #state: WebVideoUploadState = 'idle';
  #error: Error | null = null;
  #confirmedBytes = 0;
  #processingProgress: number | null = null;
  #maxFileSizeMB: number | null = null;
  #maxDurationSeconds: number | null = null;
  #chunkSizeBytes = 8 * 1024 * 1024;
  #version = 0;
  #resetVersion = 0;
  #pauseRequested = false;
  #controller: AbortController | null = null;
  #promise: Promise<RestGoVideo> | null = null;
  #cancelPromise: Promise<void> | null = null;
  #selectPromise: Promise<WebVideoUploadSelection | null> | null = null;
  #selectResolve: ((selection: WebVideoUploadSelection | null) => void) | null = null;
  #selectReject: ((error: Error) => void) | null = null;
  #selectController: AbortController | null = null;
  #beforeSelection: WebVideoUploadState = 'idle';

  public title = '';
  public descri = '';
  public isPublic = false;
  public constructor(configuration: WebVideoUploadConfiguration = {}) {
    super(configuration);
    this.#input = document.createElement('input');
    this.#input.type = 'file';
    this.#input.hidden = true;
    this.#input.dataset.videoUploadInput = '';
    this.#input.addEventListener('change', this.#change);
    this.#input.addEventListener('cancel', this.#cancelSelection);
    this.accept = configuration.accept ?? '.mp4,.mov,.mkv,.webm';
    this.enabled = configuration.enabled ?? true;
    this.title = configuration.title ?? '';
    this.descri = configuration.descri ?? '';
    this.isPublic = configuration.isPublic ?? false;
    this.chunkSizeBytes = configuration.chunkSizeBytes ?? 8 * 1024 * 1024;
    this.maxFileSizeMB = configuration.maxFileSizeMB ?? null;
    this.maxDurationSeconds = configuration.maxDurationSeconds ?? null;
  }
  public get accept(): string {
    return this.#input.accept;
  }
  public set accept(value: string) {
    this.#input.accept = value;
  }
  public get enabled(): boolean {
    return this.#enabled;
  }
  public set enabled(value: boolean) {
    this.#enabled = value;
    this.#input.disabled = !value;
    if (!value) this.#settleSelection(null);
  }
  public get maxFileSizeMB(): number | null {
    return this.#maxFileSizeMB;
  }
  public set maxFileSizeMB(value: number | null) {
    if (value !== null && value > Number.MAX_SAFE_INTEGER / (1024 * 1024))
      throw new RangeError('maxFileSizeMB exceeds the safe byte range.');
    this.#maxFileSizeMB = limit(value, 'maxFileSizeMB');
  }
  public get maxDurationSeconds(): number | null {
    return this.#maxDurationSeconds;
  }
  public set maxDurationSeconds(value: number | null) {
    this.#maxDurationSeconds = limit(value, 'maxDurationSeconds');
  }
  public get chunkSizeBytes(): number {
    return this.#chunkSizeBytes;
  }
  public set chunkSizeBytes(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new RangeError('chunkSizeBytes must be a positive safe integer.');
    this.#chunkSizeBytes = value;
  }
  public get selectedFile(): File | null {
    return this.#file;
  }
  public get selection(): WebVideoUploadSelection | null {
    return this.#selection;
  }
  public get uploadSession(): RestGoVideoUploadSession | null {
    return this.#session;
  }
  public get resumeToken(): RestGoVideoResumeToken | null {
    return this.#token;
  }
  public get video(): RestGoVideo | null {
    return this.#video;
  }
  public get state(): WebVideoUploadState {
    return this.#state;
  }
  public get confirmedBytes(): number {
    return this.#confirmedBytes;
  }
  public get totalBytes(): number {
    return this.#file?.size ?? 0;
  }
  public get percentage(): number | null {
    return this.totalBytes ? (this.#confirmedBytes / this.totalBytes) * 100 : null;
  }
  public get processingProgress(): number | null {
    return this.#processingProgress;
  }
  public get error(): Error | null {
    return this.#error;
  }

  /** Opens the chooser from a user gesture. It never creates or sends an upload. */
  public OpenFile(): Promise<WebVideoUploadSelection | null> {
    if (this.#selectPromise) return this.#selectPromise;
    if (this.#disposed || !this.enabled || this.#promise || this.#cancelPromise)
      return Promise.reject(new Error('Video selection is unavailable while disabled or busy.'));
    this.#beforeSelection = this.#state;
    const promise = new Promise<WebVideoUploadSelection | null>((resolve, reject) => {
      this.#selectResolve = resolve;
      this.#selectReject = reject;
    });
    this.#selectPromise = promise;
    this.#selectController = new AbortController();
    this.#input.value = '';
    (document.body ?? document.documentElement).append(this.#input);
    this.#setState('selecting');
    try {
      if (!this.#disposed && this.#state === 'selecting') this.#input.click();
    } catch (error) {
      this.#settleSelection(null, asError(error));
    }
    return promise;
  }
  public SendToRestGO(options: WebVideoUploadOptions = {}): Promise<RestGoVideo> {
    if (this.#promise) return this.#promise;
    if (this.#token)
      return Promise.reject(
        new Error('Use Resume() for this existing session, or Clear() before a new upload.'),
      );
    return this.#startUpload(options);
  }
  public Resume(options: WebVideoUploadResumeOptions = {}): Promise<RestGoVideo> {
    if (this.#promise) return this.#promise;
    const token = options.resumeToken ?? this.#token;
    if (!token && this.#state === 'paused') return this.#startUpload(options);
    if (!token)
      return Promise.reject(
        new Error('No upload checkpoint is available. Use SendToRestGO() to start an upload.'),
      );
    return this.#startUpload(options, token);
  }
  /** Aborts only local upload I/O. The server session remains resumable. */
  public Pause(): void {
    if (!['hashing', 'creating', 'uploading', 'finalizing'].includes(this.#state)) return;
    this.#pauseRequested = true;
    // Creation has no idempotency key. Keep its response so Resume knows the session ID.
    if (this.#state !== 'creating') this.#controller?.abort();
    this.#setState('paused');
  }
  /** Explicitly cancels the open upload on RestGo. It does not cancel conversion jobs. */
  public CancelUpload(): Promise<void> {
    if (this.#cancelPromise) return this.#cancelPromise;
    if (this.#disposed || !this.#session || this.#session.state !== 'open')
      return Promise.reject(new Error('An open upload session is required to cancel.'));
    const session = this.#session;
    const active = this.#promise;
    this.#controller?.abort();
    this.#setState('cancelling');
    const version = this.#version;
    this.#cancelPromise = (async () => {
      let error: Error | null = null;
      try {
        await active?.catch(() => undefined);
        if (version !== this.#version || this.#disposed)
          throw new DOMException('Cancellation was aborted.', 'AbortError');
        const controller = new AbortController();
        this.#controller = controller;
        const result = await getRestGoClient().videos.uploads.cancel(session.id, {
          signal: controller.signal,
        });
        if (result.error) throw result.error;
        if (version !== this.#version || this.#disposed) return;
        this.#session = Object.freeze({ ...session, state: 'cancelled' });
        this.#token = null;
        this.#setState('cancelled');
      } catch (value) {
        error = asError(value);
        if (version === this.#version && !this.#disposed) this.#report(error);
        throw error;
      } finally {
        if (version === this.#version && !this.#disposed) {
          this.#cancelPromise = null;
          this.#controller = null;
          this.emit('OnComplete', {
            operation: 'cancel',
            video: this.#video,
            error,
          } satisfies WebVideoUploadCompleteEventDetail);
        }
      }
    })();
    return this.#cancelPromise;
  }
  public WaitUntilReady(options: RestGoVideoWaitOptions = {}): Promise<RestGoVideo> {
    if (this.#promise)
      return this.#state === 'waiting'
        ? this.#promise
        : Promise.reject(new Error('Finish uploading before waiting for conversion.'));
    if (this.#disposed || !this.#video || this.#cancelPromise)
      return Promise.reject(new Error('Upload a video before waiting for conversion.'));
    return this.#run('processing', options.signal, async (signal) => {
      this.#setState('waiting');
      const result = await getRestGoClient().videos.waitUntilReady(this.#video!.id, {
        ...options,
        signal,
        onProgress: (details) => {
          if (signal.aborted) return;
          this.#video = Object.freeze({ ...details.video });
          this.#processingProgress = details.video.progress;
          this.emit('OnProcessingProgress', details);
          options.onProgress?.(details);
        },
      });
      if (result.error) throw result.error;
      return result.data;
    });
  }
  /** Clears local state and stops requests. No remote video/session is deleted. */
  public Clear(): void {
    ++this.#resetVersion;
    this.#pauseRequested = false;
    ++this.#version;
    this.#controller?.abort();
    this.#controller = null;
    this.#promise = null;
    this.#cancelPromise = null;
    this.#settleSelection(null);
    this.#file = null;
    this.#selection = null;
    this.#session = null;
    this.#token = null;
    this.#video = null;
    this.#error = null;
    this.#confirmedBytes = 0;
    this.#processingProgress = null;
    this.#setState('idle');
    if (!this.#disposed) this.emit('OnChange', null);
  }
  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
  public set onProgress(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnProgress', handler);
  }
  public set onStateChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnStateChange', handler);
  }
  public set onUploadComplete(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnUploadComplete', handler);
  }
  public set onProcessingProgress(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnProcessingProgress', handler);
  }
  public set onReady(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnReady', handler);
  }
  public set onError(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnError', handler);
  }
  public set onComplete(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnComplete', handler);
  }
  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.Clear();
    this.#input.removeEventListener('change', this.#change);
    this.#input.removeEventListener('cancel', this.#cancelSelection);
    super.dispose();
  }
  readonly #change = (): void => {
    void this.#selectFile();
  };
  readonly #cancelSelection = (): void => {
    this.#settleSelection(null);
  };
  async #selectFile(): Promise<void> {
    const controller = this.#selectController;
    const file = this.#input.files?.item(0);
    if (!controller || !file) {
      this.#settleSelection(null);
      return;
    }
    try {
      validateVideoFile(file, this.maxFileSizeMB);
      const selection = await inspectVideo(file, controller.signal);
      if (controller.signal.aborted || this.#disposed) return;
      validateVideoDuration(selection, this.maxDurationSeconds);
      this.#file = file;
      this.#selection = selection;
      this.#video = null;
      this.#session = null;
      this.#token = null;
      this.#error = null;
      this.#confirmedBytes = 0;
      this.#processingProgress = null;
      this.#settleSelection(selection);
      this.#setState('selected');
      this.emit('OnChange', selection);
    } catch (value) {
      if (controller.signal.aborted) return;
      const error = asError(value);
      this.#settleSelection(null, error);
      this.#report(error);
    }
  }
  #settleSelection(selection: WebVideoUploadSelection | null, error?: Error): void {
    const resolve = this.#selectResolve;
    const reject = this.#selectReject;
    this.#selectController?.abort();
    this.#selectController = null;
    this.#selectResolve = null;
    this.#selectReject = null;
    this.#selectPromise = null;
    this.#input.remove();
    if (this.#state === 'selecting') this.#setState(this.#beforeSelection);
    if (error) reject?.(error);
    else resolve?.(selection);
  }
  #setState(state: WebVideoUploadState): void {
    const previous = this.#state;
    this.#state = state;
    if (previous !== state && !this.#disposed)
      this.emit('OnStateChange', { previous, state } satisfies WebVideoUploadStateEventDetail);
  }
  #report(error: Error): void {
    this.#error = error;
    this.#setState('error');
    this.emit('OnError', error);
  }
  #startUpload(
    options: WebVideoUploadOptions,
    token?: RestGoVideoResumeToken,
  ): Promise<RestGoVideo> {
    const file = this.#file;
    const selection = this.#selection;
    if (
      this.#disposed ||
      !this.enabled ||
      !file ||
      !selection ||
      this.#selectPromise ||
      this.#cancelPromise
    )
      return Promise.reject(
        new Error('Select a video before uploading, and enable the component.'),
      );
    return this.#run('upload', options.signal, async (signal) => {
      validateVideoFile(file, this.maxFileSizeMB);
      validateVideoDuration(selection, this.maxDurationSeconds);
      const client = getRestGoClient();
      const sdkOptions: RestGoVideoUploadOptions = {
        title: options.title ?? this.title,
        descri: options.descri ?? this.descri,
        isPublic: options.isPublic ?? this.isPublic,
        chunkSizeBytes: this.chunkSizeBytes,
        signal,
        onSession: (session) => {
          if (this.#controller?.signal === signal) this.#session = session;
        },
        onResumeToken: (checkpoint) => {
          if (this.#controller?.signal === signal) {
            this.#token = checkpoint;
            if (this.#pauseRequested) this.#controller.abort();
          }
        },
        onPhase: (phase) => {
          if (!signal.aborted) this.#setState(phase);
        },
        onProgress: (progress) => {
          if (signal.aborted) return;
          this.#confirmedBytes = progress.confirmedBytes;
          this.emit('OnProgress', Object.freeze({ ...progress }));
        },
      };
      const result = token
        ? await client.videos.resumeUpload(token.uploadId, file, {
            ...sdkOptions,
            resumeToken: token,
          })
        : await client.videos.upload(file, sdkOptions);
      if (result.error) throw result.error;
      // Also verify duration reported by FFprobe when the original is accepted.
      if (this.maxDurationSeconds !== null && result.data.source.duration > this.maxDurationSeconds)
        throw new RangeError('RestGO reported a video duration above the configured limit.');
      return result.data;
    });
  }
  #run(
    operation: 'upload' | 'processing',
    external: AbortSignal | undefined,
    action: (signal: AbortSignal) => Promise<RestGoVideo>,
  ): Promise<RestGoVideo> {
    const controller = new AbortController();
    const version = ++this.#version;
    this.#controller = controller;
    this.#pauseRequested = false;
    this.#error = null;
    const abort = (): void => controller.abort();
    external?.addEventListener('abort', abort, { once: true });
    if (external?.aborted) abort();
    const promise = (async () => {
      let video: RestGoVideo | null = null;
      let error: Error | null = null;
      try {
        // Save the active promise before emitting any reentrant events.
        await Promise.resolve();
        if (controller.signal.aborted)
          throw new DOMException('Video operation was aborted.', 'AbortError');
        video = await action(controller.signal);
        if (controller.signal.aborted || version !== this.#version)
          throw new DOMException('Video operation was aborted.', 'AbortError');
        this.#video = Object.freeze({ ...video });
        if (operation === 'upload') {
          this.#confirmedBytes = this.totalBytes;
        }
        return this.#video;
      } catch (value) {
        error = asError(value);
        throw error;
      } finally {
        external?.removeEventListener('abort', abort);
        if (version === this.#version && !this.#disposed) {
          this.#promise = null;
          this.#controller = null;
          const resetVersion = this.#resetVersion;
          if (error) {
            if (controller.signal.aborted) {
              if (this.#state !== 'cancelling' && this.#state !== 'paused')
                this.#setState(this.#token ? 'paused' : this.#file ? 'selected' : 'idle');
            } else this.#report(error);
          } else {
            this.#setState(operation === 'upload' ? 'uploaded' : 'ready');
            if (resetVersion === this.#resetVersion && !this.#disposed)
              this.emit(operation === 'upload' ? 'OnUploadComplete' : 'OnReady', video);
          }
          if (resetVersion === this.#resetVersion && !this.#disposed)
            this.emit('OnComplete', {
              operation,
              video,
              error,
            } satisfies WebVideoUploadCompleteEventDetail);
        }
      }
    })();
    this.#promise = promise;
    return promise;
  }
}
