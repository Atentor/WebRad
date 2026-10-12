import { afterEach, expect, it, vi } from 'vitest';
import { createClient, type RestGoClient, type RestGoVideoResumeToken } from '../src/index';
import { videoBackend } from '../../../tests/fixtures/video-upload';

const clients: RestGoClient[] = [];
const file = () => new File(['0123456789abcdef'], 'aula.webm', { lastModified: 123 });
async function setup(options: Parameters<typeof videoBackend>[0] = {}) {
  const backend = videoBackend(options);
  const fetch = vi.fn<typeof globalThis.fetch>(backend.fetcher);
  const client = createClient('https://restgo.example.test/proxy/restgo', {
    fetch,
    persistSession: false,
  });
  clients.push(client);
  expect((await client.login('video@example.test', 'secret')).sucess).toBe(true);
  return { ...backend, fetch, client };
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.restoreAllMocks();
});
it('rejects expired, foreign and cancelled checkpoints, and bounds processing polling', async () => {
  const { client, uploads, calls, fetch } = await setup();
  let checkpoint: RestGoVideoResumeToken | undefined;
  const abort = new AbortController();
  await client.videos.upload(file(), {
    signal: abort.signal,
    onResumeToken: (token) => {
      checkpoint = token;
    },
    onProgress: (detail) => {
      if (detail.confirmedBytes === 7) abort.abort();
    },
  });
  expect(checkpoint).toBeDefined();
  const options = { resumeToken: checkpoint! };
  const before = calls.length;
  expect(
    (
      await client.videos.resumeUpload(checkpoint!.uploadId, file(), {
        resumeToken: { ...checkpoint!, ownerId: 'other-owner' },
      })
    ).error?.code,
  ).toBe('INVALID_ARGUMENT');
  expect(calls.length).toBe(before);
  uploads.get('upload-1')!.session.expiresAt = '2000-01-01T00:00:00Z';
  expect((await client.videos.resumeUpload('upload-1', file(), options)).error?.status).toBe(410);
  uploads.get('upload-1')!.session.expiresAt = '2099-01-01T00:00:00Z';
  expect((await client.videos.uploads.cancel('upload-1')).data?.status).toBe('deleting');
  expect((await client.videos.resumeUpload('upload-1', file(), options)).error?.message).toContain(
    'cancelled',
  );
  const pending = JSON.stringify({ video: uploads.get('upload-1')!.video, jobs: [] });
  fetch.mockImplementation(async () => new Response(pending));
  expect(
    (await client.videos.waitUntilReady('video-1', { intervalMs: 5, timeoutMs: 20 })).error
      ?.message,
  ).toContain('timed out');
  expect(
    calls.filter((call) => call.path === '/videos/uploads' && call.method === 'POST'),
  ).toHaveLength(1);
});
it('does not retry insufficient storage (507)', async () => {
  const { client, calls } = await setup({ failureCode: 507 });
  expect((await client.videos.upload(file())).error?.status).toBe(507);
  expect(calls.filter((call) => call.path.endsWith('/chunks'))).toHaveLength(1);
});

