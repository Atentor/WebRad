import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';

interface RendererServer {
  readonly server: Server;
  readonly origin: string;
  readonly authority: string;
  readonly rootsByToken: Map<string, string>;
  readonly tokensByRoot: Map<string, string>;
}

let activeServer: RendererServer | undefined;
let lifecycle: Promise<void> = Promise.resolve();

function withServerLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = lifecycle.then(operation);
  lifecycle = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

function respond(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType = 'text/plain; charset=utf-8',
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

function isInsideRoot(rootDirectory: string, filePath: string): boolean {
  const relativePath = path.relative(rootDirectory, filePath);
  return (
    relativePath.length > 0 &&
    !path.isAbsolute(relativePath) &&
    relativePath.split(path.sep)[0] !== '..'
  );
}

async function serveRenderer(
  rendererServer: RendererServer,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.headers.host !== rendererServer.authority) {
    respond(request, response, 403, 'Forbidden');
    return;
  }
  const fetchSite = request.headers['sec-fetch-site'];
  const fetchDestination = request.headers['sec-fetch-dest'];
  const requestOrigin = request.headers.origin;
  if (
    (requestOrigin !== undefined && requestOrigin !== rendererServer.origin) ||
    (fetchSite !== undefined && fetchSite !== 'none' && fetchSite !== 'same-origin') ||
    fetchDestination === 'iframe' ||
    fetchDestination === 'frame'
  ) {
    respond(request, response, 403, 'Forbidden');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    respond(request, response, 405, 'Method not allowed');
    return;
  }

  // Inspect the original path before URL normalization can erase traversal segments.
  const rawPath = request.url?.split('?')[0] ?? '';
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    respond(request, response, 400, 'Invalid path');
    return;
  }
  if (
    !decodedPath.startsWith('/') ||
    decodedPath.startsWith('//') ||
    decodedPath.includes('\\') ||
    decodedPath.includes(':') ||
    [...decodedPath].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    respond(request, response, 400, 'Invalid path');
    return;
  }
  const pathParts = decodedPath.slice(1).split('/');
  if (pathParts.some((part) => part === '.' || part === '..')) {
    respond(request, response, 400, 'Invalid path');
    return;
  }
  const token = pathParts.shift();
  const rootDirectory = token === undefined ? undefined : rendererServer.rootsByToken.get(token);
  if (rootDirectory === undefined || pathParts.length === 0 || pathParts.some((part) => !part)) {
    respond(request, response, 404, 'Not found');
    return;
  }
  const candidatePath = path.resolve(rootDirectory, ...pathParts);
  if (!isInsideRoot(rootDirectory, candidatePath)) {
    respond(request, response, 404, 'Not found');
    return;
  }
  try {
    // Electron's fs promises also resolves paths inside the packaged ASAR archive.
    const realFilePath = await fs.realpath(candidatePath);
    if (!isInsideRoot(rootDirectory, realFilePath) || !(await fs.stat(realFilePath)).isFile()) {
      respond(request, response, 404, 'Not found');
      return;
    }
    const content = await fs.readFile(realFilePath);
    respond(
      request,
      response,
      200,
      content,
      contentTypes[path.extname(realFilePath).toLowerCase()] ?? 'application/octet-stream',
    );
  } catch {
    respond(request, response, 404, 'Not found');
  }
}

async function startRendererServer(): Promise<RendererServer> {
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    void serveRenderer(rendererServer, request, response);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Could not bind the IDE renderer server.');
  }
  const authority = `127.0.0.1:${String(address.port)}`;
  const rendererServer: RendererServer = {
    server,
    origin: `http://${authority}`,
    authority,
    rootsByToken: new Map(),
    tokensByRoot: new Map(),
  };
  server.unref();
  return rendererServer;
}

export async function publishRenderer(rootDirectory: string): Promise<string> {
  return withServerLifecycle(async () => {
    const realRootDirectory = await fs.realpath(rootDirectory);
    if (!(await fs.stat(realRootDirectory)).isDirectory()) {
      throw new Error('The IDE renderer root must be a directory.');
    }
    const rendererServer = (activeServer ??= await startRendererServer());
    let token = rendererServer.tokensByRoot.get(realRootDirectory);
    if (token === undefined) {
      token = randomBytes(32).toString('hex');
      rendererServer.tokensByRoot.set(realRootDirectory, token);
      rendererServer.rootsByToken.set(token, realRootDirectory);
    }
    return `${rendererServer.origin}/${token}/index.html`;
  });
}

export async function closeRendererServer(): Promise<void> {
  return withServerLifecycle(async () => {
    const rendererServer = activeServer;
    if (rendererServer === undefined) return;
    activeServer = undefined;
    rendererServer.rootsByToken.clear();
    rendererServer.tokensByRoot.clear();
    await new Promise<void>((resolve, reject) => {
      rendererServer.server.close((error) => (error === undefined ? resolve() : reject(error)));
      rendererServer.server.closeAllConnections();
    });
  });
}
