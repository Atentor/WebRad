import type { RestGoStoredFile, RestGoUploadProgress } from '@webrad/restgo-sdk';
import {
  WebNonvisualComponent,
  type WebComponentEventHandler,
  type WebNonvisualComponentOptions,
} from './component.js';
import { getRestGoClient } from './restgo.js';

export interface WebFileUploadConfiguration extends WebNonvisualComponentOptions {
  readonly accept?: string;
  readonly isPublic?: boolean;
  readonly enabled?: boolean;
}

export interface WebFileUploadSelection {
  readonly name: string;
  /** Browser-relative path when available. Browsers do not expose the absolute local path. */
  readonly path: string | null;
  /** File size in bytes. */
  readonly size: number;
  /** Lowercase final suffix with its dot, or an empty string when absent. */
  readonly extension: string;
}

export interface WebFileUploadOptions {
  /** Defaults to the component's isPublic property (false for a new component). */
  readonly isPublic?: boolean;
  readonly name?: string;
  readonly signal?: AbortSignal;
}

export interface WebFileUploadResult extends Readonly<RestGoStoredFile> {
  /** Absolute download URL. Private files still require authorized SDK download. */
  readonly url: string;
}

export type WebFileUploadChangeEventDetail = WebFileUploadSelection | null;

export interface WebFileUploadCompleteEventDetail {
  readonly result: WebFileUploadResult | null;
  readonly error: Error | null;
}

export type WebFileUploadProgressEventDetail = RestGoUploadProgress;

function uploadError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value instanceof DOMException) {
    const error = new Error(value.message);
    error.name = value.name;
    return error;
  }
  return new Error(String(value));
}

function fileSelection(file: File): WebFileUploadSelection {
  const dot = file.name.lastIndexOf('.');
  return Object.freeze({
    name: file.name,
    path: file.webkitRelativePath || null,
    size: file.size,
    extension: dot > 0 && dot < file.name.length - 1 ? file.name.slice(dot).toLowerCase() : '',
  });
}

/** Nonvisual browser file chooser and RestGO uploader scoped to one page or reusable placement. */
export class WebFileUpload extends WebNonvisualComponent {
  readonly #input: HTMLInputElement;
  #enabled = true;
  #selectedFile: File | null = null;
  #selection: WebFileUploadSelection | null = null;
  #result: WebFileUploadResult | null = null;
  #lastError: Error | null = null;
  #isPublic = false;
  #uploading = false;
  #progress: number | null = null;
  #disposed = false;
  #selectionPromise: Promise<WebFileUploadSelection | null> | null = null;
  #finishSelection: ((selection: WebFileUploadSelection | null) => void) | null = null;
  #discardSelection = false;
  #uploadPromise: Promise<WebFileUploadResult> | null = null;
  #uploadController: AbortController | null = null;
  #operationVersion = 0;

  public constructor(configuration: WebFileUploadConfiguration = {}) {
    super(configuration);
    this.#input = document.createElement('input');
    this.#input.type = 'file';
    this.#input.hidden = true;
    this.#input.dataset.fileUploadInput = '';
    this.#input.addEventListener('change', this.#handleInputChange);
    this.#input.addEventListener('cancel', this.#handleInputCancel);
    this.accept = configuration.accept ?? '';
    this.isPublic = configuration.isPublic ?? false;
    this.enabled = configuration.enabled ?? true;
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
    this.#input.disabled = !value || this.#uploading || this.#disposed;
    if (!value && this.#selectionPromise !== null) {
      this.#discardSelection = true;
      this.#settleSelection(null);
    }
  }
  public get isPublic(): boolean {
    return this.#isPublic;
  }
  public set isPublic(value: boolean) {
    this.#isPublic = value;
  }
  public get selectedFile(): File | null {
    return this.#selectedFile;
  }
  public get selection(): WebFileUploadSelection | null {
    return this.#selection;
  }
  public get fileName(): string {
    return this.#selectedFile?.name ?? '';
  }
  public get uploading(): boolean {
    return this.#uploading;
  }
  public get progress(): number | null {
    return this.#progress;
  }
  public get result(): WebFileUploadResult | null {
    return this.#result;
  }
  public get lastError(): Error | null {
    return this.#lastError;
  }

