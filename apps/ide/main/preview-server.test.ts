import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { closePreviewServer, publishPreviewHtml, revokePreview } from './preview-server';

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function httpRequest(
  url: string,
  options: { method?: string; path?: string; host?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const outgoing = request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        method: options.method ?? 'GET',
        path: options.path ?? parsed.pathname,
        headers: options.host ? { Host: options.host } : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        response.on('error', reject);
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

afterEach(async () => {
  await closePreviewServer();
});

describe('loopback preview server', () => {
  it('serves only in-memory HTML at an ordinary loopback HTTP origin', async () => {
    const html = '<!doctype html><p>Ol\u00e1 WebRAD</p>';
    const url = await publishPreviewHtml(1, html);
    const parsed = new URL(url);
    expect(parsed.protocol).toBe('http:');
    expect(parsed.hostname).toBe('127.0.0.1');
    expect(Number(parsed.port)).toBeGreaterThan(0);
    expect(parsed.pathname).toMatch(/^\/[0-9a-f-]{36}\/index\.html$/);
    const response = await httpRequest(url);
    expect(response.status).toBe(200);
    expect(response.body).toBe(html);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(html)));
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain(
      'connect-src https: http: data: blob:',
    );
    expect(response.headers['content-security-policy']).toContain('frame-src blob:');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps HEAD metadata consistent with GET without sending HTML', async () => {
    const url = await publishPreviewHtml(1, '<p>Preview</p>');
    const response = await httpRequest(url, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.body).toBe('');
    expect(response.headers['content-length']).toBe('14');
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('shares one listener for concurrent publications with different random URLs', async () => {
    const [first, second] = await Promise.all([
      publishPreviewHtml(1, 'First'),
      publishPreviewHtml(2, 'Second'),
    ]);
    expect(new URL(first).origin).toBe(new URL(second).origin);
    expect(first).not.toBe(second);
    expect((await httpRequest(first)).body).toBe('First');
    expect((await httpRequest(second)).body).toBe('Second');
  });

  it('revokes replaced and closed owner URLs without removing other owners', async () => {
    const old = await publishPreviewHtml(1, 'Old');
    const other = await publishPreviewHtml(2, 'Other');
    const current = await publishPreviewHtml(1, 'Current');
    expect(current).not.toBe(old);
    expect((await httpRequest(old)).status).toBe(404);
    expect((await httpRequest(current)).body).toBe('Current');
    revokePreview(1);
    revokePreview(1);
    expect((await httpRequest(current)).status).toBe(404);
    expect((await httpRequest(other)).body).toBe('Other');
  });

  it('rejects other methods, invalid targets, and authorities used for DNS rebinding', async () => {
    const url = await publishPreviewHtml(1, 'Secret compiler HTML');
    for (const method of ['POST', 'OPTIONS', 'PUT', 'DELETE']) {
      const response = await httpRequest(url, { method });
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('GET, HEAD');
      expect(response.body).not.toContain('Secret');
    }
    const path = new URL(url).pathname;
    for (const invalidPath of [
      '/',
      '/index.html',
      '/invalid/index.html',
      '/00000000-0000-0000-0000-000000000000/index.html',
      `${path}?query=1`,
      `${path}/extra`,
      `/extra${path}`,
      path.replace('/index.html', '/../index.html'),
      path.replace('/index.html', '/%69ndex.html'),
      url,
    ]) {
      expect((await httpRequest(url, { path: invalidPath })).status).toBe(404);
    }
    for (const host of ['attacker.example', 'localhost', '127.0.0.1', '127.0.0.1:1']) {
      const response = await httpRequest(url, { host });
      expect(response.status).toBe(403);
      expect(response.body).not.toContain('Secret');
    }
  });

  it('closes the listener and starts a fresh server without restoring revoked tokens', async () => {
    const old = await publishPreviewHtml(1, 'Old');
    await closePreviewServer();
    await expect(httpRequest(old)).rejects.toThrow();
    await closePreviewServer();
    const current = await publishPreviewHtml(1, 'New');
    expect((await httpRequest(current)).body).toBe('New');
    expect((await httpRequest(current, { path: new URL(old).pathname })).status).toBe(404);
  });

  it('closes a pending startup instead of publishing into a closed listener', async () => {
    const publishing = publishPreviewHtml(1, 'Cancelled');
    const assertion = expect(publishing).rejects.toThrow('closed during publication');
    await closePreviewServer();
    await assertion;
    const restarted = await publishPreviewHtml(1, 'Restarted');
    expect((await httpRequest(restarted)).body).toBe('Restarted');
  });
});

it('serves imported assets inside their Preview token and revokes them with the HTML', async () => {
  const asset = {
    id: 'asset',
    fileName: 'hello world.txt',
    mediaType: 'text/plain',
    base64: Buffer.from('asset content').toString('base64'),
  };
  const url = await publishPreviewHtml(7, '<p>Preview</p>', [asset]);
  const assetUrl = new URL('assets/imported/hello%20world.txt', url).href;
  const response = await httpRequest(assetUrl);
  expect(response.status).toBe(200);
  expect(response.body).toBe('asset content');
  expect(response.headers['content-type']).toBe('text/plain');
  expect((await httpRequest(assetUrl, { method: 'HEAD' })).body).toBe('');
  const otherUrl = await publishPreviewHtml(8, '<p>Other project</p>');
  expect(
    (await httpRequest(new URL('assets/imported/hello%20world.txt', otherUrl).href)).status,
  ).toBe(404);
  revokePreview(7);
  expect((await httpRequest(assetUrl)).status).toBe(404);
});