it('uses the actual binary PUT/chunks contract, server chunk cap, checksum, JWT and confirmed progress', async () => {
  const { client, calls, uploads } = await setup();
  const progress = vi.fn();
  const result = await client.videos.upload(file(), {
    title: 'Aula',
    descri: 'Introdução',
    chunkSizeBytes: 64,
    onProgress: progress,
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({
    id: 'video-1',
    status: 'pending',
    title: 'Aula',
    descri: 'Introdução',
    isPublic: false,
  });
  expect(uploads.get('upload-1')?.content.toString()).toBe('0123456789abcdef');
  const chunks = calls.filter((entry) => entry.path.endsWith('/chunks'));
  expect(chunks.map((entry) => entry.headers.get('Upload-Offset'))).toEqual(['0', '7', '14']);
  expect(
    chunks.every(
      (entry) =>
        entry.method === 'PUT' &&
        entry.headers.get('Content-Type') === 'application/octet-stream' &&
        entry.headers.get('Authorization') === 'Bearer video-jwt',
    ),
  ).toBe(true);
  expect(
    progress.mock.calls
      .filter(([detail]) => detail.chunk === null)
      .map(([detail]) => detail.confirmedBytes),
  ).toEqual([0, 7, 14, 16, 16]);
  const hls = await client.videos.getHls('video-1');
  expect(hls.data?.masterAbsoluteUrl).toBe(
    'https://restgo.example.test/proxy/restgo/videos/video-1/hls/generation-1/master.m3u8',
  );
  expect((await client.videos.waitUntilReady('video-1')).data?.status).toBe('ready');
});
it('reconciles a committed chunk conflict and a lost completion without duplicating the upload', async () => {
  const { client, calls, uploads } = await setup({
    conflictAfterFirstChunk: true,
    lostComplete: true,
  });
  expect((await client.videos.upload(file())).error).toBeNull();
  expect(uploads.size).toBe(1);
  expect(
    calls.filter((entry) => entry.path === '/videos/uploads' && entry.method === 'POST'),
  ).toHaveLength(1);
  expect(
    calls
      .filter((entry) => entry.path.endsWith('/chunks'))
      .map((entry) => entry.headers.get('Upload-Offset')),
  ).toEqual(['0', '7', '14']);
  expect(uploads.get('upload-1')?.content.toString()).toBe('0123456789abcdef');
});
it('never retries uncertain creation and does not retry permanent quota/size failures', async () => {
  const first = await setup({ lostCreation: true });
  expect((await first.client.videos.upload(file())).error?.code).toBe('NETWORK_ERROR');
  expect(first.uploads.size).toBe(1);
  expect(first.calls.filter((entry) => entry.path === '/videos/uploads')).toHaveLength(1);
  const second = await setup({ failureCode: 413 });
  expect((await second.client.videos.upload(file())).error?.status).toBe(413);
  expect(second.calls.filter((entry) => entry.path.endsWith('/chunks'))).toHaveLength(1);
});
it('pauses locally and verifies all file content on resume, including same name/size/date substitutions', async () => {
  const { client, uploads, calls } = await setup();
  let token: RestGoVideoResumeToken | null = null;
  const controller = new AbortController();
  const result = await client.videos.upload(file(), {
    signal: controller.signal,
    onResumeToken: (value) => {
      token = value;
    },
    onProgress: (detail) => {
      if (detail.confirmedBytes === 7) controller.abort();
    },
  });
  expect(result.error?.code).toBe('ABORTED');
  expect(uploads.get('upload-1')?.session.offset).toBe(7);
  expect(calls.some((entry) => entry.method === 'DELETE')).toBe(false);
  const checkpoint = token! as RestGoVideoResumeToken;
  const changed = new File(['different-content'], 'aula.webm', { lastModified: 123 });
  const sameSize = new File(['X123456789abcdef'], 'aula.webm', { lastModified: 123 });
  expect(
    (await client.videos.resumeUpload(checkpoint.uploadId, changed, { resumeToken: checkpoint }))
      .error?.code,
  ).toBe('INVALID_ARGUMENT');
  expect(
    (await client.videos.resumeUpload(checkpoint.uploadId, sameSize, { resumeToken: checkpoint }))
      .error?.message,
  ).toContain('content differs');
  expect(
    (await client.videos.resumeUpload(checkpoint.uploadId, file(), { resumeToken: checkpoint }))
      .error,
  ).toBeNull();
  expect(uploads.size).toBe(1);
  expect(uploads.get('upload-1')?.content.toString()).toBe('0123456789abcdef');
});
it('reconciles after a chunk 401 using the shared renewed JWT, with no blind write replay', async () => {
  const { client, fetch, calls, fetcher } = await setup();
  let once = true;
  fetch.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/chunks') && once) {
      once = false;
      return new Response('{"error":"expired"}', { status: 401 });
    }
    if (
      String(url).endsWith('/auth/session') &&
      new Headers(options?.headers).get('Authorization') === 'Bearer video-jwt'
    )
      return new Response('{"error":"expired"}', { status: 401 });
    return fetcher(url, options);
  });
  expect((await client.videos.upload(file())).error).toBeNull();
  const renewal = calls.findIndex((call) => call.path === '/auth/refresh');
  expect(renewal).toBeGreaterThan(-1);
  expect(calls[renewal + 1]?.path).toBe('/videos/uploads/upload-1');
  expect(calls.find((call) => call.path.endsWith('/chunks'))?.headers.get('Authorization')).toBe(
    'Bearer video-renewed-jwt',
  );
});
it('rejects malformed offsets, unsafe response values and external HLS URLs', async () => {
  const { client, fetch } = await setup();
  expect(
    (
      await client.videos.uploads.sendChunk('upload-1', new Blob(['x']), {
        offset: -1,
        checksum: 'f'.repeat(64),
      })
    ).error?.code,
  ).toBe('INVALID_ARGUMENT');
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        id: 'u',
        videoId: 'v',
        offset: 4,
        sizeBytes: 2,
        state: 'open',
        expiresAt: '2099-01-01',
        maxChunkBytes: 7,
      }),
    ),
  );
  expect((await client.videos.uploads.get('u')).error?.code).toBe('INVALID_RESPONSE');
  fetch.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        id: 'v',
        title: '',
        isPublic: true,
        masterUrl: 'https://evil.test/videos/v/master.m3u8',
        thumbnailUrl: '/videos/v/thumbnail',
        variants: [],
        duration: 1,
        authentication: '',
      }),
    ),
  );
  expect((await client.videos.getHls('v', { public: true })).error?.code).toBe('INVALID_RESPONSE');
});
