// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  RestGoError,
  type RestGoVideoResumeToken,
  type RestGoVideoUploadOptions,
} from '@webrad/restgo-sdk';
import {
  configureRestGo,
  getRestGoClient,
  WebNonvisualComponent,
  WebVideoUpload,
} from '../src/index.js';
import { videoRecord } from '../../../tests/fixtures/video-upload';

const configuration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test',
  apiVersion: 1,
  defaultDatabase: '',
  persistSession: false,
  sessionStorage: 'memory' as const,
  storageKey: 'video-runtime',
};
const session = {
  id: 'u',
  videoId: 'video-1',
  offset: 0,
  sizeBytes: 16,
  state: 'open' as const,
  expiresAt: '2099-01-01',
  maxChunkBytes: 7,
};
const token: RestGoVideoResumeToken = {
  version: 1,
  baseUrl: configuration.baseUrl,
  ownerId: 'video-user',
  uploadId: 'u',
  videoId: 'video-1',
  name: 'aula.webm',
  sizeBytes: 16,
  lastModified: 123,
  fingerprint: 'f'.repeat(64),
};
let duration = 1;
beforeEach(() => {
  configureRestGo(configuration);
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }),
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((
    name: string,
    options?: ElementCreationOptions,
  ) => {
    const element = create(name, options);
    if (element instanceof HTMLVideoElement) {
      Object.defineProperty(element, 'duration', { get: () => duration });
      queueMicrotask(() => element.dispatchEvent(new Event('loadedmetadata')));
    }
    return element;
  }) as typeof document.createElement);
});
afterEach(() => {
  configureRestGo({ ...configuration, enabled: false });
  document.body.replaceChildren();
  duration = 1;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function select(
  upload: WebVideoUpload,
  file = new File(['0123456789abcdef'], 'aula.webm', { lastModified: 123 }),
) {
  const promise = upload.OpenFile();
  const input = document.querySelector<HTMLInputElement>('[data-video-upload-input]')!;
  Object.defineProperty(input, 'files', { value: { item: () => file }, configurable: true });
  input.dispatchEvent(new Event('change'));
  return promise;
}
function successfulUpload() {
  return vi
    .spyOn(getRestGoClient().videos, 'upload')
    .mockImplementation(async (_file, options = {}) => {
      options.onSession?.(session);
      options.onResumeToken?.(token);
      options.onPhase?.('uploading');
      options.onProgress?.({ confirmedBytes: 16, totalBytes: 16, percentage: 100, chunk: null });
      return { data: videoRecord(), error: null };
    });
}
it('can resume a pause during hashing and preserves creation identity when paused in flight', async () => {
  const upload = new WebVideoUpload();
  await select(upload);
  const send = vi
    .spyOn(getRestGoClient().videos, 'upload')
    .mockImplementation(async (_file, options = {}) => {
      options.onPhase?.('hashing');
      await new Promise<void>((resolve) =>
        options.signal?.addEventListener('abort', () => resolve()),
      );
      return { data: null, error: new RestGoError('paused', 'ABORTED') };
    });
  let promise = upload.SendToRestGO();
  let rejection = expect(promise).rejects.toThrow('paused');
  await expect.poll(() => upload.state).toBe('hashing');
  upload.Pause();
  await rejection;
  expect(upload.state).toBe('paused');
  expect(upload.resumeToken).toBeNull();
  send.mockResolvedValue({ data: videoRecord(), error: null });
  expect((await upload.Resume()).id).toBe('video-1');
  upload.Clear();
  await select(upload);
  let release!: () => void;
  let captured: AbortSignal | undefined;
  send.mockImplementation(async (_file, options = {}) => {
    captured = options.signal;
    options.onPhase?.('creating');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    options.onSession?.(session);
    options.onResumeToken?.(token);
    return { data: null, error: new RestGoError('paused', 'ABORTED') };
  });
  promise = upload.SendToRestGO();
  rejection = expect(promise).rejects.toThrow('paused');
  await expect.poll(() => upload.state).toBe('creating');
  upload.Pause();
  expect(captured?.aborted).toBe(false);
  release();
  await rejection;
  expect(captured?.aborted).toBe(true);
  expect(upload.resumeToken).toBe(token);
  expect(upload.state).toBe('paused');
  upload.dispose();
});
it('allows OnUploadComplete to start explicit readiness polling and reports each terminal operation once', async () => {
  const upload = new WebVideoUpload();
  await select(upload);
  successfulUpload();
  vi.spyOn(getRestGoClient().videos, 'waitUntilReady').mockResolvedValue({
    data: { ...videoRecord(), status: 'ready', generation: 'g' },
    error: null,
  });
  const completed: string[] = [];
  upload.onComplete = (_sender, event) => {
    completed.push((event as CustomEvent<{ operation: string }>).detail.operation);
  };
  let ready: Promise<unknown> | undefined;
  upload.onUploadComplete = () => {
    ready = upload.WaitUntilReady();
  };
  await upload.SendToRestGO();
  await ready;
  expect(completed).toEqual(['upload', 'processing']);
  expect(upload.state).toBe('ready');
  upload.dispose();
});
it('is a scoped nonvisual service and validates selection without uploading', async () => {
  const upload = new WebVideoUpload({
    id: 'video',
    name: 'VideoUpload1',
    maxFileSizeMB: 1,
    maxDurationSeconds: 5,
  });
  expect(upload).toBeInstanceOf(WebNonvisualComponent);
  expect('element' in upload).toBe(false);
  const send = successfulUpload();
  const selected = await select(upload);
  expect(selected).toEqual({
    name: 'aula.webm',
    extension: '.webm',
    path: null,
    size: 16,
    duration: 1,
  });
  expect(upload.selectedFile?.name).toBe('aula.webm');
  expect(upload.state).toBe('selected');
  expect(send).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  const cancelled = upload.OpenFile();
  document.querySelector('[data-video-upload-input]')!.dispatchEvent(new Event('cancel'));
  expect(await cancelled).toBeNull();
  expect(upload.selection).toBe(selected);
  upload.dispose();
});
it('enforces file size, duration, supported formats and unknown duration before creating a session', async () => {
  const upload = new WebVideoUpload({ maxFileSizeMB: 0.000001, maxDurationSeconds: 5 });
  const send = successfulUpload();
  await expect(select(upload)).rejects.toThrow('MB limit');
  upload.maxFileSizeMB = null;
  duration = 6;
  await expect(select(upload)).rejects.toThrow('duration limit');
  duration = Infinity;
  await expect(select(upload)).rejects.toThrow('could not read');
  upload.maxDurationSeconds = null;
  expect((await select(upload))?.duration).toBeNull();
  await expect(select(upload, new File(['content'], 'image.png'))).rejects.toThrow('MP4');
  expect(send).not.toHaveBeenCalled();
  upload.dispose();
});
it('rechecks edited limits on send, shares concurrent promises and emits distinct upload/ready events once', async () => {
  const upload = new WebVideoUpload();
  await select(upload);
  const send = successfulUpload();
  upload.maxDurationSeconds = 0.5;
  await expect(upload.SendToRestGO()).rejects.toThrow('duration limit');
  expect(send).not.toHaveBeenCalled();
  upload.maxDurationSeconds = 2;
  const uploaded = vi.fn();
  const ready = vi.fn();
  const complete = vi.fn();
  upload.onUploadComplete = uploaded;
  upload.onReady = ready;
  upload.onComplete = complete;
  const promise = upload.SendToRestGO({ title: 'Test', isPublic: true });
  expect(upload.SendToRestGO()).toBe(promise);
  expect((await promise).status).toBe('pending');
  expect(send.mock.calls[0]?.[1]).toMatchObject({ title: 'Test', isPublic: true });
  expect(upload.state).toBe('uploaded');
  expect(upload.percentage).toBe(100);
  expect(uploaded).toHaveBeenCalledOnce();
  expect(ready).not.toHaveBeenCalled();
  vi.spyOn(getRestGoClient().videos, 'waitUntilReady').mockResolvedValue({
    data: { ...videoRecord(), status: 'ready', generation: 'g' },
    error: null,
  });
  expect((await upload.WaitUntilReady()).status).toBe('ready');
  expect(ready).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledTimes(2);
  upload.dispose();
});
it('preserves the server session when paused and uses Resume; remote cancel is explicit', async () => {
  const upload = new WebVideoUpload();
  await select(upload);
  const cancelled = vi
    .spyOn(getRestGoClient().videos.uploads, 'cancel')
    .mockResolvedValue({ data: { status: 'deleting' }, error: null });
  vi.spyOn(getRestGoClient().videos, 'upload').mockImplementation(async (_file, options = {}) => {
    options.onSession?.(session);
    options.onResumeToken?.(token);
    options.onPhase?.('uploading');
    await new Promise<void>((resolve) =>
      options.signal?.addEventListener('abort', () => resolve(), { once: true }),
    );
    return { data: null, error: new RestGoError('paused', 'ABORTED') };
  });
  const promise = upload.SendToRestGO();
  const rejection = expect(promise).rejects.toThrow('paused');
  await expect.poll(() => upload.state).toBe('uploading');
  upload.Pause();
  await rejection;
  expect(upload.state).toBe('paused');
  expect(upload.resumeToken).toBe(token);
  expect(cancelled).not.toHaveBeenCalled();
  const resumed = vi
    .spyOn(getRestGoClient().videos, 'resumeUpload')
    .mockResolvedValue({ data: videoRecord(), error: null });
  await upload.Resume();
  expect(resumed.mock.calls[0]?.[0]).toBe('u');
  // A fresh instance with an open session can explicitly cancel it.
  upload.Clear();
  await select(upload);
  const next = upload.SendToRestGO();
  const nextRejection = expect(next).rejects.toThrow('paused');
  await expect.poll(() => upload.state).toBe('uploading');
  await upload.CancelUpload();
  await nextRejection;
  expect(cancelled).toHaveBeenCalledOnce();
  expect(upload.state).toBe('cancelled');
  upload.dispose();
});
it('disposes I/O locally, rejects invalid limits and discards stale callbacks after Clear', async () => {
  const first = new WebVideoUpload();
  const second = new WebVideoUpload();
  await select(first);
  let callbacks: RestGoVideoUploadOptions | undefined;
  vi.spyOn(getRestGoClient().videos, 'upload').mockImplementation(async (_file, options) => {
    callbacks = options;
    await new Promise<void>((resolve) =>
      options?.signal?.addEventListener('abort', () => resolve()),
    );
    options?.onSession?.(session);
    options?.onResumeToken?.(token);
    return { data: null, error: new RestGoError('aborted', 'ABORTED') };
  });
  const complete = vi.fn();
  first.onComplete = complete;
  const promise = first.SendToRestGO();
  const rejection = expect(promise).rejects.toThrow('aborted');
  await expect.poll(() => callbacks).toBeDefined();
  first.Clear();
  await rejection;
  expect(first.uploadSession).toBeNull();
  expect(first.resumeToken).toBeNull();
  expect(second.selection).toBeNull();
  expect(complete).not.toHaveBeenCalled();
  expect(() => {
    first.maxFileSizeMB = -1;
  }).toThrow(RangeError);
  expect(() => {
    first.maxDurationSeconds = NaN;
  }).toThrow(RangeError);
  expect(() => {
    first.chunkSizeBytes = 1.5;
  }).toThrow(RangeError);
  first.dispose();
  second.dispose();
});
