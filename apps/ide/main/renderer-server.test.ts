import { promises as fs } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeRendererServer, publishRenderer } from './renderer-server';

interface HttpResult {
  readonly status: number | undefined;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

async function readHttp(
  url: string,
  options: {
    readonly method?: string;
    readonly requestPath?: string;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const httpRequest = request(
      url,
      {
        method: options.method ?? 'GET',
        path: options.requestPath ?? `${new URL(url).pathname}${new URL(url).search}`,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    httpRequest.on('error', reject);
    httpRequest.end();
  });
}

describe('packaged IDE renderer server', () => {
  let temporaryDirectory: string;
  let rootDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-renderer-server-'));
    rootDirectory = path.join(temporaryDirectory, 'renderer');
    await fs.mkdir(path.join(rootDirectory, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(rootDirectory, 'index.html'),
      '<!doctype html><script type="module" src="./assets/app.js"></script>',
    );
    await fs.writeFile(path.join(rootDirectory, 'assets', 'app.js'), 'export const ready = true;');
    await fs.writeFile(path.join(temporaryDirectory, 'secret.txt'), 'private');
  });

  afterEach(async () => {
    await closeRendererServer();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('publishes a stable token URL on loopback and serves relative Vite assets', async () => {
    const [url, sameUrl] = await Promise.all([
      publishRenderer(rootDirectory),
      publishRenderer(rootDirectory),
    ]);
    const entryUrl = new URL(url);
    expect(sameUrl).toBe(url);
    expect(entryUrl.hostname).toBe('127.0.0.1');
    expect(entryUrl.port).not.toBe('');
    expect(entryUrl.pathname).toMatch(/^\/[a-f0-9]{64}\/index\.html$/u);

    const html = await readHttp(url);
    expect(html.status).toBe(200);
    expect(html.body).toContain('src="./assets/app.js"');
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(html.headers['cache-control']).toBe('no-store');
    expect(html.headers['x-content-type-options']).toBe('nosniff');
    expect(html.headers['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(html.headers['x-frame-options']).toBe('DENY');
    expect(html.headers['referrer-policy']).toBe('no-referrer');
    expect(html.headers['access-control-allow-origin']).toBeUndefined();
    const asset = await readHttp(new URL('./assets/app.js', url).href);
    expect(asset.status).toBe(200);
    expect(asset.body).toBe('export const ready = true;');
    expect(asset.headers['content-type']).toBe('text/javascript; charset=utf-8');
  });

  it('serves assets with browser MIME types and HEAD without a body', async () => {
    const url = await publishRenderer(rootDirectory);
    for (const [name, mime] of [
      ['app.css', 'text/css; charset=utf-8'],
      ['data.json', 'application/json; charset=utf-8'],
      ['icon.svg', 'image/svg+xml'],
      ['icon.png', 'image/png'],
      ['font.woff', 'font/woff'],
      ['font.woff2', 'font/woff2'],
      ['font.ttf', 'font/ttf'],
      ['font.otf', 'font/otf'],
      ['worker.wasm', 'application/wasm'],
    ]) {
      if (name === undefined || mime === undefined) throw new Error('Missing test asset.');
      await fs.writeFile(path.join(rootDirectory, 'assets', name), 'asset');
      const asset = await readHttp(new URL(`./assets/${name}`, url).href);
      expect(asset.status).toBe(200);
      expect(asset.headers['content-type']).toBe(mime);
    }
    const head = await readHttp(url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(Number(head.headers['content-length'])).toBeGreaterThan(0);
  });

  it('rejects foreign Host, Origin and cross-origin or framed browser requests', async () => {
    const url = await publishRenderer(rootDirectory);
    const deniedHeaders: Readonly<Record<string, string>>[] = [
      { Host: 'attacker.example' },
      { Host: 'localhost' },
      { Origin: 'https://attacker.example' },
      { Origin: 'null' },
      { 'Sec-Fetch-Site': 'cross-site' },
      { 'Sec-Fetch-Site': 'same-site' },
      { 'Sec-Fetch-Dest': 'iframe' },
      { 'Sec-Fetch-Dest': 'frame' },
    ];
    for (const headers of deniedHeaders) {
      const result = await readHttp(url, { headers });
      expect(result.status).toBe(403);
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(
      (
        await readHttp(url, {
          headers: { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Dest': 'document' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await readHttp(url, {
          headers: { Origin: new URL(url).origin, 'Sec-Fetch-Site': 'same-origin' },
        })
      ).status,
    ).toBe(200);
  });

  it('allows only GET and HEAD and requires the published token and a file', async () => {
    const url = await publishRenderer(rootDirectory);
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const result = await readHttp(url, { method });
      expect(result.status).toBe(405);
      expect(result.headers.allow).toBe('GET, HEAD');
      expect(result.headers['access-control-allow-origin']).toBeUndefined();
    }
    const tokenPrefix = new URL(url).pathname.slice(0, -'index.html'.length);
    for (const requestPath of [
      '/index.html',
      '/invalid/index.html',
      tokenPrefix,
      `${tokenPrefix}assets`,
    ]) {
      expect((await readHttp(url, { requestPath })).status).toBe(404);
    }
  });

  it('rejects traversal, encoded separators, null bytes and malformed paths', async () => {
    const url = await publishRenderer(rootDirectory);
    const prefix = new URL(url).pathname.slice(0, -'index.html'.length);
    for (const suffix of [
      '../secret.txt',
      '%2e%2e/secret.txt',
      'assets/%2e%2e/%2e%2e/secret.txt',
      'assets%2f..%2f..%2fsecret.txt',
      'assets%5capp.js',
      'assets\\app.js',
      'index.html%00',
      'index.html%1f',
      'C%3a/secret.txt',
      '%ZZ',
    ]) {
      const result = await readHttp(url, { requestPath: `${prefix}${suffix}` });
      expect(result.status).toBe(400);
      expect(result.body).not.toContain('private');
    }
  });

  it('refuses symlink escapes while permitting assets linked inside the renderer root', async (context) => {
    try {
      // Directory junctions can be created without administrator privileges on Windows.
      await fs.symlink(
        temporaryDirectory,
        path.join(rootDirectory, 'escape'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await fs.symlink(
        path.join(rootDirectory, 'assets'),
        path.join(rootDirectory, 'linked-assets'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP')
      ) {
        context.skip();
        return;
      }
      throw error;
    }
    const url = await publishRenderer(rootDirectory);
    const escaped = await readHttp(new URL('./escape/secret.txt', url).href);
    expect(escaped.status).toBe(404);
    expect(escaped.body).not.toContain('private');
    const linkedAsset = await readHttp(new URL('./linked-assets/app.js', url).href);
    expect(linkedAsset.status).toBe(200);
    expect(linkedAsset.body).toBe('export const ready = true;');
  });

  it('closes the listener, revokes tokens and starts a fresh server when needed', async () => {
    const oldUrl = await publishRenderer(rootDirectory);
    await closeRendererServer();
    await expect(readHttp(oldUrl)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    await closeRendererServer();
    const newUrl = await publishRenderer(rootDirectory);
    expect(new URL(newUrl).pathname).not.toBe(new URL(oldUrl).pathname);
    expect((await readHttp(newUrl)).status).toBe(200);
    expect((await readHttp(newUrl, { requestPath: new URL(oldUrl).pathname })).status).toBe(404);
  });

  it('serializes publication and shutdown while the listener is starting', async () => {
    const publishing = publishRenderer(rootDirectory);
    const closing = closeRendererServer();
    const republishing = publishRenderer(rootDirectory);
    const [oldUrl, , newUrl] = await Promise.all([publishing, closing, republishing]);
    expect(new URL(newUrl).pathname).not.toBe(new URL(oldUrl).pathname);
    expect((await readHttp(newUrl)).status).toBe(200);
    expect((await readHttp(newUrl, { requestPath: new URL(oldUrl).pathname })).status).toBe(404);
    await Promise.all([closeRendererServer(), closeRendererServer()]);
    await expect(readHttp(newUrl)).rejects.toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('rejects invalid roots without blocking a subsequent publication', async () => {
    await expect(publishRenderer(path.join(rootDirectory, 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(publishRenderer(path.join(rootDirectory, 'index.html'))).rejects.toThrow(
      'The IDE renderer root must be a directory.',
    );
    expect((await readHttp(await publishRenderer(rootDirectory))).status).toBe(200);
  });
});
