// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestGoError, type RestGoStoredFile } from '@webrad/restgo-sdk';
import {
  configureRestGo,
  getRestGoClient,
  runtimeComponentRegistry,
  WebFileUpload,
  WebNonvisualComponent,
  type RestGoRuntimeConfiguration,
  type WebFileUploadProgressEventDetail,
} from '../src/index.js';

const configuration: RestGoRuntimeConfiguration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test/proxy/restgo',
  apiVersion: 1,
  defaultDatabase: '',
  persistSession: false,
  sessionStorage: 'memory',
  storageKey: 'file-upload-test',
};
const storedFile: RestGoStoredFile = {
  id: 'file-123',
  ownerId: 'user-1',
  ownerEmail: 'ana@example.test',
  originalName: 'photo.png',
  contentType: 'image/png',
  sizeBytes: 5,
  isPublic: false,
  createdAt: '2026-10-09T10:00:00Z',
  updatedAt: '2026-10-09T10:00:00Z',
  downloadUrl: '/storage/files/file-123/download',
};

function inputFor(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-file-upload-input]')!;
}
function setFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { 0: file, length: 1, item: () => file },
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
function choose(
  upload: WebFileUpload,
  file = new File(['photo'], 'photo.PNG', { type: 'image/png' }),
): File {
  void upload.OpenFile();
  setFile(inputFor(), file);
  return file;
}