  /** Opens the native chooser without sending data. Invoke from a user gesture. */
  public OpenFile(): Promise<WebFileUploadSelection | null> {
    if (this.#disposed || !this.enabled || this.#uploading) {
      const error = new Error(
        'File selection is unavailable while disabled, uploading, or disposed.',
      );
      this.#reportError(error);
      return Promise.reject(error);
    }
    if (this.#selectionPromise !== null) return this.#selectionPromise;
    this.#discardSelection = false;
    let finish!: (selection: WebFileUploadSelection | null) => void;
    const promise = new Promise<WebFileUploadSelection | null>((resolve) => {
      finish = resolve;
    });
    this.#selectionPromise = promise;
    this.#finishSelection = finish;
    // Reset before reopening so selecting the same file still produces change.
    this.#input.value = '';
    const document = this.#input.ownerDocument;
    (document.body ?? document.documentElement).append(this.#input);
    try {
      this.#input.click();
    } catch (value) {
      this.#settleSelection(null);
      const error = uploadError(value);
      this.#reportError(error);
      return Promise.reject(error);
    }
    return promise;
  }

  /** Sends the selected file through the shared SDK. Concurrent calls share the request. */
  public SendToRestGO(options: WebFileUploadOptions = {}): Promise<WebFileUploadResult> {
    if (this.#uploadPromise !== null) return this.#uploadPromise;
    const file = this.#selectedFile;
    if (this.#disposed || !this.enabled || file === null) {
      const error = new Error(
        file === null
          ? 'Open a file before uploading.'
          : 'File upload is unavailable while disabled or disposed.',
      );
      this.#reportError(error);
      if (!this.#disposed) this.emit('OnComplete', { result: null, error });
      return Promise.reject(error);
    }
    if (this.#selectionPromise !== null) this.#discardSelection = true;
    this.#settleSelection(null);
    const version = ++this.#operationVersion;
    const controller = new AbortController();
    this.#uploadController = controller;
    this.#uploading = true;
    this.#input.disabled = true;
    this.#result = null;
    this.#lastError = null;
    this.#progress = null;
    const isPublic = options.isPublic ?? this.isPublic;
    const promise = this.#performUpload(file, options, isPublic, controller, version);
    this.#uploadPromise = promise;
    return promise;
  }

  /** Clears local state and aborts an upload; it does not delete a stored RestGO file. */
  public Clear(): void {
    ++this.#operationVersion;
    this.#uploadController?.abort();
    this.#uploadController = null;
    this.#uploadPromise = null;
    this.#uploading = false;
    if (this.#selectionPromise !== null) this.#discardSelection = true;
    this.#settleSelection(null);
    this.#input.value = '';
    this.#input.disabled = !this.enabled || this.#disposed;
    this.#selectedFile = null;
    this.#selection = null;
    this.#result = null;
    this.#lastError = null;
    this.#progress = null;
    if (!this.#disposed) this.emit('OnChange', null);
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
  public set onSuccess(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnSuccess', handler);
  }
  public set onError(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnError', handler);
  }
  public set onComplete(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnComplete', handler);
  }
  public set onProgress(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnProgress', handler);
  }

  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.Clear();
    this.#input.removeEventListener('change', this.#handleInputChange);
    this.#input.removeEventListener('cancel', this.#handleInputCancel);
    super.dispose();
  }

  readonly #handleInputChange = (): void => {
    if (this.#discardSelection || this.#disposed || this.#uploading || !this.enabled) {
      this.#discardSelection = false;
      this.#settleSelection(null);
      return;
    }
    const file = this.#input.files?.item(0) ?? null;
    if (file !== null) {
      this.#selectedFile = file;
      this.#selection = fileSelection(file);
      this.#result = null;
      this.#lastError = null;
      this.#progress = null;
      this.#settleSelection(this.#selection);
      this.emit('OnChange', this.#selection);
    } else this.#settleSelection(null);
  };

  readonly #handleInputCancel = (): void => {
    this.#discardSelection = false;
    this.#settleSelection(null);
  };

  #settleSelection(selection: WebFileUploadSelection | null): void {
    const finish = this.#finishSelection;
    this.#finishSelection = null;
    this.#selectionPromise = null;
    this.#input.remove();
    finish?.(selection);
  }

  async #performUpload(
    file: File,
    options: WebFileUploadOptions,
    isPublic: boolean,
    controller: AbortController,
    version: number,
  ): Promise<WebFileUploadResult> {
    const abort = (): void => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    let result: WebFileUploadResult | null = null;
    let error: Error | null = null;
    const progressState: { measured: WebFileUploadProgressEventDetail | null } = { measured: null };
    try {
      // Cache the promise before lifecycle/progress handlers can reenter.
      await Promise.resolve();
      if (controller.signal.aborted)
        throw new DOMException('File upload was aborted.', 'AbortError');
      const client = getRestGoClient();
      const response = await client.storage.upload(file, {
        name: options.name,
        isPublic,
        signal: controller.signal,
        onUploadProgress: (detail) => {
          if (controller.signal.aborted || version !== this.#operationVersion || this.#disposed)
            return;
          progressState.measured = detail;
          this.#progress = detail.percentage;
          this.emit('OnProgress', Object.freeze({ ...detail }));
        },
      });
      if (controller.signal.aborted || version !== this.#operationVersion)
        throw new DOMException('File upload was aborted.', 'AbortError');
      if (response.error !== null) throw response.error;
      if (typeof response.data.id !== 'string' || typeof response.data.isPublic !== 'boolean')
        throw new TypeError('RestGO returned invalid file metadata.');
      // URL construction preserves the configured proxy prefix and never grants
      // anonymous access to a private file or embeds a credential in the URL.
      const download = client.storage.getPublicUrl(response.data.id);
      if (download.error !== null) throw download.error;
      result = Object.freeze({ ...response.data, url: download.data.publicUrl });
      this.#result = result;
      this.#lastError = null;
      this.#progress = 100;
      const completed: WebFileUploadProgressEventDetail = {
        loaded: progressState.measured?.loaded ?? 0,
        total: progressState.measured?.total ?? null,
        percentage: 100,
        lengthComputable: progressState.measured?.lengthComputable ?? false,
      };
      this.emit('OnProgress', Object.freeze(completed));
      return result;
    } catch (value) {
      error = uploadError(value);
      if (version === this.#operationVersion && !this.#disposed) this.#lastError = error;
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (version === this.#operationVersion && !this.#disposed) {
        this.#uploading = false;
        this.#input.disabled = !this.enabled;
        this.#uploadController = null;
        this.#uploadPromise = null;
        if (error !== null) this.emit('OnError', error);
        else {
          this.#lastError = null;
          this.emit('OnSuccess', result);
        }
        this.emit('OnComplete', { result, error });
      }
    }
  }

  #reportError(error: Error): void {
    if (this.#disposed) return;
    this.#lastError = error;
    this.emit('OnError', error);
  }
}
