import type { RestGoVideoHlsDescriptor } from '@webrad/restgo-sdk';
import { WebComponent, type WebComponentEventHandler } from './component.js';
import { setRuntimeLayoutAspectRatio } from './layout.js';
import { getRestGoClient } from './restgo.js';
import {
  loadVideoShaka,
  protectVideoRequest,
  type VideoMediaContext,
  type VideoShakaLibrary,
  type VideoShakaOverlay,
  type VideoShakaPlayer,
  type VideoShakaTrack,
} from './video-player-shaka.js';
import {
  normalizeVideoPlayerSource,
  type WebVideoPlayerAspectRatio,
  type WebVideoPlayerAvailableQuality,
  type WebVideoPlayerBufferedRange,
  type WebVideoPlayerBufferingEventDetail,
  type WebVideoPlayerLoadedEventDetail,
  type WebVideoPlayerLoadOptions,
  type WebVideoPlayerObjectFit,
  type WebVideoPlayerQuality,
  type WebVideoPlayerQualityEventDetail,
  type WebVideoPlayerRestGoOptions,
  type WebVideoPlayerSource,
  type WebVideoPlayerState,
  type WebVideoPlayerTimeEventDetail,
  type WebVideoPlayerUrlOptions,
} from './video-player-types.js';
export type {
  WebVideoPlayerAspectRatio,
  WebVideoPlayerAvailableQuality,
  WebVideoPlayerBufferedRange,
  WebVideoPlayerBufferingEventDetail,
  WebVideoPlayerLoadedEventDetail,
  WebVideoPlayerLoadOptions,
  WebVideoPlayerObjectFit,
  WebVideoPlayerQuality,
  WebVideoPlayerQualityEventDetail,
  WebVideoPlayerRestGoOptions,
  WebVideoPlayerSource,
  WebVideoPlayerState,
  WebVideoPlayerTimeEventDetail,
  WebVideoPlayerUrlOptions,
} from './video-player-types.js';

interface VideoPlayerResources {
  player: VideoShakaPlayer;
  overlay: VideoShakaOverlay;
  library: VideoShakaLibrary;
  listeners: (() => void)[];
  closed: boolean;
}
const instances = new WeakMap<HTMLElement, WebVideoPlayer>();
function mediaError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value instanceof DOMException) {
    const error = new Error(value.message);
    error.name = value.name;
    return error;
  }
  if (typeof value === 'object' && value !== null && 'code' in value)
    return new Error(`Video playback failed (Shaka ${String(value.code)}).`);
  return new Error(String(value));
}
function positive(value: number, label: string, allowZero = false): number {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0))
    throw new RangeError(`${label} must be ${allowZero ? 'nonnegative' : 'positive'} and finite.`);
  return value;
}

