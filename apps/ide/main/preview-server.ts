import { projectAssetPath, type ProjectAsset } from '@webrad/project-model';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { previewRouteScript } from '../shared/preview-route';

interface PreviewServer {
  server: Server;
  origin: string;
}

const previewByToken = new Map<string, string>();
const assetsByToken = new Map<string, readonly ProjectAsset[]>();
const tokenByOwner = new Map<number, string>();
const urlByOwner = new Map<number, string>();
let serverPromise: Promise<PreviewServer> | undefined;
let shutdown: Promise<void> | undefined;
let generation = 0;

const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data: https: http:",
  "media-src 'self' data: blob: https: http:",
  'frame-src blob: https:',
  'connect-src https: http: data: blob:',
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function respond(
  request: IncomingMessage,
  response: ServerResponse,
  body: string | Uint8Array,
  status: number,
  contentType: string,
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': contentSecurityPolicy,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function startPreviewServer(): Promise<PreviewServer> {
  if (serverPromise) return serverPromise;
  let expectedHost = '';
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    // Only the literal loopback authority is accepted, including its assigned port.
    // A hostname which an attacker resolves to loopback must never serve preview HTML.
    if (request.headers.host !== expectedHost) {
      respond(request, response, 'Forbidden', 403, 'text/plain; charset=utf-8');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      respond(request, response, 'Method not allowed', 405, 'text/plain; charset=utf-8');
      return;
    }
    const assetRoute = /^\/([0-9a-f-]{36})\/(assets\/imported\/[^/?]+)$/.exec(
      (request.url ?? '').split('?')[0] ?? '',
    );
    if (assetRoute?.[1] !== undefined && assetRoute[2] !== undefined) {
      let assetPath: string;
      try {
        assetPath = decodeURIComponent(assetRoute[2]);
      } catch {
        respond(request, response, 'Invalid asset path', 400, 'text/plain');
        return;
      }
      const asset = assetsByToken
        .get(assetRoute[1])
        ?.find((entry) => projectAssetPath(entry) === assetPath);
      respond(
        request,
        response,
        asset === undefined ? 'Preview expired' : Buffer.from(asset.base64, 'base64'),
        asset === undefined ? 404 : 200,
        asset?.mediaType ?? 'text/plain',
      );
      return;
    }
    // Match the raw request target so normalization cannot admit extra paths or queries.
    const token =
      /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/index\.html$/.exec(
        request.url ?? '',
      )?.[1];
    let html = token === undefined ? undefined : previewByToken.get(token);
    if (html === undefined) {
      const match =
        /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/[^?#]*)(?:\?[^#]*)?$/.exec(
          request.url ?? '',
        );
      const candidate = match?.[1] === undefined ? undefined : previewByToken.get(match[1]);
      const encoded = candidate?.match(/<meta name="webrad-route-paths" content="([^"]*)"/u)?.[1];
      if (candidate !== undefined && encoded !== undefined) {
        try {
          const paths: unknown = JSON.parse(decodeURIComponent(encoded));
          const rawPath = match?.[2] ?? '';
          const routePath = decodeURIComponent(rawPath);
          const segments = routePath.split('/');
          const navigation =
            request.headers['sec-fetch-dest'] === 'document' ||
            request.headers['sec-fetch-dest'] === 'iframe' ||
            request.headers.accept?.includes('text/html') === true;
          const applicationPath =
            !routePath.includes('\\') &&
            ![...routePath].some(
              (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
            ) &&
            !segments.some((part) => part === '.' || part === '..' || part === 'assets') &&
            (navigation || !segments.some((part) => part.includes('.')));
          if (
            Array.isArray(paths) &&
            (paths.includes(rawPath) || (paths.includes('/404') && applicationPath))
          )
            html = candidate;
        } catch {
          /* Malformed compiler metadata never enables additional routes. */
        }
      }
    }
    respond(
      request,
      response,
      html ?? 'Preview expired',
      html === undefined ? 404 : 200,
      html === undefined ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
    );
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  const starting = new Promise<PreviewServer>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Preview server has no loopback address.'));
        return;
      }
      expectedHost = `127.0.0.1:${String(address.port)}`;
      server.unref();
      resolve({ server, origin: `http://${expectedHost}` });
    });
  });
  serverPromise = starting;
  void starting.catch(() => {
    if (serverPromise === starting) serverPromise = undefined;
  });
  return starting;
}

/** Publish compiler HTML in memory, at a browser HTTP origin separate from the IDE. */
export async function publishPreviewHtml(
  ownerId: number,
  html: string,
  assets: readonly ProjectAsset[] = [],
): Promise<string> {
  if (shutdown) await shutdown;
  const publishedGeneration = generation;
  const { origin } = await startPreviewServer();
  if (generation !== publishedGeneration) {
    throw new Error('Preview server closed during publication.');
  }
  revokePreview(ownerId);
  const token = randomUUID();
  previewByToken.set(token, html.replace('<head>', '<head><base href="/' + token + '/">' + previewRouteScript()));
  assetsByToken.set(token, assets);
  tokenByOwner.set(ownerId, token);
  const url = `${origin}/${token}/index.html`;
  urlByOwner.set(ownerId, url);
  return url;
}

/** Exact live publication check; revoked URLs cannot authorize report windows. */
export function isPublishedPreviewUrl(url: string): boolean {
  try {
    const candidate = new URL(url);
    return [...urlByOwner.values()].some((published) => {
      const entry = new URL(published);
      if (entry.origin !== candidate.origin) return false;
      if (entry.pathname === candidate.pathname) return true;
      const prefix = entry.pathname.slice(0, -'index.html'.length);
      if (!candidate.pathname.startsWith(prefix)) return false;
      const html = previewByToken.get(prefix.split('/')[1] ?? '');
      const encoded = html?.match(/<meta name="webrad-route-paths" content="([^"]*)"/u)?.[1];
      if (encoded === undefined) return false;
      const paths: unknown = JSON.parse(decodeURIComponent(encoded));
      return Array.isArray(paths) && paths.includes('/' + candidate.pathname.slice(prefix.length));
    });
  } catch {
    return false;
  }
}

export function revokePreview(ownerId: number): void {
  const token = tokenByOwner.get(ownerId);
  if (token !== undefined) {
    previewByToken.delete(token);
    assetsByToken.delete(token);
  }
  tokenByOwner.delete(ownerId);
  urlByOwner.delete(ownerId);
}

/** Revoke all publications and release the local listener, including a pending startup. */
export function closePreviewServer(): Promise<void> {
  if (shutdown) return shutdown;
  generation++;
  previewByToken.clear();
  assetsByToken.clear();
  tokenByOwner.clear();
  urlByOwner.clear();
  const starting = serverPromise;
  serverPromise = undefined;
  if (!starting) return Promise.resolve();
  const closing = starting
    .then(
      ({ server }) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    )
    .finally(() => {
      if (shutdown === closing) shutdown = undefined;
    });
  shutdown = closing;
  return closing;
}
