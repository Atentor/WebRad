import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { reportBuilderProject, reportBuilderTemplate } from './fixtures/report-builder';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'edits, imports and exports persisted report templates in a real browser at IDE sizes',
  async () => {
    const routes: Record<string, readonly [string, string]> = {};
    const server = createServer((request, response) => {
      const [type, body] = routes[request.url ?? ''] ?? [
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      ];
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing browser test port.');
    const directory = path.resolve('out/report-builder-review');
    const downloads = path.join(directory, 'downloads', String(Date.now()));
    await fs.mkdir(downloads, { recursive: true });
    const importPath = path.join(directory, 'import.report.json');
    await fs.writeFile(
      importPath,
      JSON.stringify({ ...reportBuilderTemplate(), name: 'File import statement' }),
    );
    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const bundle = await build({
        entryPoints: [
          fileURLToPath(new URL('./fixtures/report-builder-editor-browser.tsx', import.meta.url)),
        ],
        bundle: true,
        write: false,
        outdir: 'bundle',
        platform: 'browser',
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
      routes['/project'] = ['application/json', JSON.stringify(reportBuilderProject(baseUrl))];
      routes['/external.json'] = [
        'application/json',
        JSON.stringify({ ...reportBuilderTemplate(), name: 'URL import statement' }),
      ];
      await withChromium(browser!, baseUrl, async (send) => {
        const evaluate = async <T>(expression: string): Promise<T> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          expect(result.exceptionDetails, JSON.stringify(result.exceptionDetails)).toBeUndefined();
          return (result.result as { value: T }).value;
        };
        await expect
          .poll(() => evaluate<boolean>("document.body.dataset.ready === 'true'"), {
            timeout: 15_000,
          })
          .toBe(true);
        await send('Emulation.setDeviceMetricsOverride', {
          width: 1280,
          height: 700,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const click = async (text: string): Promise<void> => {
          await evaluate(
            `document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(text))} + ']')?.click() ?? [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)})?.click()`,
          );
        };
        const setValue = async (label: string, value: string): Promise<void> => {
          await evaluate(
            `(() => { const input = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`,
          );
        };
        const value = (label: string): Promise<string> =>
          evaluate(
            `document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']').value`,
          );
        await click('Select Customer name');
        await evaluate(`document.querySelector('[aria-label="Select Customer name"]').focus()`);
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'ArrowRight',
          code: 'ArrowRight',
        });
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'ArrowRight',
          code: 'ArrowRight',
        });
        expect(await value('Report x (mm)')).toBe('0.5');
        const box = await evaluate<{ x: number; y: number }>(
          `(() => { const rect = document.querySelector('[aria-label="Select Customer name"]').getBoundingClientRect(); return { x: rect.left + 10, y: rect.top + 7 }; })()`,
        );
        await send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: box.x,
          y: box.y,
          button: 'left',
          clickCount: 1,
        });
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: box.x + 15,
          y: box.y,
          button: 'left',
          buttons: 1,
        });
        await send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: box.x + 15,
          y: box.y,
          button: 'left',
          clickCount: 1,
        });
        expect(Number(await value('Report x (mm)'))).toBeCloseTo(16 / 3);
        await click('Undo report edit');
        expect(Number(await value('Report x (mm)'))).toBe(0.5);
        await click('Redo report edit');
        expect(Number(await value('Report x (mm)'))).toBeCloseTo(16 / 3);
        await setValue('Report width (mm)', '100');
        const handle = await evaluate<{ x: number; y: number }>(
          `(() => { const rect = document.querySelector('[aria-label="Resize Customer name"]').getBoundingClientRect(); return { x: rect.left + 4, y: rect.top + 4 }; })()`,
        );
        await send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: handle.x,
          y: handle.y,
          button: 'left',
          clickCount: 1,
        });
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: handle.x + 15,
          y: handle.y,
          button: 'left',
          buttons: 1,
        });
        await send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: handle.x + 15,
          y: handle.y,
          button: 'left',
          clickCount: 1,
        });
        expect(Number(await value('Report width (mm)'))).toBeCloseTo(104);
        expect(Number(await value('Report y (mm)'))).toBe(0);
        const gesture = async (label: string, dx: number, dy: number): Promise<void> => {
          const point = await evaluate<{ x: number; y: number }>(
            `(() => { const rect = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']').getBoundingClientRect(); return { x: rect.left + 3, y: rect.top + 3 }; })()`,
          );
          await send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            ...point,
            button: 'left',
            clickCount: 1,
          });
          await send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: point.x + dx,
            y: point.y + dy,
            button: 'left',
            buttons: 1,
          });
          await send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: point.x + dx,
            y: point.y + dy,
            button: 'left',
            clickCount: 1,
          });
        };
        for (const zoom of [0.5, 1.25]) {
          await setValue('Report canvas zoom', String(zoom));
          await setValue('Report x (mm)', '0.5');
          await setValue('Report y (mm)', '0.5');
          await setValue('Report width (mm)', '100');
          await setValue('Report height (mm)', '4');
          await gesture('Select Customer name', 0, 0);
          expect(Number(await value('Report x (mm)'))).toBe(0.5);
          expect(Number(await value('Report y (mm)'))).toBe(0.5);
          await gesture('Select Customer name', 11, 2);
          expect(Number(await value('Report x (mm)'))).toBeCloseTo(zoom === 0.5 ? 8 : 8 / 3);
          expect(Number(await value('Report y (mm)'))).toBeCloseTo(zoom === 0.5 ? 8 / 3 : 0);
          await gesture('Resize Customer name', 11, 2);
          expect(Number(await value('Report width (mm)'))).toBeCloseTo(
            zoom === 0.5 ? 320 / 3 : 104,
          );
          expect(Number(await value('Report height (mm)'))).toBeCloseTo(16 / 3);
          await click('Undo report edit');
          expect(Number(await value('Report width (mm)'))).toBe(100);
          expect(Number(await value('Report height (mm)'))).toBe(4);
          await click('Redo report edit');
          expect(Number(await value('Report height (mm)'))).toBeCloseTo(16 / 3);
        }
        await setValue('Report row field', '/id');
        // Start native palette drags with the mouse, then deliver the intercepted drop via CDP.
        // This exercises the real draggable button and its payload, zoom and scrolled geometry.
        await send('Input.setInterceptDrags', { enabled: true });
        for (const zoom of [0.5, 1.25]) {
          await setValue('Report canvas zoom', String(zoom));
          const backgrounds = await evaluate<string[]>(
            `[...document.querySelectorAll('.wr-report-canvas-scroll, .wr-report-paper, .wr-report-band, .wr-report-element-repeater')].map(element => getComputedStyle(element).backgroundImage)`,
          );
          expect(backgrounds).toEqual(backgrounds.map(() => 'none'));
          for (const type of ['text', 'image', 'line', 'repeater']) {
            const count = await evaluate<number>(
              `document.querySelectorAll('.wr-report-element').length`,
            );
            await click(`Add report ${type}`);
            expect(
              await evaluate<number>(`document.querySelectorAll('.wr-report-element').length`),
            ).toBe(count);
            await evaluate(`(() => {
              delete document.body.dataset.paletteDrag;
              document.addEventListener('dragstart', event => {
                document.body.dataset.paletteDrag = String(event.isTrusted) + ':' + event.dataTransfer.getData('application/x-webrad-report-component');
              }, { once: true });
              const scroll = document.querySelector('.wr-report-canvas-scroll');
              scroll.scrollTop = 0;
              scroll.scrollLeft = ${zoom === 1.25 ? 40 : 0};
            })()`);
            const source = await evaluate<{ x: number; y: number }>(
              `(() => { const box = document.querySelector('[aria-label="Add report ${type}"]').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`,
            );
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...source });
            await send('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              ...source,
              button: 'left',
              clickCount: 1,
            });
            await send('Input.dispatchMouseEvent', {
              type: 'mouseMoved',
              x: source.x + 15,
              y: source.y + 5,
              button: 'left',
              buttons: 1,
            });
            await expect
              .poll(() => evaluate<string>('document.body.dataset.paletteDrag'))
              .toBe(`true:${type}`);
            const destination = await evaluate<{
              x: number;
              y: number;
              localX: number;
              localY: number;
            }>(
              `(() => { const band = document.querySelector('.wr-report-band'); const box = band.getBoundingClientRect(); const x = Math.round(box.left + band.clientLeft + 30 * ${3 * zoom}); const y = Math.round(box.top + band.clientTop + ${3 * zoom}); return { x, y, localX: Math.round((x - box.left - band.clientLeft) / ${8 * zoom}) * 8 / 3, localY: Math.round((y - box.top - band.clientTop) / ${8 * zoom}) * 8 / 3 }; })()`,
            );
            for (const event of ['dragEnter', 'dragOver', 'drop']) {
              await send('Input.dispatchDragEvent', {
                type: event,
                ...destination,
                data: {
                  items: [{ mimeType: 'application/x-webrad-report-component', data: type }],
                  dragOperationsMask: 1,
                },
              });
            }
            await send('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              ...destination,
              button: 'left',
              clickCount: 1,
            });
            await expect
              .poll(() =>
                evaluate<number>(`document.querySelectorAll('.wr-report-element').length`),
              )
              .toBe(count + 1);
            expect(Number(await value('Report x (mm)'))).toBeCloseTo(
              type === 'repeater' ? 0 : destination.localX,
            );
            expect(Number(await value('Report y (mm)'))).toBeCloseTo(destination.localY);
            await click('Undo report edit');
            expect(
              await evaluate<number>(`document.querySelectorAll('.wr-report-element').length`),
            ).toBe(count);
          }
        }
        await send('Input.setInterceptDrags', { enabled: false });
        await setValue('Report canvas zoom', '1');
        await click('Parameters (1)');
        await setValue('Parameter 1 name', 'Heading');
        await setValue('Parameter 1 default', 'Annual customers');
        await click('Save template');
        await expect.poll(() => evaluate<number>('window.reportEditorReview.saveCount()')).toBe(1);
        expect(
          await evaluate<string>('window.reportEditorReview.snapshot().parameters[0].name'),
        ).toBe('Heading');
        expect(
          await evaluate<string>(
            'window.reportEditorReview.snapshot().bands.find(band => band.kind === "detail").elements[0].children[0].value.path',
          ),
        ).toBe('/id');
        await evaluate('window.reportEditorReview.open("dark")');
        await setValue('Report template name', 'Discarded edits');
        await click('Cancel');
        await evaluate('window.reportEditorReview.open("dark")');
        expect(await value('Report template name')).toBe('Clientes');
        await click('Import URL');
        await setValue('Report template URL', `${baseUrl}/external.json`);
        await click('Load template');
        await expect.poll(() => value('Report template name')).toBe('URL import statement');
        await click('Save template');
        await evaluate('window.reportEditorReview.open("dark")');
        const document = await send('DOM.getDocument');
        const input = await send('DOM.querySelector', {
          nodeId: (document.root as { nodeId: number }).nodeId,
          selector: '[aria-label="Import report template file"]',
        });
        await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [importPath] });
        await expect.poll(() => value('Report template name')).toBe('File import statement');
        await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await click('Export JSON');
        await expect
          .poll(async () =>
            (await fs.readdir(downloads)).some(
              (file) => file.startsWith('File import statement') && file.endsWith('.json'),
            ),
          )
          .toBe(true);
        const exported = (await fs.readdir(downloads)).find(
          (file) => file.startsWith('File import statement') && file.endsWith('.json'),
        )!;
        expect(JSON.parse(await fs.readFile(path.join(downloads, exported), 'utf8'))).toMatchObject(
          { schemaVersion: 1, name: 'File import statement' },
        );
        await click('Save template');
        await evaluate('window.reportEditorReview.open("dark")');
        for (const paper of ['A4', 'Letter'])
          for (const orientation of ['portrait', 'landscape'])
            for (const zoom of [0.5, 1.25]) {
              await click('Page setup');
              await setValue('Report paper size', paper);
              await setValue('Report orientation', orientation);
              await setValue('Report bottom margin', '23');
              await click('Design');
              await setValue('Report canvas zoom', String(zoom));
              const geometry = await evaluate<{
                footerGap: number;
                footerHeight: number;
                gapAfterSummary: number;
                gapBeforeSummary: number;
                paperHeight: number;
              }>(
                `(() => { const paper = document.querySelector('.wr-report-paper').getBoundingClientRect(); const footer = document.querySelector('[data-report-band-kind="pageFooter"]').getBoundingClientRect(); const summary = document.querySelector('[data-report-band-kind="summary"]').getBoundingClientRect(); const detail = document.querySelector('[data-report-band-kind="detail"]').getBoundingClientRect(); return { footerGap: paper.bottom - footer.bottom, footerHeight: footer.height, gapAfterSummary: footer.top - summary.bottom, gapBeforeSummary: summary.top - detail.bottom, paperHeight: paper.height }; })()`,
              );
              const height =
                orientation === 'portrait'
                  ? paper === 'A4'
                    ? 297
                    : 279.4
                  : paper === 'A4'
                    ? 210
                    : 215.9;
              expect(geometry.paperHeight).toBeCloseTo(height * 3 * zoom, 1);
              expect(geometry.footerGap).toBeCloseTo(23 * 3 * zoom, 1);
              expect(geometry.footerHeight).toBeCloseTo(10 * 3 * zoom, 1);
              expect(geometry.gapAfterSummary).toBeGreaterThan(0);
              expect(geometry.gapBeforeSummary).toBeCloseTo(0, 1);
            }
        // The footer remains editable at the bottom of the scrolled paper.
        await evaluate(
          `document.querySelector('[data-report-band-kind="pageFooter"]').scrollIntoView({ block: 'center' })`,
        );
        await evaluate(
          `document.querySelector('[data-report-band-kind="pageFooter"] .wr-report-band-tag').click()`,
        );
        await setValue('Report band height (mm)', '14');
        const footerGap = await evaluate<number>(
          `(() => { const paper = document.querySelector('.wr-report-paper').getBoundingClientRect(); const footer = document.querySelector('[data-report-band-kind="pageFooter"]').getBoundingClientRect(); return paper.bottom - footer.bottom; })()`,
        );
        expect(footerGap).toBeCloseTo(23 * 3 * 1.25, 1);
        expect(
          await evaluate<number>(
            `document.querySelector('[data-report-band-kind="pageFooter"]').getBoundingClientRect().height`,
          ),
        ).toBeCloseTo(14 * 3 * 1.25, 1);
        const footerScreenshot = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'editor-page-footer.png'),
          Buffer.from(footerScreenshot.data as string, 'base64'),
        );
        await click('Cancel');
        for (const width of [1280, 1000])
          for (const theme of ['dark', 'light']) {
            await send('Emulation.setDeviceMetricsOverride', {
              width,
              height: 700,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await evaluate(`window.reportEditorReview.open(${JSON.stringify(theme)})`);
            await click('Select Customer name');
            const layout = await evaluate<{
              right: number;
              bottom: number;
              footerBottom: number;
              overflow: boolean;
              controlsInside: boolean;
            }>(
              `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { const dialog = document.querySelector('[role="dialog"]'); const box = dialog.getBoundingClientRect(); resolve({ right: box.right, bottom: box.bottom, footerBottom: dialog.querySelector('footer').getBoundingClientRect().bottom, overflow: dialog.scrollWidth > dialog.clientWidth + 1, controlsInside: [...dialog.querySelectorAll('input:not([type="file"]), select')].every(control => control.getBoundingClientRect().right <= box.right + 1) }); })))`,
            );
            expect(layout.right).toBeLessThanOrEqual(width);
            expect(layout.bottom).toBeLessThanOrEqual(700);
            expect(layout.footerBottom).toBeLessThanOrEqual(700);
            expect(layout.overflow).toBe(false);
            expect(layout.controlsInside).toBe(true);
            const screenshot = await send('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(
              path.join(directory, `editor-${theme}-${String(width)}.png`),
              Buffer.from(screenshot.data as string, 'base64'),
            );
          }
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60_000,
);