/** One real Shaka player per component element, shared by mounting and generated instances. */
export class WebVideoPlayer extends WebComponent {
  readonly #video!: HTMLVideoElement;
  #source: WebVideoPlayerSource | null = null;
  #state: WebVideoPlayerState = 'idle';
  #error: Error | null = null;
  #resources: VideoPlayerResources | null = null;
  #controller: AbortController | null = null;
  #unsubscribe: (() => void) | null = null;
  #cleanup: Promise<void> = Promise.resolve();
  #generation = 0;
  #disposed = false;
  #controls = true;
  #autoplay = false;
  #quality: WebVideoPlayerQuality = 'auto';
  #aspectRatio: WebVideoPlayerAspectRatio = 'none';
  #descriptor: RestGoVideoHlsDescriptor | null = null;
  #posterUrl: string | null = null;
  #authPoster = '';
  #buffering = false;
  #lastQualityEvent = '';
  readonly #nativeListeners: (() => void)[] = [];
  public constructor(element: HTMLElement) {
    super(element);
    const existing = instances.get(element);
    if (existing) return existing;
    instances.set(element, this);
    this.#video = element.ownerDocument.createElement('video');
    this.#video.dataset.webradVideo = '';
    this.#video.style.width = '100%';
    this.#video.style.height = '100%';
    this.#video.style.position = 'absolute';
    this.#video.style.inset = '0';
    this.#video.style.objectFit = 'inherit';
    this.#video.style.objectPosition = 'inherit';
    this.#video.playsInline = true;
    this.#video.preload = 'metadata';
    this.#video.setAttribute('aria-label', element.dataset.webradName ?? 'Video');
    element.append(this.#video);
    for (const [native, event, state] of [
      ['play', 'OnPlay', 'playing'],
      ['pause', 'OnPause', 'paused'],
      ['ended', 'OnEnded', 'ended'],
    ] as const) {
      const listener = (): void => {
        if (!this.#resources || this.#state === 'loading' || this.#disposed) return;
        this.#state = state;
        this.emit(event, this.#timeDetail());
      };
      this.#video.addEventListener(native, listener);
      this.#nativeListeners.push(() => this.#video.removeEventListener(native, listener));
    }
    const timeUpdate = (): void => {
      if (this.#resources && !this.#disposed && this.#state !== 'loading')
        this.emit('OnTimeUpdate', this.#timeDetail());
    };
    this.#video.addEventListener('timeupdate', timeUpdate);
    this.#nativeListeners.push(() => this.#video.removeEventListener('timeupdate', timeUpdate));
  }
  public get source(): WebVideoPlayerSource | null {
    return this.#source;
  }
  public set source(value: WebVideoPlayerSource | null) {
    const source = normalizeVideoPlayerSource(value);
    this.#source = source;
    const generation = this.#generation;
    queueMicrotask(() => {
      if (
        this.#disposed ||
        generation !== this.#generation ||
        source !== this.#source ||
        !this.element.isConnected
      )
        return;
      const loading =
        source === null
          ? this.Unload()
          : source.kind === 'restgo'
            ? this.LoadRestGo(source.videoId)
            : this.LoadUrl(source.url, { format: source.format });
      void loading.catch(() => undefined);
    });
  }
  public get controls(): boolean {
    return this.#controls;
  }
  public set controls(value: boolean) {
    this.#controls = value;
    this.#resources?.overlay.setEnabled(value && this.enabled);
  }
  public get autoplay(): boolean {
    return this.#autoplay;
  }
  public set autoplay(value: boolean) {
    this.#autoplay = value;
  }
  public get muted(): boolean {
    return this.#video.muted;
  }
  public set muted(value: boolean) {
    this.#video.muted = value;
  }
  public get loop(): boolean {
    return this.#video.loop;
  }
  public set loop(value: boolean) {
    this.#video.loop = value;
  }
  public get playsInline(): boolean {
    return this.#video.playsInline;
  }
  public set playsInline(value: boolean) {
    this.#video.playsInline = value;
  }
  public get volume(): number {
    return this.#video.volume;
  }
  public set volume(value: number) {
    positive(value, 'volume', true);
    if (value > 1) throw new RangeError('volume must be between 0 and 1.');
    this.#video.volume = value;
  }
  public get playbackRate(): number {
    return this.#video.playbackRate;
  }
  public set playbackRate(value: number) {
    this.#video.playbackRate = positive(value, 'playbackRate');
  }
  public get objectFit(): WebVideoPlayerObjectFit {
    return (getComputedStyle(this.element).objectFit || 'contain') as WebVideoPlayerObjectFit;
  }
  public set objectFit(value: WebVideoPlayerObjectFit) {
    if (!['contain', 'cover', 'fill', 'none', 'scale-down'].includes(value))
      throw new TypeError('Invalid video objectFit.');
    this.element.style.objectFit = value;
  }
  /** Fixed ratios derive height from the responsive width, overriding vertical sizing rules. */
  public get aspectRatio(): WebVideoPlayerAspectRatio {
    return this.#aspectRatio;
  }
  public set aspectRatio(value: WebVideoPlayerAspectRatio) {
    if (!['none', '16:9', '9:16'].includes(value))
      throw new TypeError('Invalid video aspectRatio.');
    this.#aspectRatio = value;
    setRuntimeLayoutAspectRatio(this.element, value);
  }
  public get poster(): string {
    return this.#authPoster;
  }
  public set poster(value: string) {
    if (value) {
      const url = new URL(value, document.baseURI);
      if (!['http:', 'https:', 'data:'].includes(url.protocol))
        throw new TypeError('Invalid poster URL.');
    }
    this.#authPoster = value;
    if (!this.#posterUrl) this.#video.poster = value;
  }
  public override get enabled(): boolean {
    return super.enabled;
  }
  public override set enabled(value: boolean) {
    super.enabled = value;
    this.#resources?.overlay.setEnabled(value && this.controls);
  }
  public get quality(): WebVideoPlayerQuality {
    return this.#quality;
  }
  public set quality(value: WebVideoPlayerQuality) {
    if (value !== 'auto') positive(value, 'quality');
    if (this.#resources && this.#state !== 'loading') this.SetQuality(value);
    else this.#quality = value;
  }
  public get state(): WebVideoPlayerState {
    return this.#state;
  }
  public get duration(): number {
    return Number.isFinite(this.#video.duration) ? this.#video.duration : 0;
  }
  public get currentTime(): number {
    return this.#video.currentTime;
  }
  public get buffered(): readonly WebVideoPlayerBufferedRange[] {
    return Array.from({ length: this.#video.buffered.length }, (_, i) =>
      Object.freeze({ start: this.#video.buffered.start(i), end: this.#video.buffered.end(i) }),
    );
  }
  public get availableQualities(): readonly WebVideoPlayerAvailableQuality[] {
    const qualities = new Map<number, WebVideoPlayerAvailableQuality>();
    for (const track of this.#resources?.player.getVariantTracks() ?? []) {
      const quality = this.#trackQuality(track);
      if (quality === null || !track.width || !track.height) continue;
      qualities.set(
        quality,
        Object.freeze({
          quality,
          width: track.width,
          height: track.height,
          codecs: track.codecs ?? track.videoCodec ?? '',
        }),
      );
    }
    return [...qualities.values()].sort((a, b) => a.quality - b.quality);
  }
  public get currentQuality(): number | null {
    const track = this.#resources?.player.getVariantTracks().find((candidate) => candidate.active);
    return track ? this.#trackQuality(track) : null;
  }
  public get isPlaying(): boolean {
    return !this.#video.paused && !this.#video.ended;
  }
  public get error(): Error | null {
    return this.#error;
  }
  public async LoadRestGo(
    videoId: string,
    options: WebVideoPlayerRestGoOptions = {},
  ): Promise<void> {
    const source = normalizeVideoPlayerSource({ kind: 'restgo', videoId });
    if (!source) throw new TypeError('Video ID is required.');
    await this.#load(source, options, async (signal) => {
      const client = getRestGoClient();
      let descriptor = await client.videos.getHls(videoId, {
        signal,
        public: options.public ?? true,
      });
      if (
        options.public === undefined &&
        descriptor.error &&
        [401, 403].includes(descriptor.error.status)
      )
        descriptor = await client.videos.getHls(videoId, { signal });
      if (descriptor.error) throw descriptor.error;
      if (signal.aborted) throw new DOMException('Video load aborted.', 'AbortError');
      let ownerId = '';
      if (!descriptor.data.isPublic) {
        const identity = await client.getSession();
        if (identity.error) throw identity.error;
        if (!identity.data) throw new Error('Sign in before loading a private RestGo video.');
        ownerId = identity.data.user.id;
        if (signal.aborted) throw new DOMException('Video load aborted.', 'AbortError');
      }
      this.#descriptor = descriptor.data;
      const context: VideoMediaContext | null = descriptor.data.isPublic
        ? null
        : {
            client,
            videoId,
            ownerId,
            signal,
          };
      if (context)
        this.#unsubscribe = client.onAuthStateChange((_event, session) => {
          if (signal.aborted || session?.user.id === context.ownerId) return;
          const generation = this.#generation + 1;
          void this.Unload().then(() => {
            if (!this.#disposed && generation === this.#generation)
              this.#report(
                new Error('Private video playback ended because the user session changed.'),
              );
          });
        }).unsubscribe;
      const thumbnail = await client.videos.getThumbnail(videoId, {
        signal,
        public: descriptor.data.isPublic,
      });
      if (!signal.aborted && !thumbnail.error) {
        this.#posterUrl = URL.createObjectURL(thumbnail.data);
        this.#video.poster = this.#posterUrl;
      } else if (thumbnail.error && thumbnail.error.status !== 404) throw thumbnail.error;
      return { uri: descriptor.data.masterAbsoluteUrl, mime: 'application/x-mpegURL', context };
    });
  }
  public async LoadUrl(url: string, options: WebVideoPlayerUrlOptions = {}): Promise<void> {
    const format = options.format ?? (new URL(url).pathname.endsWith('.mpd') ? 'dash' : 'hls');
    const source = normalizeVideoPlayerSource({ kind: 'url', url, format });
    if (!source) throw new TypeError('Manifest URL is required.');
    await this.#load(source, options, async () => ({
      uri: source.kind === 'url' ? source.url : url,
      mime: format === 'dash' ? 'application/dash+xml' : 'application/x-mpegURL',
      context: null,
    }));
  }
  public async Play(): Promise<void> {
    if (this.#disposed || !this.#resources || this.#state === 'loading' || !this.enabled)
      throw new Error('Load and enable a video before playing.');
    await this.#video.play();
  }
  public Pause(): void {
    this.#video.pause();
  }
  public Stop(): void {
    this.Pause();
    this.Seek(0);
  }
  public Seek(seconds: number): void {
    positive(seconds, 'Seek time', true);
    if (!this.#resources || this.#state === 'loading')
      throw new Error('Load a video before seeking.');
    if (seconds > this.duration) throw new RangeError('Seek time exceeds the video duration.');
    this.#video.currentTime = seconds;
  }
  public SetQuality(value: WebVideoPlayerQuality): void {
    if (!this.#resources) {
      if (value !== 'auto') throw new Error('Load a video before choosing a quality.');
      this.#quality = value;
      return;
    }
    const player = this.#resources.player;
    if (value === 'auto') {
      this.#quality = value;
      player.configure({ abr: { enabled: true } });
    } else {
      const track = player
        .getVariantTracks()
        .find((candidate) => this.#trackQuality(candidate) === value);
      if (!track) throw new RangeError('The requested quality is unavailable for this video.');
      this.#quality = value;
      player.configure({ abr: { enabled: false } });
      player.selectVariantTrack(track, true);
    }
    this.#quality = value;
    this.#qualityEvent();
  }
  public async Unload(): Promise<void> {
    this.#source = null;
    this.#generation++;
    this.#state = this.#disposed ? 'disposed' : 'idle';
    await this.#reset();
  }
  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    instances.delete(this.element);
    for (const remove of this.#nativeListeners.splice(0)) remove();
    void this.Unload().catch(() => undefined);
    super.dispose();
  }
  public set onLoaded(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnLoaded', handler);
  }
  public set onPlay(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnPlay', handler);
  }
  public set onPause(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnPause', handler);
  }
  public set onEnded(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnEnded', handler);
  }
  public set onTimeUpdate(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnTimeUpdate', handler);
  }
  public set onBuffering(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnBuffering', handler);
  }
  public set onQualityChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnQualityChange', handler);
  }
  public set onError(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnError', handler);
  }
  #timeDetail(): WebVideoPlayerTimeEventDetail {
    return { currentTime: this.currentTime, duration: this.duration };
  }
  #trackQuality(track: VideoShakaTrack): number | null {
    if (!track.width || !track.height) return null;
    const variant = this.#descriptor?.variants.find(
      (candidate) => candidate.width === track.width && candidate.height === track.height,
    );
    return variant?.quality ?? Math.min(track.width, track.height);
  }
  #qualityEvent(): void {
    const detail: WebVideoPlayerQualityEventDetail = {
      requested: this.#quality,
      current: this.currentQuality,
    };
    const key = JSON.stringify(detail);
    if (!this.#disposed && key !== this.#lastQualityEvent) {
      this.#lastQualityEvent = key;
      this.emit('OnQualityChange', detail);
    }
  }
  #report(error: Error): void {
    this.#error = error;
    this.#state = 'error';
    if (!this.#disposed) this.emit('OnError', error);
  }
  async #reset(): Promise<void> {
    this.#controller?.abort();
    this.#controller = null;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    const resources = this.#resources;
    this.#resources = null;
    this.#descriptor = null;
    this.#buffering = false;
    this.#lastQualityEvent = '';
    if (this.#posterUrl) {
      URL.revokeObjectURL(this.#posterUrl);
      this.#posterUrl = null;
    }
    this.#video.poster = this.poster;
    const previous = this.#cleanup;
    this.#cleanup = (async () => {
      await previous;
      if (resources && !resources.closed) {
        resources.closed = true;
        for (const remove of resources.listeners) remove();
        resources.player.getNetworkingEngine()?.clearAllRequestFilters();
        await resources.overlay.destroy(); // Overlay owns and destroys its player in 5.2.13.
      }
      this.#video.removeAttribute('src');
      this.#video.load();
    })();
    await this.#cleanup;
  }
  async #load(
    source: WebVideoPlayerSource,
    options: WebVideoPlayerLoadOptions,
    resolve: (
      signal: AbortSignal,
    ) => Promise<{ uri: string; mime: string; context: VideoMediaContext | null }>,
  ): Promise<void> {
    if (this.#disposed) throw new Error('The video player is disposed.');
    if (options.startTime !== undefined) positive(options.startTime, 'startTime', true);
    const generation = ++this.#generation;
    this.#source = source;
    this.#state = 'loading';
    this.#error = null;
    await this.#reset();
    if (generation !== this.#generation || this.#disposed)
      throw new DOMException('Video load superseded.', 'AbortError');
    const controller = new AbortController();
    this.#controller = controller;
    const current = (): void => {
      if (controller.signal.aborted || generation !== this.#generation || this.#disposed)
        throw new DOMException('Video load superseded or aborted.', 'AbortError');
    };
    const abort = (): void => {
      controller.abort();
      if (generation === this.#generation) void this.Unload().catch(() => undefined);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      current();
      const library = await loadVideoShaka();
      current();
      if (!library.Player.isBrowserSupported())
        throw new Error('Shaka playback is unsupported in this browser.');
      const resolved = await resolve(controller.signal);
      current();
      const mediaSource =
        (globalThis as unknown as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ??
        (typeof MediaSource !== 'undefined' ? MediaSource : undefined);
      if (resolved.context && (!mediaSource || typeof mediaSource.isTypeSupported !== 'function'))
        throw new Error(
          'Private RestGo playback requires MediaSource support; native HLS cannot carry Authorization.',
        );
      const player = new library.Player();
      const overlay = new library.ui.Overlay(player, this.element, this.#video);
      const resources: VideoPlayerResources = {
        player,
        overlay,
        library,
        listeners: [],
        closed: false,
      };
      this.#resources = resources;
      overlay.configure({
        controlPanelElements: [
          'play_pause',
          'time_and_duration',
          'spacer',
          'mute',
          'volume',
          'overflow_menu',
          'fullscreen',
        ],
        overflowMenuButtons: [
          'quality',
          'language',
          'captions',
          'playback_rate',
          'picture_in_picture',
        ],
      });
      overlay.setEnabled(this.controls && this.enabled);
      player.configure({
        streaming: {
          preferNativeHls: false,
          preferNativeDash: false,
          useNativeHlsForFairPlay: false,
          retryParameters: { maxAttempts: 2, timeout: 30_000 },
          bufferingGoal: 20,
        },
        manifest: { retryParameters: { maxAttempts: 2, timeout: 30_000 } },
        mediaSource: { transmuxWorkerUrl: '' },
      });
      if (resolved.context)
        player
          .getNetworkingEngine()
          ?.registerRequestFilter((_type, request) =>
            protectVideoRequest(request, resolved.context!),
          );
      const listen = (event: string, handler: EventListener): void => {
        player.addEventListener(event, handler);
        resources.listeners.push(() => player.removeEventListener(event, handler));
      };
      listen('buffering', (event) => {
        if (generation !== this.#generation) return;
        const buffering = 'buffering' in event && event.buffering === true;
        if (buffering !== this.#buffering) {
          this.#buffering = buffering;
          this.emit('OnBuffering', { buffering } satisfies WebVideoPlayerBufferingEventDetail);
        }
      });
      listen('variantchanged', () => {
        if (generation === this.#generation) {
          this.#quality = player.getConfiguration().abr.enabled
            ? 'auto'
            : (this.currentQuality ?? this.#quality);
          this.#qualityEvent();
        }
      });
      listen('abrstatuschanged', () => {
        if (generation === this.#generation) {
          if (player.getConfiguration().abr.enabled) this.#quality = 'auto';
          else if (this.#quality === 'auto') this.#quality = this.currentQuality ?? this.#quality;
          this.#qualityEvent();
        }
      });
      listen('adaptation', () => {
        if (generation === this.#generation) this.#qualityEvent();
      });
      listen('error', (event) => {
        if (generation !== this.#generation || this.#state === 'loading') return;
        const error = mediaError('detail' in event ? event.detail : event);
        void this.Unload().then(() => {
          if (!this.#disposed && this.#generation === generation + 1) this.#report(error);
        });
      });
      await player.attach(this.#video);
      current();
      const controls = overlay.getControls();
      const controlsError: EventListener = (event) => {
        if (generation === this.#generation && this.#state !== 'loading')
          this.#report(mediaError('detail' in event ? event.detail : event));
      };
      controls?.addEventListener('error', controlsError);
      resources.listeners.push(() => controls?.removeEventListener('error', controlsError));
      await player.load(resolved.uri, options.startTime ?? null, resolved.mime);
      current();
      if (resolved.context && player.getLoadMode() === library.Player.LoadMode.SRC_EQUALS)
        throw new Error(
          'This browser selected native HLS. Private playback is unavailable in that mode.',
        );
      this.#state = 'loaded';
      this.SetQuality(this.#quality);
      this.emit('OnLoaded', {
        source,
        duration: this.duration,
        availableQualities: this.availableQualities,
      } satisfies WebVideoPlayerLoadedEventDetail);
    } catch (value) {
      const error = mediaError(value);
      if (generation === this.#generation && !this.#disposed) {
        await this.#reset();
        if (generation === this.#generation && !this.#disposed) this.#report(error);
      }
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
    current();
    if (this.autoplay) {
      try {
        await this.Play();
      } catch (value) {
        const error = mediaError(value);
        if (generation === this.#generation) this.#report(error);
        throw error;
      }
    }
  }
}
