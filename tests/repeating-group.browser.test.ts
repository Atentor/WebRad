import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compileProjectToMemory, compileTailwindStyles } from '@webrad/compiler';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, updatePage } from '@webrad/project-model';
import { repeatingGroupProject, repeatingGroupUserSources } from './fixtures/repeating-group';
import { withChromium } from './chromium';
const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined).each(['fixed', 'dynamic'] as const)(
  'renders responsive %s row templates and isolated API-bound rows in compiled F9 Preview',
  async (rowHeightMode) => {
    let requests = 0;
    const routes: Record<string, readonly [string, string]> = {};
    const server = createServer((request, response) => {
      if (request.url === '/customers') {
        requests++;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            customers: [
              { id: 1, name: requests === 1 ? 'Ana' : 'Ana updated' },
              { id: 2, name: requests === 1 ? 'Bruno' : 'Bruno updated' },
            ],
          }),
        );
        return;
      }
      const [type, body] = routes[request.url ?? ''] ?? [
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>body{margin:0}#root{width:1000px;height:2200px}iframe{border:0;width:960px;height:2200px}</style></head><body><div id="root"></div><iframe title="Preview" src="/index.html"></iframe><script type="module" src="/app.js"></script></body></html>',
      ];
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test port.');
    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      let project = repeatingGroupProject(baseUrl, rowHeightMode);
      let page = project.pages[0]!;
      for (const [index, mode] of (
        ['fixed', 'align-to-parent', 'row', 'column'] as const
      ).entries()) {
        const fitGroupBase = defaultComponentRegistry.createComponent('WebRepeatingGroup', {
          id: `fit-${mode}`,
          name: `FitGroup${index}`,
          parentId: page.rootComponentId,
          x: 20,
          y: 2180 + index * 200,
          props: {
            repeatingGroupConfig: page.components.find((node) => node.id === 'group-fixed')!.props
              .repeatingGroupConfig,
          },
        });
        const fitGroup = {
          ...fitGroupBase,
          layout: {
            ...fitGroupBase.layout,
            container: { ...fitGroupBase.layout.container, mode },
            item: {
              ...fitGroupBase.layout.item,
              width: 'fit-content' as const,
              height: 'fit-content' as const,
            },
          },
        };
        page = addComponent(page, fitGroup, page.rootComponentId);
        page = addComponent(
          page,
          defaultComponentRegistry.createComponent('WebLabel', {
            id: `fit-label-${mode}`,
            name: `FitLabel${index}`,
            parentId: fitGroup.id,
            x: 8,
            y: 8,
            width: 120,
            height: 24,
            props: {
              caption: 'Template',
              autoSize: false,
              currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
            },
          }),
          fitGroup.id,
        );
      }
      project = updatePage(project, page.id, page);
      const compiled = await compileProjectToMemory(project, {
        userSources: repeatingGroupUserSources(),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      const bundle = await build({
        entryPoints: [
          fileURLToPath(new URL('./fixtures/repeating-group-browser.tsx', import.meta.url)),
        ],
        bundle: true,
        write: false,
        outdir: 'bundle',
        platform: 'browser',
        loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
        format: 'esm',
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      routes['/app.js'] = [
        'text/javascript',
        bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text,
      ];
      routes['/app.css'] = [
        'text/css',
        bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text,
      ];
      routes['/project.css'] = ['text/css', await compileTailwindStyles(project.styles)];
      routes['/project'] = ['application/json', JSON.stringify(project)];
      routes['/index.html'] = ['text/html', compiled.previewHtml!];
      await withChromium(browser!, baseUrl, async (send) => {
        let evidence:
          | {
              passed: boolean;
              cases: number;
              error?: string;
            }
          | undefined;
        await expect
          .poll(
            async () => {
              const result = await send('Runtime.evaluate', {
                expression: 'document.body.dataset.evidence',
                returnByValue: true,
              });
              const value = (
                result.result as {
                  value?: string;
                }
              )?.value;
              if (value) evidence = JSON.parse(value) as typeof evidence;
              return evidence !== undefined;
            },
            { timeout: 25000 },
          )
          .toBe(true);
        expect(evidence?.passed, evidence?.error).toBe(true);
        expect(evidence?.cases).toBeGreaterThanOrEqual(36);
        for (const mode of ['fixed', 'align-to-parent', 'row', 'column']) {
          const fit = await send('Runtime.evaluate', {
            expression: `(() => {
          const designer = document.querySelector('[data-component-id="fit-${mode}"]');
          const runtime = document.querySelector('iframe').contentDocument.querySelector('[data-webrad-id="fit-${mode}"]');
          const designerRow = designer.querySelector('[data-webrad-repeating-row]');
          const runtimeRows = [...runtime.querySelectorAll('[data-webrad-repeating-row]')];
          return { designerWidth: designer.getBoundingClientRect().width, runtimeWidth: runtime.getBoundingClientRect().width,
            designerHeight: designer.getBoundingClientRect().height, rowHeight: designerRow.getBoundingClientRect().height,
            runtimeHeight: runtime.getBoundingClientRect().height, rowsHeight: runtimeRows.reduce((height, row) => height + row.getBoundingClientRect().height, 0) + 8 };
        })()`,
            returnByValue: true,
          });
          const fitted = (
            fit.result as {
              value: {
                designerWidth: number;
                runtimeWidth: number;
                designerHeight: number;
                rowHeight: number;
                runtimeHeight: number;
                rowsHeight: number;
              };
            }
          ).value;
          expect(fitted.runtimeWidth, mode).toBeGreaterThanOrEqual(mode === 'fixed' ? 128 : 120);
          expect(Math.abs(fitted.runtimeWidth - fitted.designerWidth)).toBeLessThan(1);
          expect(fitted.designerHeight).toBeGreaterThanOrEqual(fitted.rowHeight);
          expect(fitted.runtimeHeight).toBeGreaterThanOrEqual(fitted.rowsHeight);
        }
        for (const width of [320, 640, 960]) {
          await send('Emulation.setDeviceMetricsOverride', {
            width,
            height: 700,
            deviceScaleFactor: 1,
            mobile: false,
          });
          for (const theme of ['light', 'dark'] as const) {
            for (const kind of ['configuration', 'bindings'] as const) {
              const reviewed = await send('Runtime.evaluate', {
                expression: `window.reviewRowEditor(${JSON.stringify(kind)}, ${JSON.stringify(theme)});
                  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
                    const dialog = document.querySelector('[role="dialog"]');
                    const box = dialog.getBoundingClientRect();
                    const content = dialog.querySelector('.wr-data-grid-configuration-content');
                    const footer = dialog.querySelector('footer').getBoundingClientRect();
                    resolve({ width: box.width, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                      overflow: content.scrollWidth > content.clientWidth + 1,
                      footerBottom: footer.bottom,
                      focus: document.activeElement.getAttribute('aria-label'),
                      controlsInside: [...dialog.querySelectorAll('input, select')].every(control => control.getBoundingClientRect().right <= box.right + 1) });
                  })))`,
                awaitPromise: true,
                returnByValue: true,
              });
              expect(reviewed.exceptionDetails).toBeUndefined();
              const layout = (
                reviewed.result as {
                  value: {
                    width: number;
                    left: number;
                    right: number;
                    top: number;
                    bottom: number;
                    overflow: boolean;
                    footerBottom: number;
                    focus: string;
                    controlsInside: boolean;
                  };
                }
              ).value;
              expect(layout.left, `${width}/${theme}/${kind}`).toBeGreaterThanOrEqual(0);
              expect(layout.right).toBeLessThanOrEqual(width + 1);
              expect(layout.top).toBeGreaterThanOrEqual(0);
              expect(layout.bottom).toBeLessThanOrEqual(701);
              expect(layout.footerBottom).toBeLessThanOrEqual(701);
              expect(layout.overflow).toBe(false);
              expect(layout.controlsInside).toBe(true);
              expect(layout.focus).toBe(
                kind === 'configuration' ? 'Repeating Group API Client' : 'Current row Caption',
              );
              const screenshotDirectory = process.env.WEBRAD_REPEATING_SCREENSHOT_DIR;
              if (screenshotDirectory !== undefined) {
                await fs.mkdir(screenshotDirectory, { recursive: true });
                const screenshot = await send('Page.captureScreenshot', { format: 'png' });
                await fs.writeFile(
                  path.join(screenshotDirectory, `${rowHeightMode}-${kind}-${theme}-${width}.png`),
                  Buffer.from(screenshot.data as string, 'base64'),
                );
              }
            }
          }
        }
      });
      expect(requests).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60000,
);
