import { afterEach, expect, it, vi } from 'vitest';
import { createClient, type RestGoClient } from '../src/index';
import { videoUser } from '../../../tests/fixtures/video-upload';
const clients: RestGoClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
});
it('validates actual media destinations before fetching and omits cookies with redirect rejection', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).endsWith('/auth/token')
      ? new Response(
          JSON.stringify({ token: 'media-jwt', expiresAt: '2099-01-01', user: videoUser }),
        )
      : new Response('media'),
  );
  const client = createClient('https://api.test/proxy/restgo', { fetch, persistSession: false });
  clients.push(client);
  await client.login('video@example.test', 'password');
  const before = fetch.mock.calls.length;
  for (const uri of [
    'https://outside.test/videos/id/hls/g/master.m3u8',
    'https://api.test/videos/id/hls/g/master.m3u8',
    'https://api.test/proxy/restgo/videos/other/hls/g/master.m3u8',
    'https://api.test/proxy/restgo/videos/id/hls/g/master.m3u8?token=secret',
  ])
    expect((await client.videos.getMedia('id', uri)).error?.code).toBe('INVALID_ARGUMENT');
  expect(fetch.mock.calls.length).toBe(before);
  expect(
    (
      await client.videos.getMedia(
        'id',
        'https://api.test/proxy/restgo/videos/id/hls/g/master.m3u8',
      )
    ).error,
  ).toBeNull();
  expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  expect(new Headers(fetch.mock.calls.at(-1)?.[1]?.headers).get('Authorization')).toBe(
    'Bearer media-jwt',
  );
});
