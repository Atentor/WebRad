import { JSDOM } from 'jsdom';
import { createPage } from '@webrad/project-model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebPage, WebPageRouter, type RuntimePageRoute } from '../src/index.js';

afterEach(() => vi.unstubAllGlobals());
function createDom(url: string): JSDOM {
  const dom = new JSDOM('<base href="/portal/">', { url });
  vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
  return dom;
}
function routes(): RuntimePageRoute[] {
  return ['PageMain', 'PageCustomers'].map((name, index) => {
    const model = createPage(name);
    return {
      id: model.id,
      name,
      path: index === 0 ? '/main' : '/admin/customers',
      model,
      createPage: (element) => new WebPage(element),
    };
  });
}

describe('browser page route strategy', () => {
  it.each(['https://example.test/app/index.html'])(
    'supports hash compatibility at %s',
    async (url) => {
      const dom = createDom(url);
      const router = new WebPageRouter(routes(), dom.window.document.body, { mode: 'hash' });
      router.start('PageMain');
      router.navigateBrowser('PageCustomers');
      expect(dom.window.location.hash).toBe('#/admin/customers');
      expect(router.activeRoute?.name).toBe('PageCustomers');
      const length = dom.window.history.length;
      router.navigateBrowser('PageMain', { replace: true });
      expect(dom.window.history.length).toBe(length);
      expect(router.activeRoute?.name).toBe('PageMain');
      router.dispose();
      dom.window.close();
    },
  );

  it('selects hash automatically for file URLs and reads legacy name links', () => {
    const dom = createDom('file:///tmp/app/index.html#/PageCustomers');
    const router = new WebPageRouter(routes(), dom.window.document.body);
    router.start('PageMain');
    expect(router.activeRoute?.name).toBe('PageCustomers');
    router.navigateBrowser('PageMain');
    expect(dom.window.location.hash).toBe('#/main');
    router.dispose();
    dom.window.close();
  });

  it('keeps query parameters, supports paths, replaces history and removes listeners on disposal', () => {
    const dom = createDom('https://example.test/portal/admin/customers?filter=active');
    const router = new WebPageRouter(routes(), dom.window.document.body);
    router.start('PageMain');
    expect(router.activeRoute?.name).toBe('PageCustomers');
    router.navigateBrowser('/main');
    expect(dom.window.location.href).toBe('https://example.test/portal/main?filter=active');
    const length = dom.window.history.length;
    router.navigateBrowser('PageCustomers', { replace: true });
    expect(dom.window.history.length).toBe(length);
    router.dispose();
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    expect(router.activePage).toBeNull();
    dom.window.close();
  });
});
