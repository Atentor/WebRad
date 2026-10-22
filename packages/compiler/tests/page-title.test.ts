import {
  addPage,
  createPage,
  createProject,
  updateComponentProps,
  updatePage,
  updateProjectSettings,
} from '@webrad/project-model';
import { describe, expect, it } from 'vitest';

import { compileProjectToMemory } from '../src/index.js';
import { createIndexHtml, createPreviewHtml, type HtmlDocumentMetadata } from '../src/html.js';

describe('page browser titles', () => {
  it.each([undefined, '', ' \t\n '])(
    'preserves the application name when the saved browser title is %j',
    (browserTitle) => {
      const project = updateProjectSettings(createProject('Legacy'), {
        applicationName: 'Portal & <WebRAD> "Admin"',
      });
      const metadata: HtmlDocumentMetadata = {
        ...project.settings,
        ...(browserTitle === undefined ? {} : { browserTitle }),
      };
      for (const html of [
        createIndexHtml(metadata, null, null),
        createPreviewHtml(metadata, '', ''),
      ]) {
        expect(html).toContain('<title>Portal &amp; &lt;WebRAD&gt; &quot;Admin&quot;</title>');
        expect(html).toContain(
          'data-webrad-application-name="Portal &amp; &lt;WebRAD&gt; &quot;Admin&quot;"',
        );
      }
    },
  );

  it('escapes the trimmed page title without changing application SEO metadata', () => {
    const project = createProject('Application');
    const metadata = {
      ...project.settings,
      browserTitle: '  Customer & <Account> "VIP"  ',
    };
    for (const html of [
      createIndexHtml(metadata, null, null),
      createPreviewHtml(metadata, '', ''),
    ]) {
      expect(html).toContain('<title>Customer &amp; &lt;Account&gt; &quot;VIP&quot;</title>');
      expect(html).toContain('<meta property="og:title" content="Application" />');
      expect(html).toContain('data-webrad-application-name="Application"');
    }
  });

  it('uses the effective entry page for Preview and exported HTML', async () => {
    const initial = createProject('Application');
    const main = initial.pages[0]!;
    const mainWithTitle = updateComponentProps(main, main.rootComponentId, {
      browserTitle: 'Home & <Account>',
    });
    const alternate = createPage('PageAlternate');
    const alternateWithTitle = updateComponentProps(alternate, alternate.rootComponentId, {
      browserTitle: '  Alternate title  ',
    });
    const project = addPage(
      updatePage(initial, main.id, { components: mainWithTitle.components }),
      alternateWithTitle,
    );

    const exported = await compileProjectToMemory(project, { userSources: {}, target: 'deploy' });
    expect(exported.success, JSON.stringify(exported.diagnostics)).toBe(true);
    expect(exported.files['index.html']).toContain('<title>Home &amp; &lt;Account&gt;</title>');

    const preview = await compileProjectToMemory(
      { ...project, entryPage: alternate.id },
      { userSources: {} },
    );
    expect(preview.success, JSON.stringify(preview.diagnostics)).toBe(true);
    expect(preview.previewHtml).toContain('<title>Alternate title</title>');
    expect(preview.files['index.html']).toContain('<title>Alternate title</title>');
    expect(preview.previewHtml).toContain('data-webrad-application-name="Application"');
  });

  it('rejects a browser title with a non-string saved value', async () => {
    const initial = createProject('InvalidTitle');
    const page = initial.pages[0]!;
    const invalid = updateComponentProps(page, page.rootComponentId, { browserTitle: 42 });
    const project = updatePage(initial, page.id, { components: invalid.components });
    const result = await compileProjectToMemory(project, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'registry',
          message: 'Property "browserTitle" has an invalid string value for WebPage.',
          path: ['pages', 0, 'components', 0, 'props', 'browserTitle'],
        }),
      ]),
    );
  });
});
