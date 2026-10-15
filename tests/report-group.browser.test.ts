import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import { parseReportTemplate, type WebReportTemplate } from '@webrad/runtime/report-template';
import { publishPreviewHtml, closePreviewServer } from '../apps/ide/main/preview-server';
import { reportBuilderSources } from './fixtures/report-builder';
import { reportGroupProject } from './fixtures/report-builder-group';
import { nestedReportData } from './fixtures/report-builder-nested';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'authors nested Groups with native drops and rounded styles, saves/reopens and renders their compiled PDF',
  async () => {
    let requests = 0;
    const routes: Record<string, readonly [string, string]> = {};
    const server = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      if (request.url === '/customers') requests++;
      const [type, body] = routes[request.url ?? ''] ?? [
        'text/html',
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"><style>body{margin:0}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      ];
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing server port.');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const directory = path.resolve('out/report-builder-review');
    const project = reportGroupProject(baseUrl);
    let saved: WebReportTemplate | undefined;
    try {
      await fs.mkdir(directory, { recursive: true });
      routes['/project'] = ['application/json', JSON.stringify(project)];
      routes['/customers'] = ['application/json', JSON.stringify(nestedReportData)];
      const bundle = await build({
        entryPoints: ['tests/fixtures/report-builder-editor-browser.tsx'],
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
          .poll(() => evaluate('document.body.dataset.ready ?? document.body.dataset.error'), {
            timeout: 15_000,
          })
          .toBe('true');
        await send('Emulation.setDeviceMetricsOverride', {
          width: 1600,
          height: 950,
          deviceScaleFactor: 1,
          mobile: false,
        });
        const click = async (label: string): Promise<void> => {
          await evaluate(
            `(() => { const button = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']') ?? [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button'); button.click(); })()`,
          );
        };
        const setValue = async (label: string, value: string): Promise<void> => {
          await evaluate(
            `(() => { const input = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`,
          );
        };
        await click('Add report group');
        expect(await evaluate('document.querySelectorAll(".wr-report-element-group").length')).toBe(
          3,
        );
        await send('Input.setInterceptDrags', { enabled: true });
        const drag = async (type: string, target: string, offset = 10): Promise<void> => {
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
          const point = await evaluate<{ x: number; y: number }>(
            `(() => { const box = document.querySelector(${JSON.stringify(target)}).getBoundingClientRect(); return { x: box.left + ${offset}, y: box.top + 2 }; })()`,
          );
          for (const event of ['dragEnter', 'dragOver', 'drop'])
            await send('Input.dispatchDragEvent', {
              type: event,
              ...point,
              data: {
                items: [{ mimeType: 'application/x-webrad-report-component', data: type }],
                dragOperationsMask: 1,
              },
            });
          await send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            ...point,
            button: 'left',
            clickCount: 1,
          });
        };
        await drag('group', '[aria-label="Select Report group"] > [data-report-group-content]');
        await setValue('Report element name', 'Browser group');
        await setValue('Report height (mm)', '6');
        await setValue('Report group border width (mm)', '0.6');
        await setValue('Report group corner radius (mm)', '2');
        await setValue('Report group border color', '#007acc');
        await setValue('Report group border style', 'dashed');
        await click('Report group background');
        await setValue('Report group background color', '#e0f2fe');
        await drag('group', '[aria-label="Select Browser group"] > [data-report-group-content]');
        await setValue('Report element name', 'Inner group');
        await setValue('Report group border width (mm)', '0');
        const target = '[aria-label="Select Inner group"] > [data-report-group-content]';
        await drag('text', target);
        await setValue('Report element name', 'Group caption');
        await setValue('Report text', 'Browser Group');
        await drag('image', target, 250);
        await setValue(
          'Report image URL',
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
        );
        await drag('line', target, 355);
        await send('Input.setInterceptDrags', { enabled: false });
        await click('Select customer-name (column 2)');
        expect(
          await evaluate(`document.querySelector('[aria-label="Report row field"]').value`),
        ).toBe('/name');
        for (const zoom of [0.5, 1.25]) {
          await setValue('Report canvas zoom', String(zoom));
          const geometry = await evaluate<{ radius: number; width: number; textX: number }>(
            `(() => { const group = document.querySelector('[aria-label="Select Browser group"]'); const content = group.querySelector('[data-report-group-content]').getBoundingClientRect(); const text = group.querySelector('[aria-label="Select Group caption"]').getBoundingClientRect(); return { radius: parseFloat(getComputedStyle(group).borderRadius), width: content.width, textX: text.left - content.left }; })()`,
          );
          expect(geometry.radius).toBeCloseTo(2 * 3 * zoom);
          expect(geometry.width).toBeCloseTo(180 * 3 * zoom);
          expect(geometry.textX).toBeCloseTo(8 * zoom);
        }
        await setValue('Report canvas zoom', '1');
        await click('Select Browser group');
        await click('Undo report edit');
        expect(await evaluate('document.querySelectorAll(".wr-report-element-line").length')).toBe(
          0,
        );
        await click('Redo report edit');
        expect(await evaluate('document.querySelectorAll(".wr-report-element-line").length')).toBe(
          1,
        );
        expect(
          await evaluate('document.querySelector("[role=alert]")?.textContent ?? null'),
        ).toBeNull();
        const dark = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'group-editor-dark.png'),
          Buffer.from(dark.data as string, 'base64'),
        );
        await click('Save template');
        saved = parseReportTemplate(await evaluate('window.reportEditorReview.snapshot()'));
        expect(await evaluate('window.reportEditorReview.saveCount()')).toBe(1);
        const root = saved.bands[0]!.elements[0]!;
        if (root.type !== 'group') throw new Error('Missing Group.');
        expect(root.children).toHaveLength(2);
        expect(root.children[1]).toMatchObject({
          type: 'group',
          name: 'Browser group',
          appearance: { borderRadius: 2, borderWidth: 0.6, backgroundColor: '#e0f2fe' },
        });
        await evaluate('window.reportEditorReview.open("light")');
        await click('Select Browser group');
        expect(
          await evaluate(
            `document.querySelector('[aria-label="Report group corner radius (mm)"]').value`,
          ),
        ).toBe('2');
        const light = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'group-editor-light.png'),
          Buffer.from(light.data as string, 'base64'),
        );
      });
      expect(saved).toBeDefined();
      const compiled = await compileProjectToMemory(reportGroupProject(baseUrl, saved!), {
        userSources: reportBuilderSources(),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      const url = await publishPreviewHtml(9012, compiled.previewHtml!);
      await withChromium(browser!, url, async (send) => {
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
          });
          expect(result.exceptionDetails).toBeUndefined();
          return (result.result as { value: unknown }).value;
        };
        const root = 'document.querySelector("[data-webrad-page-id]")';
        await expect
          .poll(() => evaluate(`${root}?.dataset.ready ?? ${root}?.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('true');
        await evaluate('document.querySelector("[data-webrad-name=PDF]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.pages ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('1');
        const bytes = Buffer.from((await evaluate(`${root}.dataset.pdf`)) as string, 'base64');
        await fs.writeFile(path.join(directory, 'group-preview.pdf'), bytes);
        const document = await PDFDocument.load(bytes);
        const contents = document.context
          .enumerateIndirectObjects()
          .flatMap(([, object]) =>
            object instanceof PDFRawStream
              ? [new TextDecoder().decode(decodePDFRawStream(object).decode())]
              : [],
          )
          .join('\n');
        expect(contents).toContain(' c\n');
        expect(contents).toContain(' d');
        expect(
          contents.split(Buffer.from('Browser Group').toString('hex').toUpperCase()),
        ).toHaveLength(2);
        for (const customer of nestedReportData.customers)
          for (const order of customer.orders)
            expect(
              contents.split(Buffer.from(order.product).toString('hex').toUpperCase()),
            ).toHaveLength(2);
        await evaluate('document.querySelector("[data-webrad-name=Modal]").click()');
        await expect
          .poll(() =>
            evaluate(
              'Boolean(document.querySelector("dialog[data-report-preview][open] iframe[src^=blob]"))',
            ),
          )
          .toBe(true);
        await evaluate('new Promise(resolve => setTimeout(resolve, 1000))');
        const preview = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'group-pdf-preview.png'),
          Buffer.from(preview.data as string, 'base64'),
        );
        expect(requests).toBe(1);
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closePreviewServer();
    }
  },
  90_000,
);
