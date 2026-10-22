import { afterEach, expect, it } from 'vitest';
import {
  closePreviewServer,
  isPublishedPreviewUrl,
  publishPreviewHtml,
  revokePreview,
} from '../apps/ide/main/preview-server';

afterEach(closePreviewServer);

it('serves only declared routes under live tokens and constrains the document base to its own origin', async () => {
  const routes = encodeURIComponent(JSON.stringify(['/clientes', '/admin/clientes', '/']));
  const html = `<html><head><meta name="webrad-route-paths" content="${routes}" /></head><body>Private preview</body></html>`;
  const entry = await publishPreviewHtml(123, html);
  const base = new URL('./', entry);
  const route = new URL('admin/clientes?filter=active', base).href;
  const response = await fetch(route);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-security-policy')).toContain("base-uri 'self'");
  expect(await response.text()).toContain(`<base href="${base.pathname}">`);
  expect(isPublishedPreviewUrl(route)).toBe(true);
  expect(isPublishedPreviewUrl(entry + '#/clientes')).toBe(true);
  expect(isPublishedPreviewUrl(new URL('missing', base).href)).toBe(false);
  for (const relative of [
    'missing',
    'assets/missing',
    '%2e%2e/clientes',
    'admin/clientes/extra',
    '%63lientes',
  ]) {
    expect((await fetch(new URL(relative, base))).status).toBe(404);
  }
  revokePreview(123);
  expect((await fetch(route)).status).toBe(404);
  expect(isPublishedPreviewUrl(route)).toBe(false);
});