beforeEach(() => {
  configureRestGo(configuration);
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => {
  configureRestGo({ ...configuration, enabled: false });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('nonvisual WebFileUpload', () => {
  it('has nonvisual identity with no visual adapter or obsolete methods', () => {
    const upload = new WebFileUpload({
      id: 'upload-1',
      name: 'FileUpload1',
      accept: '.pdf',
      isPublic: true,
      enabled: false,
    });
    expect(upload).toBeInstanceOf(WebNonvisualComponent);
    expect(upload.id).toBe('upload-1');
    expect(upload.name).toBe('FileUpload1');
    expect(upload.accept).toBe('.pdf');
    expect(upload.enabled).toBe(false);
    expect(upload.isPublic).toBe(true);
    expect(runtimeComponentRegistry.has('WebFileUpload')).toBe(false);
    for (const key of ['element', 'selectFile', 'upload', 'clear', 'caption', 'uploadCaption'])
      expect(key in upload).toBe(false);
    expect(document.body.children).toHaveLength(0);
  });

  it('opens a chooser separately and returns file metadata without an invented local path or upload', async () => {
    const upload = new WebFileUpload({ accept: 'image/*,.pdf' });
    const storageUpload = vi.spyOn(getRestGoClient().storage, 'upload');
    const changed = vi.fn();
    upload.onChange = changed;
    const promise = upload.OpenFile();
    expect(upload.OpenFile()).toBe(promise);
    const input = inputFor();
    expect(input.hidden).toBe(true);
    expect(input.accept).toBe('image/*,.pdf');
    const file = new File(['photo'], 'photo.PNG', { type: 'image/png' });
    setFile(input, file);
    const selection = await promise;
    expect(selection).toEqual({ name: 'photo.PNG', path: null, size: 5, extension: '.png' });
    expect(upload.selection).toBe(selection);
    expect(upload.selectedFile).toBe(file);
    expect(upload.fileName).toBe('photo.PNG');
    expect(changed).toHaveBeenCalledTimes(1);
    expect((changed.mock.calls[0]?.[1] as CustomEvent).detail).toBe(selection);
    expect(document.body.children).toHaveLength(0);
    const repeat = upload.OpenFile();
    setFile(inputFor(), file);
    expect(await repeat).toEqual(selection);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns a genuine browser-relative path when present and handles files without extensions', async () => {
    const upload = new WebFileUpload();
    const file = new File(['x'], '.config');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/.config' });
    const opened = upload.OpenFile();
    setFile(inputFor(), file);
    expect(await opened).toEqual({
      name: '.config',
      path: 'folder/.config',
      size: 1,
      extension: '',
    });
    choose(upload, new File([], 'README'));
    expect(upload.selection?.extension).toBe('');
  });

  it('settles native cancellation while preserving the previous selection', async () => {
    const upload = new WebFileUpload();
    const file = choose(upload);
    const promise = upload.OpenFile();
    inputFor().dispatchEvent(new Event('cancel'));
    expect(await promise).toBeNull();
    expect(upload.selectedFile).toBe(file);
    expect(document.body.children).toHaveLength(0);
  });

  it('uploads privately by default and returns every RestGO field plus an absolute URL preserving the proxy prefix', async () => {
    const upload = new WebFileUpload();
    const file = choose(upload);
    const send = vi
      .spyOn(getRestGoClient().storage, 'upload')
      .mockResolvedValue({ data: storedFile, error: null });
    const success = vi.fn();
    const complete = vi.fn();
    upload.onSuccess = success;
    upload.onComplete = complete;
    const promise = upload.SendToRestGO();
    expect(upload.SendToRestGO({ isPublic: true })).toBe(promise);
    expect(upload.uploading).toBe(true);
    const result = await promise;
    expect(send).toHaveBeenCalledExactlyOnceWith(file, {
      name: undefined,
      isPublic: false,
      signal: expect.any(AbortSignal),
      onUploadProgress: expect.any(Function),
    });
    expect(result).toEqual({
      ...storedFile,
      url: 'https://restgo.example.test/proxy/restgo/storage/files/file-123/download',
    });
    expect(result.downloadUrl).toBe(storedFile.downloadUrl);
    expect(upload.result).toBe(result);
    expect(upload.lastError).toBeNull();
    expect(upload.uploading).toBe(false);
    expect(upload.progress).toBe(100);
    expect((success.mock.calls[0]?.[1] as CustomEvent).detail).toBe(result);
    expect((complete.mock.calls[0]?.[1] as CustomEvent).detail).toEqual({ result, error: null });
  });

  it('supports public visibility and name overrides without mutating the configured default', async () => {
    const upload = new WebFileUpload();
    const file = choose(upload);
    const send = vi
      .spyOn(getRestGoClient().storage, 'upload')
      .mockResolvedValue({ data: { ...storedFile, isPublic: true }, error: null });
    expect((await upload.SendToRestGO({ isPublic: true, name: 'custom.png' })).isPublic).toBe(true);
    expect(send).toHaveBeenCalledWith(file, {
      name: 'custom.png',
      isPublic: true,
      signal: expect.any(AbortSignal),
      onUploadProgress: expect.any(Function),
    });
    expect(upload.isPublic).toBe(false);
    upload.isPublic = true;
    send.mockResolvedValue({ data: { ...storedFile, isPublic: false }, error: null });
    expect((await upload.SendToRestGO({ isPublic: false })).isPublic).toBe(false);
    expect(upload.isPublic).toBe(true);
  });

  it('forwards measured SDK progress and exposes confirmed completion without inventing byte counts', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    const events: WebFileUploadProgressEventDetail[] = [];
    upload.onProgress = (_sender, event) => {
      events.push((event as CustomEvent<WebFileUploadProgressEventDetail>).detail);
    };
    vi.spyOn(getRestGoClient().storage, 'upload').mockImplementation(async (_file, options) => {
      options?.onUploadProgress?.({
        loaded: 0,
        total: null,
        percentage: null,
        lengthComputable: false,
      });
      expect(upload.progress).toBeNull();
      options?.onUploadProgress?.({
        loaded: 50,
        total: 100,
        percentage: 50,
        lengthComputable: true,
      });
      expect(upload.progress).toBe(50);
      return { data: storedFile, error: null };
    });
    await upload.SendToRestGO();
    expect(events).toEqual([
      { loaded: 0, total: null, percentage: null, lengthComputable: false },
      { loaded: 50, total: 100, percentage: 50, lengthComputable: true },
      { loaded: 50, total: 100, percentage: 100, lengthComputable: true },
    ]);
    expect(upload.progress).toBe(100);
  });

  it('keeps unavailable transfer progress null until the server confirms completion', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    const progress = vi.fn();
    upload.onProgress = progress;
    vi.spyOn(getRestGoClient().storage, 'upload').mockResolvedValue({
      data: storedFile,
      error: null,
    });
    await upload.SendToRestGO();
    expect((progress.mock.calls[0]?.[1] as CustomEvent).detail).toEqual({
      loaded: 0,
      total: null,
      percentage: 100,
      lengthComputable: false,
    });
  });

  it('uses SDK multipart with the authenticated user JWT and does not change the returned private URL', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: 'upload-user-jwt',
            expiresAt: '2099-01-01T00:00:00Z',
            user: {
              id: 'user-1',
              email: 'ana@example.test',
              fullName: 'Ana',
              avatarUrl: null,
              active: true,
              emailConfirmed: true,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(storedFile), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    configureRestGo({
      ...configuration,
      baseUrl: `${window.location.origin}/proxy/restgo`,
      apiToken: 'rgo.application-token',
    });
    const client = getRestGoClient();
    await client.auth.ready;
    expect((await client.login('ana@example.test', 'secret')).sucess).toBe(true);
    const upload = new WebFileUpload();
    const file = choose(upload);
    const result = await upload.SendToRestGO({ name: 'report.png' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, request] = fetch.mock.calls[1]!;
    expect(String(url)).toBe(`${window.location.origin}/proxy/restgo/storage/files`);
    expect(request?.method).toBe('POST');
    expect(request?.credentials).toBe('omit');
    const headers = new Headers(request?.headers);
    expect(headers.get('Authorization')).toBe('Bearer upload-user-jwt');
    expect(headers.has('Content-Type')).toBe(false);
    const body = request?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('isPublic')).toBe('false');
    expect(body.get('name')).toBe('report.png');
    expect((body.get('file') as File).size).toBe(file.size);
    expect([...body.keys()]).toEqual(['file', 'name', 'isPublic']);
    expect(result.url).not.toContain('jwt');
    expect(result.isPublic).toBe(false);
  });

  it('requires a user session for public uploads without substituting the application token', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    configureRestGo({ ...configuration, apiToken: 'rgo.application-token' });
    const upload = new WebFileUpload();
    choose(upload);
    await expect(upload.SendToRestGO({ isPublic: true })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates SDK errors and rejects missing file, disabled methods, and disabled integration', async () => {
    const upload = new WebFileUpload();
    const events: string[] = [];
    upload.onError = () => {
      events.push('error');
    };
    upload.onComplete = () => {
      events.push('complete');
    };
    await expect(upload.SendToRestGO()).rejects.toThrow('Open a file');
    choose(upload);
    const error = new RestGoError('Session required', 'AUTH_REQUIRED', 401);
    const send = vi
      .spyOn(getRestGoClient().storage, 'upload')
      .mockResolvedValue({ data: null, error });
    events.length = 0;
    await expect(upload.SendToRestGO()).rejects.toBe(error);
    expect(events).toEqual(['error', 'complete']);
    expect(upload.lastError).toBe(error);
    expect(upload.uploading).toBe(false);
    upload.enabled = false;
    await expect(upload.OpenFile()).rejects.toThrow('disabled');
    await expect(upload.SendToRestGO()).rejects.toThrow('disabled');
    expect(send).toHaveBeenCalledTimes(1);
    upload.enabled = true;
    configureRestGo({ ...configuration, enabled: false });
    await expect(upload.SendToRestGO()).rejects.toThrow('Enable and configure RestGO');
  });

  it('rejects invalid file identifiers instead of constructing an unrelated download URL', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    vi.spyOn(getRestGoClient().storage, 'upload').mockResolvedValue({
      data: { ...storedFile, id: '../secrets' },
      error: null,
    });
    await expect(upload.SendToRestGO()).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(upload.result).toBeNull();
  });

  it('forwards abort signals and refuses a response arriving after cancellation', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    let finish!: (value: { data: RestGoStoredFile; error: null }) => void;
    const send = vi.spyOn(getRestGoClient().storage, 'upload').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const promise = upload.SendToRestGO({ signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    finish({ data: storedFile, error: null });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(upload.result).toBeNull();
    expect(upload.lastError?.name).toBe('AbortError');
  });

  it('Clear aborts the request, resets local state, and suppresses stale progress/results without deleting the file', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    let finish!: (value: { data: RestGoStoredFile; error: null }) => void;
    const send = vi.spyOn(getRestGoClient().storage, 'upload').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const remove = vi.spyOn(getRestGoClient().storage, 'remove');
    const success = vi.fn();
    const progress = vi.fn();
    upload.onSuccess = success;
    upload.onProgress = progress;
    const promise = upload.SendToRestGO();
    await Promise.resolve();
    upload.Clear();
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    send.mock.calls[0]?.[1]?.onUploadProgress?.({
      loaded: 5,
      total: 10,
      percentage: 50,
      lengthComputable: true,
    });
    finish({ data: storedFile, error: null });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(upload.selectedFile).toBeNull();
    expect(upload.selection).toBeNull();
    expect(upload.fileName).toBe('');
    expect(upload.result).toBeNull();
    expect(upload.lastError).toBeNull();
    expect(upload.progress).toBeNull();
    expect(upload.uploading).toBe(false);
    expect(success).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('Clear settles a pending chooser and ignores its late file selection', async () => {
    const upload = new WebFileUpload();
    const promise = upload.OpenFile();
    const input = inputFor();
    upload.Clear();
    expect(await promise).toBeNull();
    setFile(input, new File(['x'], 'late.txt'));
    expect(upload.selectedFile).toBeNull();
    choose(upload);
    expect(upload.fileName).toBe('photo.PNG');
  });

  it('dispose settles a pending chooser, removes DOM/listeners, and rejects future opens', async () => {
    const upload = new WebFileUpload();
    const promise = upload.OpenFile();
    const input = inputFor();
    upload.dispose();
    upload.dispose();
    expect(await promise).toBeNull();
    setFile(input, new File(['x'], 'late.txt'));
    expect(upload.selectedFile).toBeNull();
    expect(document.body.children).toHaveLength(0);
    await expect(upload.OpenFile()).rejects.toThrow('disposed');
  });

  it('dispose aborts an active request and suppresses its later progress and completion events', async () => {
    const upload = new WebFileUpload();
    choose(upload);
    let finish!: (value: { data: RestGoStoredFile; error: null }) => void;
    const send = vi.spyOn(getRestGoClient().storage, 'upload').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const progress = vi.fn();
    const complete = vi.fn();
    upload.onProgress = progress;
    upload.onComplete = complete;
    const promise = upload.SendToRestGO();
    await Promise.resolve();
    upload.dispose();
    expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    send.mock.calls[0]?.[1]?.onUploadProgress?.({
      loaded: 5,
      total: 10,
      percentage: 50,
      lengthComputable: true,
    });
    finish({ data: storedFile, error: null });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(progress).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(upload.result).toBeNull();
  });

  it('isolates files and requests across separate page/reusable component instances', async () => {
    const first = new WebFileUpload({ id: 'upload-a', name: 'FileUpload1' });
    const second = new WebFileUpload({ id: 'upload-b', name: 'FileUpload1' });
    choose(first, new File(['a'], 'first.txt'));
    choose(second, new File(['b'], 'second.txt'));
    expect(first.fileName).toBe('first.txt');
    expect(second.fileName).toBe('second.txt');
    const send = vi
      .spyOn(getRestGoClient().storage, 'upload')
      .mockResolvedValue({ data: storedFile, error: null });
    await second.SendToRestGO();
    expect(send.mock.calls[0]?.[0]).toBe(second.selectedFile);
    expect(first.result).toBeNull();
    second.Clear();
    expect(first.fileName).toBe('first.txt');
    expect(second.fileName).toBe('');
  });
});
