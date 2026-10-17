import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { parsePage } from '@webrad/project-model';
import { withChromium } from './chromium';

const browserPath = process.env.WEBRAD_BROWSER_PATH;
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

it.runIf(browserPath !== undefined)(
  'commits and cancels native Designer gestures with one undo entry at every zoom and theme',
  async () => {
    const bundle = await build({
      entryPoints: [path.join(repositoryRoot, 'tests/fixtures/designer-interactions-browser.tsx')],
      outdir: 'bundle',
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const javascript = bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
    const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text;
    const server = createServer((request, response) => {
      const route = request.url;
      response.writeHead(200, {
        'Content-Type':
          route === '/app.js' ? 'text/javascript' : route === '/app.css' ? 'text/css' : 'text/html',
      });
      response.end(
        route === '/app.js'
          ? javascript
          : route === '/app.css'
            ? css
            : '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing Designer review server');
    try {
      await withChromium(browserPath!, `http://127.0.0.1:${address.port}`, async (send) => {
        async function evaluate<T>(expression: string): Promise<T> {
          const response = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
          return (response.result as { value: T }).value;
        }
        const paint = (): Promise<void> =>
          evaluate(
            'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
          );
        const snapshot = async () => {
          const value = await evaluate<{
            page: unknown;
            selectedIds: string[];
            undoDepth: number;
            redoDepth: number;
          }>('JSON.parse(document.querySelector("#snapshot").textContent)');
          return { ...value, page: parsePage(value.page) };
        };
        const bounds = async (id: string) =>
          (await snapshot()).page.components.find((component) => component.id === id)!.bounds;
        const center = (selector: string): Promise<{ x: number; y: number }> =>
          evaluate(
            `(() => { const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
          );
        const key = async (value: string, modifiers = 0): Promise<void> => {
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: value,
            code:
              value.startsWith('Arrow') || value === 'Escape' ? value : `Key${value.toUpperCase()}`,
            modifiers,
          });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, modifiers });
          await paint();
        };
        const mouse = async (
          type: string,
          point: { x: number; y: number },
          modifiers = 0,
        ): Promise<void> => {
          await send('Input.dispatchMouseEvent', {
            type,
            ...point,
            button: type === 'mouseMoved' ? 'none' : 'left',
            buttons: type === 'mouseReleased' ? 0 : 1,
            clickCount: type === 'mouseMoved' ? 0 : 1,
            modifiers,
          });
        };
        await evaluate(
          'new Promise((resolve, reject) => { const deadline = Date.now() + 10000; const check = () => document.querySelector(".wr-design-hit") ? resolve(true) : Date.now() > deadline ? reject(new Error("Designer did not mount")) : requestAnimationFrame(check); check(); })',
        );
        for (const theme of ['dark', 'light']) {
          for (const zoom of [50, 100, 150]) {
            await evaluate(
              `(() => { document.querySelector('#reset').click(); const theme = document.querySelector('#theme'); theme.value = ${JSON.stringify(theme)}; theme.dispatchEvent(new Event('change', { bubbles: true })); const zoom = [...document.querySelectorAll('select')].find(select => select.closest('label')?.textContent.includes('Zoom')); zoom.value = '${zoom}'; zoom.dispatchEvent(new Event('change', { bubbles: true })); })()`,
            );
            await paint();
            const selector = '.wr-design-hit[data-component-id="button"]';
            const original = await bounds('button');
            let point = await center(selector);
            await mouse('mouseMoved', point);
            await mouse('mousePressed', point);
            await mouse('mouseReleased', point);
            await paint();
            expect(await bounds('button')).toEqual(original);
            expect((await snapshot()).undoDepth).toBe(0);
            expect(
              await evaluate('document.activeElement.classList.contains("wr-page-surface")'),
            ).toBe(true);
            await mouse('mousePressed', point);
            for (let step = 1; step <= 6; step++)
              await mouse('mouseMoved', {
                x: point.x + (step * 4 * zoom) / 100,
                y: point.y + (step * 2 * zoom) / 100,
              });
            await mouse('mouseReleased', {
              x: point.x + (32 * zoom) / 100,
              y: point.y + (16 * zoom) / 100,
            });
            await paint();
            expect(await bounds('button')).toEqual({
              ...original,
              x: original.x + 32,
              y: original.y + 16,
            });
            expect((await snapshot()).undoDepth).toBe(1);
            await key('z', 2);
            expect(await bounds('button')).toEqual(original);
            await key('z', 10);
            expect((await snapshot()).redoDepth).toBe(0);
            point = await center(selector);
            const beforeCancel = await bounds('button');
            await mouse('mousePressed', point);
            await mouse('mouseMoved', { x: point.x + 30, y: point.y + 15 });
            await paint();
            await key('Escape');
            await mouse('mouseReleased', { x: point.x + 30, y: point.y + 15 });
            await paint();
            expect(await bounds('button')).toEqual(beforeCancel);
            expect((await snapshot()).undoDepth).toBe(1);
            const handle = await center(`${selector} .handle-se`);
            await mouse('mouseMoved', handle);
            await mouse('mousePressed', handle);
            await mouse('mouseReleased', {
              x: handle.x + (16 * zoom) / 100,
              y: handle.y + (8 * zoom) / 100,
            });
            await paint();
            expect(await bounds('button')).toEqual({
              ...beforeCancel,
              width: beforeCancel.width + 16,
              height: beforeCancel.height + 8,
            });
            expect((await snapshot()).undoDepth).toBe(2);
            await key('ArrowRight');
            expect((await bounds('button')).x).toBe(beforeCancel.x + 1);
            const marginPoint = await center(selector);
            await mouse('mouseMoved', marginPoint);
            await mouse('mousePressed', marginPoint);
            await mouse('mouseReleased', { x: 2, y: marginPoint.y });
            await paint();
            expect((await bounds('button')).x).toBe(0);
            const panelSelector = '.wr-design-hit[data-component-id="panel"]';
            const panel = await bounds('panel');
            const child = await bounds('child');
            const panelPoint = await center(panelSelector);
            await mouse('mouseMoved', panelPoint);
            await mouse('mousePressed', panelPoint);
            await mouse('mouseReleased', panelPoint);
            await paint();
            const childPoint = await center('.wr-design-hit[data-component-id="child"]');
            await mouse('mouseMoved', childPoint);
            await mouse('mousePressed', childPoint, 8);
            await mouse('mouseReleased', childPoint, 8);
            await paint();
            expect((await snapshot()).selectedIds).toEqual(['panel', 'child']);
            await mouse('mouseMoved', panelPoint);
            await mouse('mousePressed', panelPoint);
            await mouse('mouseMoved', {
              x: panelPoint.x + (24 * zoom) / 100,
              y: panelPoint.y + (16 * zoom) / 100,
            });
            await paint();
            const projectedChild = await center('.wr-design-hit[data-component-id="child"]');
            expect(projectedChild.x - childPoint.x).toBeCloseTo((24 * zoom) / 100, 0);
            expect(projectedChild.y - childPoint.y).toBeCloseTo((16 * zoom) / 100, 0);
            await mouse('mouseReleased', {
              x: panelPoint.x + (24 * zoom) / 100,
              y: panelPoint.y + (16 * zoom) / 100,
            });
            await paint();
            expect(await bounds('panel')).toEqual({ ...panel, x: panel.x + 24, y: panel.y + 16 });
            expect(await bounds('child')).toEqual(child);
            const childSelector = '.wr-design-hit[data-component-id="child"]';
            const selectButton = await center(selector);
            await mouse('mouseMoved', selectButton);
            await mouse('mousePressed', selectButton);
            await mouse('mouseReleased', selectButton);
            await paint();
            const nestedPoint = await center(childSelector);
            await mouse('mouseMoved', nestedPoint);
            await mouse('mousePressed', nestedPoint);
            await mouse('mouseMoved', { x: nestedPoint.x + 400, y: nestedPoint.y + 200 });
            await paint();
            expect((await snapshot()).selectedIds).toEqual(['child']);
            const constrainedPreview = await center(childSelector);
            await mouse('mouseReleased', { x: nestedPoint.x + 400, y: nestedPoint.y + 200 });
            await paint();
            const constrainedCommit = await center(childSelector);
            expect(constrainedCommit.x).toBeCloseTo(constrainedPreview.x, 1);
            expect(constrainedCommit.y).toBeCloseTo(constrainedPreview.y, 1);
            expect(
              await evaluate(
                `(() => { const host = document.querySelector('[data-designer-parent-id="panel"]'); const parent = host.getBoundingClientRect(); const child = document.querySelector('${childSelector}').getBoundingClientRect(); return child.right <= parent.left + (host.clientLeft + host.clientWidth) * ${zoom / 100} + 0.1 && child.bottom <= parent.top + (host.clientTop + host.clientHeight) * ${zoom / 100} + 0.1; })()`,
              ),
            ).toBe(true);
            const beforeMarquee = await snapshot();
            const blankPoint = await evaluate<{ x: number; y: number }>(
              `(() => { const rect = document.querySelector('.wr-page-surface').getBoundingClientRect(); return { x: rect.left + 650 * ${zoom / 100}, y: rect.top + 350 * ${zoom / 100} }; })()`,
            );
            await mouse('mouseMoved', blankPoint);
            await mouse('mousePressed', blankPoint);
            await mouse('mouseMoved', { x: blankPoint.x - 100, y: blankPoint.y - 80 });
            await paint();
            await key('Escape');
            await mouse('mouseReleased', { x: blankPoint.x - 100, y: blankPoint.y - 80 });
            await paint();
            expect((await snapshot()).selectedIds).toEqual(beforeMarquee.selectedIds);
            expect((await snapshot()).undoDepth).toBe(beforeMarquee.undoDepth);
            const dropPoint = await evaluate<{
              x: number;
              y: number;
              localX: number;
              localY: number;
            }>(
              `(() => { const host = document.querySelector('[data-designer-parent-id="panel"]'); const rect = host.getBoundingClientRect(); const scale = ${zoom / 100}; const originX = rect.left + (host.clientLeft - host.scrollLeft) * scale; const originY = rect.top + (host.clientTop - host.scrollTop) * scale; const x = Math.round(originX + 100 * scale); const y = Math.round(originY + 80 * scale); return { x, y, localX: (x - originX) / scale, localY: (y - originY) / scale }; })()`,
            );
            const dragData = {
              items: [{ mimeType: 'application/x-webrad-component', data: 'WebButton' }],
              dragOperationsMask: 1,
            };
            for (const type of ['dragEnter', 'dragOver', 'drop']) {
              await send('Input.dispatchDragEvent', {
                type,
                x: dropPoint.x,
                y: dropPoint.y,
                data: dragData,
              });
            }
            await paint();
            const dropped = (await snapshot()).page.components.find((component) =>
              component.name.startsWith('Dropped'),
            );
            expect(
              dropped?.parentId,
              JSON.stringify({
                theme,
                zoom,
                dropPoint,
                target: await evaluate(
                  `document.elementFromPoint(${dropPoint.x}, ${dropPoint.y})?.outerHTML`,
                ),
                count: (await snapshot()).page.components.length,
              }),
            ).toBe('panel');
            expect(dropped?.bounds.x).toBeCloseTo(dropPoint.localX, 1);
            expect(dropped?.bounds.y).toBeCloseTo(dropPoint.localY, 1);
            const paintedDrop = await evaluate<{ x: number; y: number }>(
              `(() => { const rect = document.querySelector('.wr-design-hit[data-component-id="${dropped?.id}"]').getBoundingClientRect(); return { x: rect.left, y: rect.top }; })()`,
            );
            expect(paintedDrop.x).toBeCloseTo(dropPoint.x, 0);
            expect(paintedDrop.y).toBeCloseTo(dropPoint.y, 0);
          }
        }
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  90_000,
);
