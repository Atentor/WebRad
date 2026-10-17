import { RestGoError, type RestGoClient } from '@webrad/restgo-sdk';

/** Narrow typed boundary around the generated third-party declarations. */
export interface VideoShakaTrack {
  id: number;
  active: boolean;
  width: number | null;
  height: number | null;
  codecs: string | null;
  videoCodec: string | null;
  bandwidth: number;
}
export interface VideoShakaRequest {
  uris: string[];
  method: string;
  headers: Record<string, string>;
  body: ArrayBuffer | null;
  retryParameters: { timeout: number };
  allowCrossSiteCredentials: boolean;
  streamDataCallback?: (chunk: ArrayBuffer) => Promise<void>;
}
interface VideoShakaResponse {
  uri: string;
  originalUri: string;
  data: ArrayBuffer;
  headers: Record<string, string>;
  status: number;
  timeMs: number;
  fromCache: boolean;
}
export interface VideoShakaPlayer extends EventTarget {
  attach(video: HTMLVideoElement): Promise<void>;
  load(url: string, startTime?: number | null, mimeType?: string): Promise<void>;
  unload(): Promise<void>;
  destroy(): Promise<void>;
  configure(configuration: Readonly<Record<string, unknown>>): boolean;
  getConfiguration(): { abr: { enabled: boolean } };
  getVariantTracks(): VideoShakaTrack[];
  selectVariantTrack(track: VideoShakaTrack, clearBuffer?: boolean): void;
  getLoadMode(): number;
  getNetworkingEngine(): {
    registerRequestFilter(filter: (type: number, request: VideoShakaRequest) => void): void;
    clearAllRequestFilters(): void;
  } | null;
}
export interface VideoShakaOverlay {
  getControls(): EventTarget | null;
  configure(configuration: Readonly<Record<string, unknown>>): void;
  setEnabled(enabled: boolean): void;
  destroy(): Promise<void>;
}
export interface VideoShakaLibrary {
  Player: {
    new (): VideoShakaPlayer;
    isBrowserSupported(): boolean;
    version: string;
    LoadMode: { SRC_EQUALS: number };
  };
  polyfill: { installAll(): void };
  ui: {
    Overlay: new (
      player: VideoShakaPlayer,
      container: HTMLElement,
      video: HTMLVideoElement,
    ) => VideoShakaOverlay;
  };
  net: {
    NetworkingEngine: {
      registerScheme(
        scheme: string,
        plugin: VideoSchemePlugin,
        priority?: number,
        progressSupport?: boolean,
      ): void;
    };
  };
  util: {
    AbortableOperation: new <T>(
      promise: Promise<T>,
      abort: () => Promise<void>,
    ) => { promise: Promise<T>; abort(): Promise<void> };
    Error: {
      new (severity: number, category: number, code: number, ...data: unknown[]): Error;
      Severity: { CRITICAL: number; RECOVERABLE: number };
      Category: { NETWORK: number };
      Code: { BAD_HTTP_STATUS: number; HTTP_ERROR: number; OPERATION_ABORTED: number };
    };
  };
}
export interface VideoMediaContext {
  readonly client: RestGoClient;
  readonly videoId: string;
  readonly ownerId: string;
  readonly signal: AbortSignal;
}
const mediaContexts = new WeakMap<VideoShakaRequest, VideoMediaContext>();
export function protectVideoRequest(request: VideoShakaRequest, context: VideoMediaContext): void {
  // The SDK validates every candidate again at the actual fetch boundary.
  request.allowCrossSiteCredentials = false;
  delete request.headers.Authorization;
  mediaContexts.set(request, context);
}
type VideoSchemePlugin = (
  uri: string,
  request: VideoShakaRequest,
  type: number,
  progress: (elapsed: number, bytes: number, remaining: number) => void,
  headersReceived: (headers: Record<string, string>) => void,
) => { promise: Promise<VideoShakaResponse>; abort(): Promise<void> };

function installVideoTransport(library: VideoShakaLibrary): void {
  const plugin: VideoSchemePlugin = (uri, request, _type, progress, headersReceived) => {
    const controller = new AbortController();
    const context = mediaContexts.get(request);
    const abort = (): void => controller.abort();
    context?.signal.addEventListener('abort', abort, { once: true });
    if (context?.signal.aborted) abort();
    const timeout = setTimeout(abort, request.retryParameters.timeout || 30_000);
    const pending = (async (): Promise<VideoShakaResponse> => {
      const start = performance.now();
      try {
        let response: Response;
        if (context) {
          if (context.client.CurrentUser?.id !== context.ownerId)
            throw new RestGoError('The video owner session changed.', 'AUTH_OPERATION_CANCELLED');
          if (request.method !== 'GET' && request.method !== 'HEAD')
            throw new TypeError('Video media supports only GET/HEAD.');
          const fetched = await context.client.videos.getMedia(context.videoId, uri, {
            signal: controller.signal,
            range: request.headers.Range ?? request.headers.range,
            method: request.method,
          });
          if (fetched.error) throw fetched.error;
          response = fetched.data;
        } else {
          const url = new URL(uri);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            throw new TypeError('Invalid media URL.');
          response = await fetch(url.href, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'error',
          });
          if (!response.ok)
            throw new RestGoError('Media request rejected.', 'HTTP_ERROR', response.status);
        }
        const headers = Object.fromEntries(response.headers.entries());
        headersReceived(headers);
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        let last = start;
        const total = Number(response.headers.get('Content-Length')) || 0;
        const reader = response.body?.getReader();
        if (reader)
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            chunks.push(part.value);
            loaded += part.value.byteLength;
            const now = performance.now();
            progress(now - last, part.value.byteLength, Math.max(0, total - loaded));
            last = now;
            if (request.streamDataCallback)
              await request.streamDataCallback(part.value.slice().buffer);
          }
        const data = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          uri: response.url || uri,
          originalUri: uri,
          data: data.buffer,
          headers,
          status: response.status,
          timeMs: performance.now() - start,
          fromCache: false,
        };
      } catch (error) {
        const code = controller.signal.aborted
          ? library.util.Error.Code.OPERATION_ABORTED
          : error instanceof RestGoError && error.status
            ? library.util.Error.Code.BAD_HTTP_STATUS
            : library.util.Error.Code.HTTP_ERROR;
        // Shaka retries transient errors only. Permission failures are terminal.
        const status = error instanceof RestGoError ? error.status : 0;
        throw new library.util.Error(
          status === 401 || status === 403 || error instanceof TypeError
            ? library.util.Error.Severity.CRITICAL
            : library.util.Error.Severity.RECOVERABLE,
          library.util.Error.Category.NETWORK,
          code,
          uri,
          status,
          '',
          {},
          _type,
        );
      } finally {
        clearTimeout(timeout);
        context?.signal.removeEventListener('abort', abort);
      }
    })();
    return new library.util.AbortableOperation(pending, async () => {
      abort();
    });
  };
  library.net.NetworkingEngine.registerScheme('http', plugin, 3, true);
  library.net.NetworkingEngine.registerScheme('https', plugin, 3, true);
}
let sharedLibrary: Promise<VideoShakaLibrary> | null = null;
export function loadVideoShaka(): Promise<VideoShakaLibrary> {
  sharedLibrary ??= import('shaka-player/dist/shaka-player.ui.js').then((module) => {
    const library = module.default as unknown as VideoShakaLibrary;
    library.polyfill.installAll();
    installVideoTransport(library);
    return library;
  });
  return sharedLibrary;
}
