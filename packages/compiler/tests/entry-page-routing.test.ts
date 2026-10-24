import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  addPage,
  createPage,
  createProject,
  updateComponentProps,
  updatePage,
} from '@webrad/project-model';
import { compileProjectToMemory } from '../src/index.js';

describe('initial page default route', () => {
  it('keeps the mandatory entry at /index even when it is not the first page', async () => {
    const initial = addPage(createProject('EntryRouting'), createPage('Welcome'));
    const entry = initial.pages[0]!;
    const project = {
      ...initial,
      pages: [
        initial.pages.find((page) => page.name === 'Welcome')!,
        entry,
        initial.pages.find((page) => page.name === '404')!,
      ],
    };
    const output = await compileProjectToMemory(project, { userSources: {} });
    expect(output.success, JSON.stringify(output.diagnostics)).toBe(true);
    expect(output.previewHtml).toContain(
      encodeURIComponent(JSON.stringify(['/welcome', '/index', '/404'])),
    );
    const dom = new JSDOM('', { url: 'https://example.test/index', runScripts: 'outside-only' });
    try {
      dom.window.eval(output.files['assets/app.js']!);
      expect(
        dom.window.document
          .querySelector(`[data-webrad-page-id="${entry.id}"]`)
          ?.getAttribute('data-webrad-route-path'),
      ).toBe('/index');
      dom.window.eval("Navigate('Welcome'); Navigate('index');");
      expect(dom.window.location.pathname).toBe('/index');
      expect(dom.window.location.hash).toBe('');
    } finally {
      dom.window.close();
    }
    const explicit = updateComponentProps(entry, entry.rootComponentId, { routePath: '/home' });
    const custom = await compileProjectToMemory(
      updatePage(project, entry.id, { components: explicit.components }),
      { userSources: {} },
    );
    expect(custom.success, JSON.stringify(custom.diagnostics)).toBe(true);
    expect(custom.previewHtml).toContain(
      encodeURIComponent(JSON.stringify(['/welcome', '/index', '/404'])),
    );
  });
});
