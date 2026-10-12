export type WebVideoPlayerSource =
  | { readonly kind: 'restgo'; readonly videoId: string }
  | { readonly kind: 'url'; readonly url: string; readonly format: 'hls' | 'dash' };
export type WebVideoPlayerState =
  'idle' | 'loading' | 'loaded' | 'playing' | 'paused' | 'ended' | 'error' | 'disposed';
export type WebVideoPlayerQuality = 'auto' | number;
export type WebVideoPlayerObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
export type WebVideoPlayerAspectRatio = 'none' | '16:9' | '9:16';
export interface WebVideoPlayerLoadOptions {
  readonly signal?: AbortSignal;
  readonly startTime?: number;
}
export interface WebVideoPlayerRestGoOptions extends WebVideoPlayerLoadOptions {
  readonly public?: boolean;
}
export interface WebVideoPlayerUrlOptions extends WebVideoPlayerLoadOptions {
  readonly format?: 'hls' | 'dash';
}
export interface WebVideoPlayerAvailableQuality {
  readonly quality: number;
  readonly width: number;
  readonly height: number;
  readonly codecs: string;
}
export interface WebVideoPlayerLoadedEventDetail {
  readonly source: WebVideoPlayerSource;
  readonly duration: number;
  readonly availableQualities: readonly WebVideoPlayerAvailableQuality[];
}
export interface WebVideoPlayerTimeEventDetail {
  readonly currentTime: number;
  readonly duration: number;
}
export interface WebVideoPlayerBufferingEventDetail {
  readonly buffering: boolean;
}
export interface WebVideoPlayerQualityEventDetail {
  readonly requested: WebVideoPlayerQuality;
  readonly current: number | null;
}
export interface WebVideoPlayerBufferedRange {
  readonly start: number;
  readonly end: number;
}

export function normalizeVideoPlayerSource(value: unknown): WebVideoPlayerSource | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid video source.');
  const source = value as Record<string, unknown>;
  if (
    source.kind === 'restgo' &&
    typeof source.videoId === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(source.videoId)
  )
    return Object.freeze({ kind: 'restgo', videoId: source.videoId });
  if (
    source.kind === 'url' &&
    typeof source.url === 'string' &&
    (source.format === 'hls' || source.format === 'dash')
  ) {
    const url = new URL(source.url);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/(^|\.)(youtube\.com|youtu\.be)$/i.test(url.hostname)
    )
      return Object.freeze({ kind: 'url', url: url.href, format: source.format });
  }
  throw new TypeError('Use a RestGo video ID or an HTTP(S) HLS/DASH manifest URL.');
}
