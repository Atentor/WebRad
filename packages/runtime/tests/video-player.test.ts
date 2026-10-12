// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadVideoShaka, type VideoShakaLibrary } from '../src/video-player-shaka.js';
import { configureRestGo, getRestGoClient, WebVideoPlayer } from '../src/index.js';
import { RestGoError } from '@webrad/restgo-sdk';
import { videoUser } from '../../../tests/fixtures/video-upload';
vi.mock('../src/video-player-shaka.js', () => ({
  loadVideoShaka: vi.fn(),
  protectVideoRequest: vi.fn(),
}));

const players: FakePlayer[] = [];
const overlays: FakeOverlay[] = [];
class FakePlayer extends EventTarget {
  tracks = [
    {
      id: 1,
      active: true,
      width: 720,
      height: 1280,
      codecs: 'avc1',
      videoCodec: 'avc1',
      bandwidth: 500000,
    },
    {
      id: 2,
      active: false,
      width: 1080,
      height: 1920,
      codecs: 'avc1',
      videoCodec: 'avc1',
      bandwidth: 900000,
    },
  ];
  video: HTMLVideoElement | null = null;
  attach = vi.fn(async (video: HTMLVideoElement) => {
    this.video = video;
  });
  load = vi.fn(async () => {
    if (this.video)
      Object.defineProperty(this.video, 'duration', { configurable: true, value: 10 });
  });
  configure = vi.fn(() => true);
  destroy = vi.fn(async () => undefined);
  unload = vi.fn(async () => undefined);
  getVariantTracks = () => this.tracks;
  getConfiguration = () => ({ abr: { enabled: true } });
  selectVariantTrack = vi.fn((track: { id: number }) => {
    this.tracks.forEach((candidate) => {
      candidate.active = candidate.id === track.id;
    });
  });
  getLoadMode = () => 2;
  engine = { registerRequestFilter: vi.fn(), clearAllRequestFilters: vi.fn() };
  getNetworkingEngine = () => this.engine;
  constructor() {
    super();
    players.push(this);
  }
}
class FakeOverlay {
  getControls = () => null;
  configure = vi.fn();
  setEnabled = vi.fn();
  destroy = vi.fn(async () => {
    await this.player.destroy();
  });
  constructor(readonly player: FakePlayer) {
    overlays.push(this);
  }
}
const configuration = {
  enabled: true,
  baseUrl: 'https://api.test/prefix',
  apiVersion: 1,
  defaultDatabase: '',
  persistSession: false,
  sessionStorage: 'memory' as const,
  storageKey: 'video-player',
};
beforeEach(() => {
  vi.mocked(loadVideoShaka).mockResolvedValue({
    Player: Object.assign(FakePlayer, {
      isBrowserSupported: () => true,
      LoadMode: { SRC_EQUALS: 3 },
    }),
    ui: { Overlay: FakeOverlay },
  } as unknown as VideoShakaLibrary);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLVideoElement,
  ) {
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLVideoElement,
  ) {
    this.dispatchEvent(new Event('play'));
  });
  configureRestGo(configuration);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  configureRestGo({ ...configuration, enabled: false });
  players.splice(0);
  overlays.splice(0);
  vi.restoreAllMocks();
});
function instance() {
  const element = document.createElement('div');
  element.dataset.webradName = 'VideoPlayer1';
  document.body.append(element);
  return new WebVideoPlayer(element);
}
it('rejects native private playback before attaching a media URL', async () => {
  const video = instance();
  const client = getRestGoClient();
  vi.stubGlobal('ManagedMediaSource', undefined);
  vi.stubGlobal('MediaSource', undefined);
  vi.spyOn(client, 'onAuthStateChange').mockReturnValue({ unsubscribe: vi.fn() });
  vi.spyOn(client, 'getSession').mockResolvedValue({
    data: { token: 'jwt', expiresAt: '2099-01-01', user: videoUser },
    error: null,
  });
  vi.spyOn(client.videos, 'getHls').mockResolvedValue({
    data: {
      id: 'private-video',
      title: '',
      isPublic: false,
      masterUrl: '/videos/private-video/hls/g/master.m3u8',
      thumbnailUrl: '/videos/private-video/thumbnail',
      masterAbsoluteUrl: `${configuration.baseUrl}/videos/private-video/hls/g/master.m3u8`,
      thumbnailAbsoluteUrl: '',
      variants: [],
      duration: 10,
      authentication: '',
    },
    error: null,
  });
  vi.spyOn(client.videos, 'getThumbnail').mockResolvedValue({
    data: null,
    error: new RestGoError('No thumbnail', 'HTTP_ERROR', 404),
  });
  await expect(video.LoadRestGo('private-video', { public: false })).rejects.toThrow(
    'requires MediaSource',
  );
  expect(players).toHaveLength(0);
  expect(video.element.querySelector('video')?.getAttribute('src')).toBeNull();
  video.dispose();
});
it('binds a restored private session to its server-confirmed owner before media loading', async () => {
  const video = instance();
  const client = getRestGoClient();
  const session = { token: 'restored-jwt', expiresAt: '2099-01-01', user: videoUser };
  vi.stubGlobal('MediaSource', { isTypeSupported: () => true });
  vi.spyOn(client, 'CurrentUser', 'get').mockReturnValue(null);
  vi.spyOn(client, 'getSession').mockResolvedValue({ data: session, error: null });
  vi.spyOn(client, 'onAuthStateChange').mockImplementation((callback) => {
    queueMicrotask(() => callback('INITIAL_SESSION', session));
    return { unsubscribe: vi.fn() };
  });
  vi.spyOn(client.videos, 'getHls').mockResolvedValue({
    data: {
      id: 'private-video',
      title: '',
      isPublic: false,
      masterUrl: '/videos/private-video/hls/g/master.m3u8',
      thumbnailUrl: '/videos/private-video/thumbnail',
      masterAbsoluteUrl: `${configuration.baseUrl}/videos/private-video/hls/g/master.m3u8`,
      thumbnailAbsoluteUrl: '',
      variants: [],
      duration: 10,
      authentication: '',
    },
    error: null,
  });
  vi.spyOn(client.videos, 'getThumbnail').mockResolvedValue({
    data: null,
    error: new RestGoError('No thumbnail', 'HTTP_ERROR', 404),
  });
  await video.LoadRestGo('private-video', { public: false });
  expect(client.getSession).toHaveBeenCalledOnce();
  expect(video.state).toBe('loaded');
  expect(players[0]!.engine.registerRequestFilter).toHaveBeenCalledOnce();
  video.dispose();
});
it('rejects a stale pending load and lets only the latest source attach', async () => {
  const library = await loadVideoShaka();
  let release!: (library: VideoShakaLibrary) => void;
  vi.mocked(loadVideoShaka).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const video = instance();
  const loaded = vi.fn();
  video.onLoaded = loaded;
  const first = video.LoadUrl('https://cdn.test/first.m3u8');
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  const second = video.LoadUrl('https://cdn.test/second.m3u8');
  release(library);
  await rejected;
  await second;
  expect(players).toHaveLength(1);
  expect(loaded).toHaveBeenCalledOnce();
  expect(video.source).toMatchObject({ url: 'https://cdn.test/second.m3u8' });
  video.dispose();
});
it('shares one typed instance between mounting and generated code and exposes real controls/events/quality', async () => {
  const video = instance();
  expect(new WebVideoPlayer(video.element)).toBe(video);
  video.muted = true;
  video.loop = true;
  video.volume = 0.5;
  video.playbackRate = 1.5;
  const loaded = vi.fn();
  const played = vi.fn();
  const paused = vi.fn();
  video.onLoaded = loaded;
  video.onPlay = played;
  video.onPause = paused;
  await video.LoadUrl('https://cdn.test/master.m3u8');
  expect(loaded).toHaveBeenCalledOnce();
  expect(video.duration).toBe(10);
  expect(video.availableQualities.map((item) => item.quality)).toEqual([720, 1080]);
  video.SetQuality(1080);
  expect(video.currentQuality).toBe(1080);
  expect(players[0]!.configure).toHaveBeenCalledWith({ abr: { enabled: false } });
  video.SetQuality('auto');
  expect(players[0]!.configure).toHaveBeenCalledWith({ abr: { enabled: true } });
  expect(() => video.SetQuality(1440)).toThrow('unavailable');
  await video.Play();
  expect(played).toHaveBeenCalledOnce();
  video.Seek(5);
  expect(video.currentTime).toBe(5);
  video.Stop();
  expect(video.currentTime).toBe(0);
  expect(paused).toHaveBeenCalledOnce();
  video.controls = false;
  expect(overlays[0]!.setEnabled).toHaveBeenLastCalledWith(false);
  await video.Unload();
  expect(players[0]!.destroy).toHaveBeenCalledOnce();
  expect(video.state).toBe('idle');
  video.dispose();
});
it('preserves a loaded source when autoplay is rejected and validates the public API', async () => {
  const video = instance();
  video.autoplay = true;
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
    new DOMException('Autoplay blocked', 'NotAllowedError'),
  );
  await expect(video.LoadUrl('https://cdn.test/master.m3u8')).rejects.toThrow('Autoplay blocked');
  expect(players[0]!.destroy).not.toHaveBeenCalled();
  expect(() => {
    video.volume = 2;
  }).toThrow(RangeError);
  expect(() => {
    video.playbackRate = 0;
  }).toThrow(RangeError);
  expect(() => video.Seek(-1)).toThrow(RangeError);
  await expect(video.LoadUrl('https://youtube.com/watch?v=test')).rejects.toThrow('manifest');
  video.dispose();
});
it('replaces sources without stale events and destroys each overlay/player once', async () => {
  const video = instance();
  await video.LoadUrl('https://cdn.test/one.m3u8');
  const first = players[0]!;
  const loaded = vi.fn();
  video.onLoaded = loaded;
  await video.LoadUrl('https://cdn.test/two.m3u8');
  expect(first.destroy).toHaveBeenCalledOnce();
  expect(loaded).toHaveBeenCalledOnce();
  const quality = vi.fn();
  video.onQualityChange = quality;
  first.dispatchEvent(new Event('adaptation'));
  expect(quality).not.toHaveBeenCalled();
  await video.Unload();
  video.dispose();
  video.dispose();
  expect(players.every((player) => player.destroy.mock.calls.length === 1)).toBe(true);
});
it('uses anonymous public descriptors and treats missing thumbnails as optional', async () => {
  const video = instance();
  const client = getRestGoClient();
  vi.spyOn(client.videos, 'getHls').mockResolvedValue({
    data: {
      id: 'public-video',
      title: '',
      isPublic: true,
      masterUrl: '/videos/public-video/hls/g/master.m3u8',
      thumbnailUrl: '/videos/public-video/thumbnail',
      masterAbsoluteUrl: `${configuration.baseUrl}/videos/public-video/hls/g/master.m3u8`,
      thumbnailAbsoluteUrl: '',
      variants: [],
      duration: 10,
      authentication: '',
    },
    error: null,
  });
  vi.spyOn(client.videos, 'getThumbnail').mockResolvedValue({
    data: null,
    error: Object.assign(new Error('Not found'), { status: 404 }),
  } as Awaited<ReturnType<typeof client.videos.getThumbnail>>);
  await video.LoadRestGo('public-video');
  expect(client.videos.getHls).toHaveBeenCalledWith(
    'public-video',
    expect.objectContaining({ public: true }),
  );
  expect(players[0]!.engine.registerRequestFilter).not.toHaveBeenCalled();
  video.dispose();
});
