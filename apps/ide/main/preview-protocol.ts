import { randomUUID } from 'node:crypto';

import { protocol } from 'electron';

const PREVIEW_SCHEME = 'webrad-preview';
const previewByToken = new Map<string, string>();
const tokenByOwner = new Map<number, string>();
let registered = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: PREVIEW_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function response(body: string, status: number, contentType: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': [
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        'img-src data: blob: https: http:',
        'font-src data: https: http:',
        'media-src data: blob: https: http:',
        'connect-src https: http:',
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; '),
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function registerPreviewProtocol(): void {
  if (registered) return;
  registered = true;
  void protocol.handle(PREVIEW_SCHEME, (request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const token = pathParts[0];
    if (url.hostname !== 'session' || pathParts[1] !== 'index.html' || token === undefined) {
      return response('Not found', 404, 'text/plain; charset=utf-8');
    }
    const html = previewByToken.get(token);
    return html === undefined
      ? response('Preview expired', 404, 'text/plain; charset=utf-8')
      : response(html, 200, 'text/html; charset=utf-8');
  });
}

export function publishPreviewHtml(ownerId: number, html: string): string {
  revokePreview(ownerId);
  const token = randomUUID();
  previewByToken.set(token, html);
  tokenByOwner.set(ownerId, token);
  return `${PREVIEW_SCHEME}://session/${token}/index.html`;
}

export function revokePreview(ownerId: number): void {
  const token = tokenByOwner.get(ownerId);
  if (token !== undefined) previewByToken.delete(token);
  tokenByOwner.delete(ownerId);
}
