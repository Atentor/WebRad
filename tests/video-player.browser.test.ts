import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  reusableVideoPlayerProject,
  videoPlayerProject,
  videoPlayerUserSources,
} from './fixtures/video-player';
import { videoUser } from './fixtures/video-upload';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined).each([false, true])(
  'plays real HLS/TS and DASH through Shaka in compiled Preview with private session refresh and scoped transport (reusable=%s)',
  async (reusable) => {
    const assets = new Map<string, Buffer>();
    for (const name of [
      'video.ts.bin',
      'audio.ts.bin',
      'sintel-video-init.mp4',
      'sintel-video-segment.mp4',
      'sintel-audio-init.mp4',
      'sintel-audio-segment.mp4',
    ])
      assets.set(
        name,
        await fs.readFile(new URL(`./fixtures/video-media/${name}`, import.meta.url)),
      );
    const calls: { path: string; authorization?: string; cookie?: string }[] = [];
    let expired = false;
    let renewed = false;
    let denied = false;
    let externalRequests = 0;
    let thumbnailJpeg: Buffer | null = null;
    const external = createServer((_request, response) => {
      externalRequests++;
      response.end('unexpected');
    });
    await new Promise<void>((resolve) => external.listen(0, '127.0.0.1', resolve));
    const externalAddress = external.address();
    if (!externalAddress || typeof externalAddress === 'string')
      throw new Error('No external port');
    const externalUrl = `http://127.0.0.1:${externalAddress.port}`;
    const api = createServer((request, response) => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin ?? '*');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS');
      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }
      calls.push({
        path,
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
      });
      const json = (data: unknown, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(data));
      };
      const jwt = (token: string, refresh: string) => ({
        token,
        expiresAt: '2099-01-01T00:00:00Z',
        refreshToken: `rgr_${refresh.repeat(43)}`,
        refreshExpiresAt: '2099-02-01T00:00:00Z',
        user: videoUser,
      });
      if (path.endsWith('/auth/token')) {
        json(jwt('player-jwt', 'x'));
        return;
      }
      if (path.endsWith('/auth/session')) {
        json(
          expired && !renewed ? { error: 'Expired' } : { success: true, user: videoUser },
          expired && !renewed ? 401 : 200,
        );
        return;
      }
      if (path.endsWith('/auth/refresh')) {
        renewed = true;
        json(jwt('player-renewed-jwt', 'y'));
        return;
      }
      if (path.endsWith('/auth/logout')) {
        json({ success: true });
        return;
      }
      const id = path.match(/\/videos\/([^/]+)/)?.[1];
      const isPrivate = id !== undefined && id !== 'public-video';
      if (isPrivate && !request.headers.authorization?.startsWith('Bearer player-')) {
        json({ error: 'Authentication required' }, 401);
        return;
      }
      if (id && path.endsWith('/hls')) {
        json({
          id,
          title: 'Video',
          isPublic: !isPrivate,
          masterUrl: `/videos/${id}/hls/g/master.m3u8`,
          thumbnailUrl: `/videos/${id}/thumbnail`,
          variants: [
            {
              quality: 720,
              width: 1280,
              height: 720,
              fps: 30,
              frameRate: '30/1',
              bandwidth: 500000,
              averageBandwidth: 500000,
              codecs: 'avc1.42E01E',
            },
          ],
          duration: 2,
          authentication: 'Authorization',
        });
        return;
      }
      if (path.endsWith('/thumbnail')) {
        if (isPrivate && thumbnailJpeg) {
          response.writeHead(200, { 'Content-Type': 'image/jpeg' });
          response.end(thumbnailJpeg);
          return;
        }
        json({ error: 'No thumbnail' }, 404);
        return;
      }
      if (id === 'redirect-video' && path.endsWith('/master.m3u8')) {
        response.writeHead(302, { Location: `${externalUrl}/stolen.m3u8` });
        response.end();
        return;
      }
      if (isPrivate && path.endsWith('/video.ts') && !expired) {
        expired = true;
        json({ error: 'Expired' }, 401);
        return;
      }
      if (isPrivate && denied) {
        json({ error: 'Access revoked' }, 403);
        return;
      }
      const send = (body: string | Buffer, mime: string) => {
        response.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': Buffer.byteLength(body),
          'Cache-Control': 'private, no-store',
        });
        response.end(request.method === 'HEAD' ? undefined : body);
      };
      if (path.endsWith('/master.m3u8')) {
        send(
          id === 'bad-video'
            ? `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=1280x720,CODECS="avc1.42E01E"\n${externalUrl}/foreign.m3u8\n`
            : '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=1280x720,CODECS="avc1.42E01E"\nvideo.m3u8\n',
          'application/vnd.apple.mpegurl',
        );
        return;
      }
      if (path.endsWith('/video.m3u8')) {
        send(
          '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:10,\nvideo.ts\n#EXT-X-ENDLIST\n',
          'application/vnd.apple.mpegurl',
        );
        return;
      }
      if (path.endsWith('/video.ts')) {
        send(assets.get('video.ts.bin')!, 'video/mp2t');
        return;
      }
      if (path.endsWith('/manifest.mpd')) {
        send(
          `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S" minBufferTime="PT1S"><Period duration="PT10S"><AdaptationSet mimeType="video/mp4" codecs="avc1.42c01e" width="258" height="110"><Representation id="video" bandwidth="1000000"><SegmentList timescale="1" presentationTimeOffset="40" duration="10"><Initialization sourceURL="sintel-video-init.mp4"/><SegmentURL media="sintel-video-segment.mp4"/></SegmentList></Representation></AdaptationSet><AdaptationSet mimeType="audio/mp4" codecs="mp4a.40.2"><Representation id="audio" bandwidth="128000" audioSamplingRate="48000"><SegmentList timescale="1" presentationTimeOffset="40" duration="10"><Initialization sourceURL="sintel-audio-init.mp4"/><SegmentURL media="sintel-audio-segment.mp4"/></SegmentList></Representation></AdaptationSet></Period></MPD>`,
          'application/dash+xml',
        );
        return;
      }
      const name = path.split('/').pop()!;
      if (assets.has(name)) {
        send(assets.get(name)!, 'video/mp4');
        return;
      }
      json({ error: 'Unknown path' }, 404);
    });
    let preview = '';
    const app = createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(
        request.url === '/preview'
          ? preview
          : '<!doctype html><iframe style="width:100%;height:600px;border:0" src="/preview"></iframe>',
      );
    });
    await Promise.all([
      new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve)),
    ]);
    const apiAddress = api.address();
    const appAddress = app.address();
    if (
      !apiAddress ||
      typeof apiAddress === 'string' ||
      !appAddress ||
      typeof appAddress === 'string'
    )
      throw new Error('Missing ports');
    const baseUrl = `http://127.0.0.1:${apiAddress.port}/prefix`;
    try {
      const fixture = reusable ? reusableVideoPlayerProject(baseUrl) : null;
      const project = fixture?.project ?? videoPlayerProject(baseUrl);
      const compiled = await compileProjectToMemory(project, {
        userSources: fixture?.sources ?? videoPlayerUserSources(project.pages[0]!.name, baseUrl),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      expect(compiled.files['assets/app.css']).toContain('.shaka-controls-container');
      expect(compiled.files['assets/licenses/Shaka-Player-Apache-2.0.txt']).toContain('Apache');
      preview = compiled.previewHtml!;
      await withChromium(browser!, `http://127.0.0.1:${appAddress.port}/`, async (send) => {
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (result.result as { value?: unknown })?.value;
        };
        const frame = 'document.querySelector("iframe").contentWindow';
        const root = reusable
          ? `${frame}.document.querySelector('[data-webrad-name="MediaCard"]')`
          : `${frame}.document.querySelector('[data-webrad-page-id]')`;
        const media = `${root}.querySelector('[data-webrad-video]')`;
        await expect.poll(() => evaluate(`Boolean(${root})`), { timeout: 10000 }).toBe(true);
        thumbnailJpeg = Buffer.from(
          String(
            await evaluate(`(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 8;
          canvas.getContext('2d').fillRect(0, 0, 8, 8);
          return canvas.toDataURL('image/jpeg').split(',')[1];
        })()`),
          ),
          'base64',
        );
        await evaluate(`(() => {
          const win = ${frame};
          win.revokedVideoPosters = [];
          const revoke = win.URL.revokeObjectURL.bind(win.URL);
          win.URL.revokeObjectURL = url => { win.revokedVideoPosters.push(url); revoke(url); };
        })()`);
        await send('Network.setCookie', {
          name: 'ambient-admin-cookie',
          value: 'do-not-forward',
          url: baseUrl,
        });
        const click = (action: string) =>
          evaluate(`${root}.querySelector('[data-webrad-name="Button${action}"]').click()`);
        await click('Public');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadDone ?? ${root}.dataset.loadFailure`), {
            timeout: 15000,
          })
          .toBe('public-video');
        expect(
          calls
            .filter((call) => call.path.includes('/public-video/'))
            .every((call) => !call.authorization && !call.cookie),
        ).toBe(true);
        await click('Play');
        await expect
          .poll(() => evaluate(`${media}.currentTime`), { timeout: 10000 })
          .toBeGreaterThan(0.15);
        await click('Pause');
        expect(
          Number(await evaluate(`${media}.getVideoPlaybackQuality().totalVideoFrames`)),
        ).toBeGreaterThan(0);
        expect(await evaluate(`${media}.paused`)).toBe(true);
        await click('Seek');
        expect(Number(await evaluate(`${root}.dataset.seeked`))).toBeCloseTo(0.5, 1);
        await click('Manual');
        expect(Number(await evaluate(`${root}.dataset.manual`))).toBeGreaterThan(0);
        await click('Auto');
        expect(await evaluate(`${root}.dataset.manual`)).toBe('auto');
        await click('Stop');
        expect(await evaluate(`${root}.dataset.stopped`)).toBe('0');
        await click('Private');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadFailure ?? ${root}.dataset.loadDone`), {
            timeout: 15000,
          })
          .toBe('private-video');
        expect(renewed).toBe(true);
        const privateMedia = calls.filter((call) => call.path.includes('/private-video/hls/'));
        expect(
          privateMedia.some((call) => call.authorization === 'Bearer player-renewed-jwt'),
        ).toBe(true);
        expect(
          privateMedia.every(
            (call) => call.authorization?.startsWith('Bearer player-') && !call.cookie,
          ),
        ).toBe(true);
        const privatePoster = await evaluate(`${media}.poster`);
        expect(privatePoster).toMatch(/^blob:/);
        expect(
          calls.some(
            (call) =>
              call.path.endsWith('/private-video/thumbnail') &&
              call.authorization?.startsWith('Bearer player-') &&
              !call.cookie,
          ),
        ).toBe(true);
        await click('Logout');
        await expect.poll(() => evaluate(`${media}.getAttribute('src')`)).toBeNull();
        await expect
          .poll(() =>
            evaluate(`${frame}.revokedVideoPosters.includes(${JSON.stringify(privatePoster)})`),
          )
          .toBe(true);
        await click('External');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadDone`), { timeout: 15000 })
          .toBe('external');
        expect(
          calls
            .filter((call) => call.path.includes('/direct/'))
            .every((call) => !call.authorization && !call.cookie),
        ).toBe(true);
        await click('Dash');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadDone`), { timeout: 15000 })
          .toBe('dash');
        await click('Play');
        await expect
          .poll(() => evaluate(`${media}.currentTime`), { timeout: 10000 })
          .toBeGreaterThan(0.15);
        await expect
          .poll(() => evaluate(`${media}.getVideoPlaybackQuality().totalVideoFrames`), {
            timeout: 10000,
          })
          .toBeGreaterThan(0);
        await click('End');
        await expect
          .poll(() => evaluate(`${root}.dataset.ended`), { timeout: 10000 })
          .toBe('ended');
        await click('Bad');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadFailure`), { timeout: 15000 })
          .toBeDefined();
        expect(externalRequests).toBe(0);
        await evaluate(`delete ${root}.dataset.loadFailure`);
        await click('Redirect');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadFailure`), { timeout: 15000 })
          .toBeDefined();
        expect(externalRequests).toBe(0);
        await evaluate(`delete ${root}.dataset.loadFailure`);
        await click('Private');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadDone`), { timeout: 15000 })
          .toBe('private-video');
        denied = true; // A fresh load must respect current visibility/access policy.
        await evaluate(`delete ${root}.dataset.loadFailure`);
        await click('Private');
        await expect
          .poll(() => evaluate(`${root}.dataset.loadFailure`), { timeout: 15000 })
          .toBeDefined();
        expect(await evaluate(`${media}.getAttribute('src')`)).toBeNull();
        await click('Dispose');
        expect(await evaluate(`${root}.dataset.disposed`)).toBe('disposed');
        if (reusable) {
          const second = `${frame}.document.querySelectorAll('[data-webrad-name="MediaCard"]')[1]`;
          expect(await evaluate(`${second}.dataset.loaded`)).toBeUndefined();
          await evaluate(`${second}.querySelector('[data-webrad-name="ButtonPublic"]').click()`);
          await expect
            .poll(() => evaluate(`${second}.dataset.loadDone`), { timeout: 15000 })
            .toBe('public-video');
          expect(await evaluate(`${root}.dataset.disposed`)).toBe('disposed');
        }
      });
    } finally {
      await Promise.all(
        [api, app, external].map(
          (server) =>
            new Promise<void>((resolve) => {
              server.closeAllConnections();
              server.close(() => resolve());
            }),
        ),
      );
    }
  },
  90000,
);
