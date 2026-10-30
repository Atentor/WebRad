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
import {
  nestedReportProject,
  nestedReportData,
  nestedReportTemplate,
} from './fixtures/report-builder-nested';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'edits nested report sections and appearance with native palette drops, then renders the saved template in compiled Preview',
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
    let saved: WebReportTemplate = nestedReportTemplate();
    try {
      await fs.mkdir(directory, { recursive: true });
      const project = nestedReportProject(baseUrl);
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
            `(() => { const button = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']') ?? [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)}); button.click(); })()`,
          );
        };
        const setValue = async (label: string, value: string): Promise<void> => {
          await evaluate(
            `(() => { const input = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); if (input.type === 'color') input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
          );
        };
        await click('Select Customers');
        await setValue('Report columns', '3');
        await setValue('Report columns', '2');
        await setValue('Report header columns', '2');
        await setValue('Report header column gap (mm)', '4');
        await setValue('Report footer columns', '3');
        await setValue('Report footer column gap (mm)', '3');
        await setValue('Report repeater background color', '#eef7ff');
        await setValue('Report border width (mm)', '0.4');
        await click('Select group-header');
        await setValue('Report text', 'Browser header');
        await click('Select order-product');
        expect(
          await evaluate(`document.querySelector('[aria-label="Report row field"]').value`),
        ).toBe('/product');
        await click('Select order-header');
        expect(
          await evaluate(`document.querySelector('[aria-label="Report row field"]').value`),
        ).toBe('/name');
        await send('Input.setInterceptDrags', { enabled: true });
        const drag = async (type: string, target: string, bottom = false): Promise<void> => {
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
            `(() => { const box = document.querySelector(${JSON.stringify(target)}).getBoundingClientRect(); return { x: box.left + 10, y: ${bottom ? 'box.bottom - 2' : 'box.top + 2'} }; })()`,
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
        await drag(
          'repeater',
          '[aria-label="Select Customers"] > [data-report-repeater-section="row"] > [data-report-section-column="1"]',
          true,
        );
        await expect
          .poll(() =>
            evaluate(
              'document.querySelectorAll(\'.wr-report-element-repeater[data-report-primary="true"]\').length',
            ),
          )
          .toBe(3);
        await setValue('Report element name', 'Extra list');
        expect(
          await evaluate(
            `document.querySelector('[aria-label="Select Extra list (column 2)"]').getAttribute('aria-pressed')`,
          ),
        ).toBe('true');
        await setValue('Report height (mm)', '6');
        await setValue('Report y (mm)', '28');
        await setValue('Report repeater list source', 'api');
        await setValue('Report API Client', 'customers-api');
        await setValue('Report response list', '/codes');
        await drag(
          'text',
          '[aria-label="Select Extra list (column 2)"] > [data-report-repeater-section="row"] > [data-report-section-column="0"]',
        );
        await setValue('Report element name', 'Extra value');
        expect(
          Number(await evaluate(`document.querySelector('[aria-label="Report x (mm)"]').value`)),
        ).toBeCloseTo(8 / 3);
        await setValue('Report value source', 'row');
        for (const [section, column, name] of [
          ['header', 1, 'Header second'],
          ['footer', 1, 'Footer middle'],
          ['footer', 2, 'Footer right'],
        ] as const) {
          await drag(
            'text',
            `[aria-label="Select Customers"] > [data-report-repeater-section="${section}"] > [data-report-section-column="${column}"]`,
          );
          await setValue('Report element name', name);
          await setValue('Report text', name);
          expect(
            await evaluate(`document.querySelector('[aria-label="Report section column"]').value`),
          ).toBe(String(column));
        }
        await send('Input.setInterceptDrags', { enabled: false });
        expect(
          await evaluate('document.querySelector("[role=alert]")?.textContent ?? null'),
        ).toBeNull();
        await click('Select Customers');
        for (const zoom of [0.5, 1.25]) {
          await setValue('Report canvas zoom', String(zoom));
          const geometry = await evaluate<{
            headerX: number;
            headerWidth: number;
            footerX: number;
            footerWidth: number;
          }>(
            `(() => { const group = document.querySelector('[aria-label="Select Customers"]'); const root = group.getBoundingClientRect(); const header = group.querySelector(':scope > [data-report-repeater-section="header"] > [data-report-section-column="1"]').getBoundingClientRect(); const footer = group.querySelector(':scope > [data-report-repeater-section="footer"] > [data-report-section-column="2"]').getBoundingClientRect(); return { headerX: header.left - root.left, headerWidth: header.width, footerX: footer.left - root.left, footerWidth: footer.width }; })()`,
          );
          expect(geometry.headerX).toBeCloseTo(92 * 3 * zoom, 1);
          expect(geometry.headerWidth).toBeCloseTo(88 * 3 * zoom, 1);
          expect(geometry.footerX).toBeCloseTo(122 * 3 * zoom, 1);
          expect(geometry.footerWidth).toBeCloseTo(58 * 3 * zoom, 1);
        }
        await setValue('Report canvas zoom', '1');
        const style = await evaluate<{ color: string; width: string }>(
          `(() => { const group = document.querySelector('[aria-label="Select Customers"]'); return { color: getComputedStyle(group).backgroundColor, width: getComputedStyle(group.querySelector(':scope > .wr-report-repeater-border')).borderTopWidth }; })()`,
        );
        expect(style.color).toBe('rgb(238, 247, 255)');
        expect(Number.parseFloat(style.width)).toBeGreaterThan(0);
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'nested-editor-dark.png'),
          Buffer.from(screenshot.data as string, 'base64'),
        );
        await click('Save template');
        await expect.poll(() => evaluate('window.reportEditorReview.saveCount()')).toBe(1);
        saved = parseReportTemplate(await evaluate('window.reportEditorReview.snapshot()'));
        await evaluate('window.reportEditorReview.open("light")');
        expect(
          await evaluate(
            'document.querySelectorAll(\'.wr-report-element-repeater[data-report-primary="true"]\').length',
          ),
        ).toBe(3);
        await click('Select Extra value');
        expect(
          await evaluate(`document.querySelector('[aria-label="Report row field"]').value`),
        ).toBe('');
        const light = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          path.join(directory, 'nested-editor-light.png'),
          Buffer.from(light.data as string, 'base64'),
        );
      });
      const persisted = {
        ...project,
        pages: project.pages.map((page) => ({
          ...page,
          components: page.components.map((component) =>
            component.type !== 'WebReportBuilder'
              ? component
              : { ...component, props: { ...component.props, reportTemplate: saved } },
          ),
        })),
      };
      const compiled = await compileProjectToMemory(persisted, {
        userSources: reportBuilderSources(),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      const url = await publishPreviewHtml(9011, compiled.previewHtml!);
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
        await fs.writeFile(path.join(directory, 'nested-preview.pdf'), bytes);
        const document = await PDFDocument.load(bytes);
        const contents = document.context
          .enumerateIndirectObjects()
          .flatMap(([, object]) =>
            object instanceof PDFRawStream
              ? [new TextDecoder().decode(decodePDFRawStream(object).decode())]
              : [],
          )
          .join('\n');
        const encoded = (value: string): string =>
          `<${Buffer.from(value).toString('hex').toUpperCase()}>`;
        expect(contents.split(encoded('Browser header'))).toHaveLength(2);
        expect(contents.split(encoded('Customer footer'))).toHaveLength(2);
        for (const value of ['Header second', 'Footer middle', 'Footer right'])
          expect(contents.split(encoded(value))).toHaveLength(2);
        for (const row of nestedReportData.customers)
          for (const order of row.orders)
            expect(contents.split(encoded(order.product))).toHaveLength(2);
        expect(contents.split(encoded('EXTRA'))).toHaveLength(9);
        expect(contents).toContain(' d');
        await evaluate('document.querySelector("[data-webrad-name=Modal]").click()');
        await expect
          .poll(() =>
            evaluate(
              'Boolean(document.querySelector("dialog[data-report-preview][open] iframe[src^=blob]"))',
            ),
          )
          .toBe(true);
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
