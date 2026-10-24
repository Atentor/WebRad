import { createServer } from 'node:http';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  addPage,
  createPage,
  createProject,
  removeComponentProperty,
  updateComponentProps,
  updatePage,
  updateProjectSettings,
} from '@webrad/project-model';
import { expect, it } from 'vitest';

import { withChromium } from './chromium';

const browserPath = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browserPath !== undefined)(
  'applies saved browser titles and restores the application name in compiled Preview and export',
  async () => {
    const applicationName = 'Portal & <WebRAD> "Admin"';
    const browserTitle = 'Área do cliente & <Conta> "VIP"';
    const initial = updateProjectSettings(createProject('PageTitles'), { applicationName });
    const main = initial.pages[0]!;
    const titled = updateComponentProps(main, main.rootComponentId, {
      browserTitle: `  ${browserTitle}  `,
    });
    const blank = createPage('PageBlank');
    const whitespace = updateComponentProps(blank, blank.rootComponentId, {
      browserTitle: ' \t\n ',
    });
    const legacy = createPage('PageLegacy');
    const legacyWithoutTitle = removeComponentProperty(
      legacy,
      legacy.rootComponentId,
      'browserTitle',
    );
    const project = addPage(
      addPage(updatePage(initial, main.id, { components: titled.components }), whitespace),
      legacyWithoutTitle,
    );
    const result = await compileProjectToMemory(project, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const exported = await compileProjectToMemory(project, { userSources: {}, target: 'deploy' });
    expect(exported.success, JSON.stringify(exported.diagnostics)).toBe(true);

    const server = createServer((request, response) => {
      const route = request.url?.split('?')[0]?.slice(1) ?? '';
      response.setHeader(
        'Content-Type',
        route.endsWith('.js')
          ? 'text/javascript'
          : route.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      );
      const file = route === '' ? 'index.html' : route;
      const contents = request.url?.includes('?preview=1')
        ? result.previewHtml
        : exported.files[file];
      response.statusCode = contents === undefined ? 404 : 200;
      response.end(contents ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing page-title server');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      for (const mode of ['index.html?preview=1', 'index.html']) {
        await withChromium(browserPath!, `${origin}/${mode}`, async (send) => {
          const expectPage = async (rootId: string, title: string): Promise<void> => {
            await expect
              .poll(async () => {
                const evaluated = await send('Runtime.evaluate', {
                  expression: `JSON.stringify({ title: document.title, mounted: document.querySelector('[data-webrad-id="${rootId}"]') !== null })`,
                  returnByValue: true,
                });
                expect(evaluated.exceptionDetails).toBeUndefined();
                return JSON.parse((evaluated.result as { value: string }).value) as {
                  title: string;
                  mounted: boolean;
                };
              })
              .toEqual({ title, mounted: true });
          };
          await expectPage(main.rootComponentId, browserTitle);
          for (const [page, title] of [
            [whitespace, applicationName],
            [legacyWithoutTitle, applicationName],
            [titled, browserTitle],
          ] as const) {
            const navigated = await send('Runtime.evaluate', {
              expression: `Navigate(${JSON.stringify(page.name)})`,
              returnByValue: true,
            });
            expect(navigated.exceptionDetails).toBeUndefined();
            await expectPage(page.rootComponentId, title);
          }
        });
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
