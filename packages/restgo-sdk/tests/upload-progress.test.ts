import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClient,
  type RestGoClient,
  type RestGoClientOptions,
  type RestGoSession,
  type RestGoStoredFile,
} from '../src/index';

const baseUrl = 'https://restgo.example.test/service';
const user = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana',
  avatarUrl: null,
  active: true,
  emailConfirmed: true,
};
function session(index = 1): RestGoSession {
  return {
    token: `jwt-${index}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    refreshToken: `rgr_${String(index).padStart(43, '0')}`,
    refreshExpiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    user,
  };
}
const storedFile: RestGoStoredFile = {
  id: 'file-1',
  ownerId: user.id,
  ownerEmail: user.email,
  originalName: 'document.pdf',
  contentType: 'application/pdf',
  sizeBytes: 500,
  isPublic: false,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
  downloadUrl: '/storage/files/file-1/download',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

class UploadXHR extends EventTarget {
  static instances: UploadXHR[] = [];
  readonly upload = new EventTarget();
  readonly requestHeaders = new Headers();
  readonly abort = vi.fn(() => this.dispatchEvent(new Event('abort')));
  readonly send = vi.fn((body: Blob | FormData | string) => {
    this.body = body;
  });
  body: Blob | FormData | string | undefined;
  method = '';
  url = '';
  withCredentials = true;
  responseType = '';
  responseURL = '';
  responseText = '';
  response: Blob | undefined;
  status = 200;
  statusText = 'OK';
  responseHeaders = 'Content-Type: application/json\r\n';

  constructor() {
    super();
    UploadXHR.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.set(name, value);
  }
  getAllResponseHeaders(): string {
    return this.responseHeaders;
  }
  progress(loaded: number, total: number, lengthComputable = true): void {
    this.upload.dispatchEvent(
      Object.assign(new Event('progress'), { loaded, total, lengthComputable }),
    );
  }
  respond(body: unknown, status = 201, url = this.url): void {
    this.responseText = JSON.stringify(body);
    this.status = status;
    this.responseURL = url;
    this.dispatchEvent(new Event('load'));
  }
}

const clients: RestGoClient[] = [];
beforeEach(() => {
  UploadXHR.instances = [];
  vi.stubGlobal('XMLHttpRequest', UploadXHR);
  vi.stubGlobal('location', { protocol: 'https:', origin: 'https://app.example.test' });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function loggedIn(options: RestGoClientOptions = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(session()));
  vi.stubGlobal('fetch', fetch);
  const client = createClient(baseUrl, { persistSession: false, ...options });
  clients.push(client);
  await client.auth.ready;
  await client.login(user.email, 'password');
  return { client, fetch };
}
async function pendingXHR(index = 0): Promise<UploadXHR> {
  await vi.waitFor(() => expect(UploadXHR.instances[index]?.send).toHaveBeenCalledOnce());
  return UploadXHR.instances[index]!;
}

describe('RestGo multipart upload progress', () => {
  it('reports actual multipart bytes, retains the proxy path and returns all server metadata', async () => {
    const { client, fetch } = await loggedIn();
    const progress = vi.fn();
    const file = new Blob(['pdf contents'], { type: 'application/pdf' });
    const uploading = client.storage.upload(file, {
      name: 'document.pdf',
      isPublic: false,
      onUploadProgress: progress,
    });
    const xhr = await pendingXHR();
    expect(xhr.url).toBe(`${baseUrl}/storage/files`);
    expect(xhr.method).toBe('POST');
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.requestHeaders.get('Authorization')).toBe('Bearer jwt-1');
    expect(xhr.requestHeaders.has('Content-Type')).toBe(false);
    expect(xhr.body).toBeInstanceOf(FormData);
    const form = xhr.body as FormData;
    expect(form.get('name')).toBe('document.pdf');
    expect(form.get('isPublic')).toBe('false');
    expect((form.get('file') as File).name).toBe('document.pdf');
    expect(progress).toHaveBeenLastCalledWith({
      loaded: 0,
      total: null,
      percentage: null,
      lengthComputable: false,
    });
    xhr.progress(250, 1000);
    expect(progress).toHaveBeenLastCalledWith({
      loaded: 250,
      total: 1000,
      percentage: 25,
      lengthComputable: true,
    });
    xhr.progress(700, 0, false);
    expect(progress).toHaveBeenLastCalledWith({
      loaded: 700,
      total: null,
      percentage: null,
      lengthComputable: false,
    });
    xhr.respond(storedFile);
    expect(await uploading).toEqual({ data: storedFile, error: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    const notifications = progress.mock.calls.length;
    xhr.progress(1000, 1000);
    expect(progress).toHaveBeenCalledTimes(notifications);
  });

  it.each(['same-origin', 'nonbrowser', 'non-http-page', 'custom-fetch'])(
    'retains credential omission and redirect rejection with indeterminate progress for %s',
    async (environment) => {
      if (environment === 'same-origin')
        vi.stubGlobal('location', { protocol: 'https:', origin: 'https://restgo.example.test' });
      if (environment === 'nonbrowser') vi.stubGlobal('XMLHttpRequest', undefined);
      if (environment === 'non-http-page')
        vi.stubGlobal('location', { protocol: 'file:', origin: 'null' });
      const customFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(json(session()))
        .mockResolvedValueOnce(json(storedFile, 201));
      const { client, fetch: globalFetch } = await loggedIn(
        environment === 'custom-fetch' ? { fetch: customFetch } : {},
      );
      const fetch = environment === 'custom-fetch' ? customFetch : globalFetch;
      if (environment !== 'custom-fetch') fetch.mockResolvedValueOnce(json(storedFile, 201));
      const progress = vi.fn();
      expect(
        await client.storage.upload(new Blob(['data']), { onUploadProgress: progress }),
      ).toEqual({ data: storedFile, error: null });
      expect(fetch).toHaveBeenLastCalledWith(
        `${baseUrl}/storage/files`,
        expect.objectContaining({ credentials: 'omit', redirect: 'error', method: 'POST' }),
      );
      expect(UploadXHR.instances).toHaveLength(0);
      expect(progress.mock.calls).toEqual([
        [{ loaded: 0, total: null, percentage: null, lengthComputable: false }],
      ]);
    },
  );

  it('keeps ordinary uploads on fetch without opting into a different transport', async () => {
    const { client, fetch } = await loggedIn();
    fetch.mockResolvedValueOnce(json(storedFile, 201));
    expect((await client.storage.upload(new Blob(['data']))).data).toEqual(storedFile);
    expect(UploadXHR.instances).toHaveLength(0);
    expect(fetch).toHaveBeenLastCalledWith(
      `${baseUrl}/storage/files`,
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
  });

  it('refreshes a rejected JWT and starts a new progress stream for the one retry', async () => {
    const { client, fetch } = await loggedIn();
    fetch.mockResolvedValueOnce(json(session(2)));
    const progress = vi.fn();
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: progress });
    const rejected = await pendingXHR();
    rejected.progress(100, 100);
    rejected.respond({ error: 'expired' }, 401);
    const renewed = await pendingXHR(1);
    expect(fetch).toHaveBeenLastCalledWith(
      `${baseUrl}/auth/refresh`,
      expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
    );
    expect(renewed.requestHeaders.get('Authorization')).toBe('Bearer jwt-2');
    expect(renewed.body).toBe(rejected.body);
    expect(progress).toHaveBeenLastCalledWith({
      loaded: 0,
      total: null,
      percentage: null,
      lengthComputable: false,
    });
    renewed.respond(storedFile);
    expect((await uploading).data).toEqual(storedFile);
  });

  it('renews an expired JWT before opening XHR', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { client, fetch } = await loggedIn();
    vi.setSystemTime(Date.now() + 3601_000);
    fetch.mockResolvedValueOnce(json(session(2)));
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: vi.fn() });
    const xhr = await pendingXHR();
    expect(fetch).toHaveBeenLastCalledWith(`${baseUrl}/auth/refresh`, expect.anything());
    expect(xhr.requestHeaders.get('Authorization')).toBe('Bearer jwt-2');
    expect(UploadXHR.instances).toHaveLength(1);
    xhr.respond(storedFile);
    expect((await uploading).error).toBeNull();
  });

  it('bounds an upload rejected again after renewal to one retry', async () => {
    const { client, fetch } = await loggedIn();
    fetch.mockResolvedValueOnce(json(session(2)));
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: vi.fn() });
    (await pendingXHR()).respond({ error: 'expired' }, 401);
    (await pendingXHR(1)).respond({ error: 'still rejected' }, 401);
    expect((await uploading).error).toMatchObject({ code: 'HTTP_ERROR', status: 401 });
    expect(UploadXHR.instances).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected upload under a newer login', async () => {
    const { client, fetch } = await loggedIn();
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: vi.fn() });
    const xhr = await pendingXHR();
    fetch.mockResolvedValueOnce(json(session(2)));
    await client.login(user.email, 'other-password');
    xhr.respond({ error: 'expired' }, 401);
    expect((await uploading).error?.code).toBe('AUTH_OPERATION_CANCELLED');
    expect(UploadXHR.instances).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('cancels XHR through AbortSignal and removes progress listeners', async () => {
    const { client } = await loggedIn();
    const controller = new AbortController();
    const progress = vi.fn();
    const uploading = client.storage.upload(new Blob(['data']), {
      onUploadProgress: progress,
      signal: controller.signal,
    });
    const xhr = await pendingXHR();
    controller.abort();
    expect((await uploading).error?.code).toBe('ABORTED');
    expect(xhr.abort).toHaveBeenCalledOnce();
    const notifications = progress.mock.calls.length;
    xhr.progress(100, 100);
    xhr.respond(storedFile);
    expect(progress).toHaveBeenCalledTimes(notifications);
  });

  it('does not start or notify an already aborted upload', async () => {
    const { client, fetch } = await loggedIn();
    const controller = new AbortController();
    controller.abort();
    const progress = vi.fn();
    expect(
      (
        await client.storage.upload(new Blob(['data']), {
          onUploadProgress: progress,
          signal: controller.signal,
        })
      ).error?.code,
    ).toBe('ABORTED');
    expect(UploadXHR.instances).toHaveLength(0);
    expect(progress).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('isolates consumer progress errors without swallowing server failure and Retry-After', async () => {
    const { client } = await loggedIn();
    const progress = vi.fn(() => {
      throw new Error('handler failure');
    });
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: progress });
    const xhr = await pendingXHR();
    xhr.progress(20, 100);
    xhr.responseHeaders += 'Retry-After: 2\r\n';
    xhr.respond({ error: 'rate limited' }, 429);
    expect((await uploading).error).toMatchObject({
      code: 'HTTP_ERROR',
      status: 429,
      message: 'rate limited',
      retryAfterMs: 2000,
    });
  });

  it.each(['network-error', 'redirect', 'invalid-json'])('rejects %s responses', async (reason) => {
    const { client } = await loggedIn();
    const uploading = client.storage.upload(new Blob(['data']), { onUploadProgress: vi.fn() });
    const xhr = await pendingXHR();
    if (reason === 'network-error') xhr.dispatchEvent(new Event('error'));
    if (reason === 'redirect') xhr.respond(storedFile, 201, `${baseUrl}/redirected`);
    if (reason === 'invalid-json') {
      xhr.responseURL = xhr.url;
      xhr.responseText = 'invalid json';
      xhr.dispatchEvent(new Event('load'));
    }
    expect((await uploading).error?.code).toBe(
      reason === 'invalid-json' ? 'INVALID_RESPONSE' : 'NETWORK_ERROR',
    );
  });

  it('requires the authenticated user session before starting upload progress', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const client = createClient(baseUrl, { persistSession: false });
    clients.push(client);
    await client.auth.ready;
    const progress = vi.fn();
    expect(
      (await client.storage.upload(new Blob(['data']), { onUploadProgress: progress })).error?.code,
    ).toBe('AUTH_REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
    expect(UploadXHR.instances).toHaveLength(0);
    expect(progress).not.toHaveBeenCalled();
  });
});
