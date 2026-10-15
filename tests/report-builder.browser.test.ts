import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { compileProjectToMemory } from '@webrad/compiler';
import { closePreviewServer, publishPreviewHtml } from '../apps/ide/main/preview-server';
import {
  reportBuilderProject,
  reportBuilderSources,
  reportBuilderTemplate,
} from './fixtures/report-builder';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'generates paginated PDF, presents all destinations and loads external templates in real compiled Preview',
  async () => {
    let requests = 0;
    const original = reportBuilderTemplate();
    const template = {
      ...original,
      bands: original.bands.map((band) =>
        band.kind === 'title'
          ? {
              ...band,
              elements: [
                ...band.elements,
                {
                  id: 'inline-logo',
                  name: 'Inline logo',
                  type: 'image' as const,
                  x: 168,
                  y: 0,
                  width: 12,
                  height: 12,
                  fit: 'contain' as const,
                  value: {
                    kind: 'static' as const,
                    value:
                      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=',
                  },
                },
              ],
            }
          : band,
      ),
    };
    const external = template;
    const server = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/customers') {
        requests++;
        response.end(
          JSON.stringify({
            customers: Array.from({ length: 80 }, (_, index) => ({
              id: index + 1,
              name: `Cliente ${String(index + 1).padStart(3, '0')}`,
            })),
          }),
        );
      } else if (request.url === '/external.report.json') {
        response.end(
          JSON.stringify({
            ...external,
            name: 'Modelo externo',
            bands: external.bands.map((band) => ({
              ...band,
              elements: band.elements.map((element) =>
                element.type === 'repeater'
                  ? {
                      ...element,
                      source: { ...element.source, apiClientId: 'ApiClient1', operationId: 'Load' },
                    }
                  : element,
              ),
            })),
          }),
        );
      } else {
        response.statusCode = 404;
        response.end('{}');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing report fixture server.');
    try {
      const project = reportBuilderProject(`http://127.0.0.1:${String(address.port)}`, template);
      const compiled = await compileProjectToMemory(project, {
        userSources: reportBuilderSources(),
      });
      expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
      const url = await publishPreviewHtml(9001, compiled.previewHtml!);
      await fs.mkdir('out/report-builder-review', { recursive: true });
      const downloadDirectory = await fs.mkdtemp(
        path.resolve('out/report-builder-review/pdf-download-'),
      );
      await withChromium(browser!, url, async (send) => {
        const evaluate = async (expression: string): Promise<unknown> => {
          const result = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true,
          });
          if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
          return (result.result as { value?: unknown }).value;
        };
        const root = 'document.querySelector("[data-webrad-page-id]")';
        await evaluate(
          `addEventListener('securitypolicyviolation', event => { document.body.dataset.csp = event.violatedDirective + ':' + event.blockedURI; })`,
        );
        await send('Browser.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: downloadDirectory,
          eventsEnabled: true,
        });
        await expect
          .poll(() => evaluate(`${root}?.dataset.ready ?? ${root}?.dataset.error`), {
            timeout: 20_000,
          })
          .toBe('true');
        await evaluate('document.querySelector("[data-webrad-name=PDF]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.pages ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('4');
        const base64 = (await evaluate(`${root}.dataset.pdf`)) as string;
        const document = await PDFDocument.load(Buffer.from(base64, 'base64'));
        expect(document.getPageCount()).toBe(4);
        expect(
          document.context
            .enumerateIndirectObjects()
            .filter(
              ([, object]) =>
                object instanceof PDFRawStream &&
                object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
            ).length,
        ).toBeGreaterThan(0);
        const streams = document.context
          .enumerateIndirectObjects()
          .flatMap(([, value]) =>
            value instanceof PDFRawStream
              ? [Buffer.from(decodePDFRawStream(value).decode()).toString('latin1')]
              : [],
          )
          .join('\n');
        for (const text of ['Cliente 001', 'Cliente 080'])
          expect(streams.toUpperCase()).toContain(Buffer.from(text).toString('hex').toUpperCase());
        await evaluate('document.querySelector("[data-webrad-name=Modal]").click()');
        await expect
          .poll(
            () =>
              evaluate(
                'Boolean(document.querySelector("dialog[data-report-preview][open] iframe[src^=blob]"))',
              ),
            { timeout: 15_000 },
          )
          .toBe(true);
        await evaluate('new Promise(resolve => setTimeout(resolve, 1000))');
        await fs.mkdir('out/report-builder-review', { recursive: true });
        const screenshot = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(
          'out/report-builder-review/pdf-preview.png',
          Buffer.from(screenshot.data as string, 'base64'),
        );
        await evaluate('document.querySelector("dialog[data-report-preview] button").click()');
        expect(
          await evaluate('document.querySelector("dialog[data-report-preview]") === null'),
        ).toBe(true);
        await evaluate('document.querySelector("[data-webrad-name=NewTab]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.tab ?? ${root}.dataset.error`), { timeout: 15_000 })
          .toBe('true');
        await expect
          .poll(
            async () => {
              const targets = await send('Target.getTargets');
              return (targets.targetInfos as { url: string }[]).some((target) =>
                target.url.startsWith('blob:'),
              );
            },
            { timeout: 10_000 },
          )
          .toBe(true);
        await evaluate('document.querySelector("[data-webrad-name=Download]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.download ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('true');
        await expect
          .poll(
            async () =>
              fs
                .readFile(path.join(downloadDirectory, 'clientes.pdf'))
                .then((bytes) => bytes.subarray(0, 5).toString())
                .catch(async () => String(await evaluate('document.body.dataset.csp'))),
            { timeout: 10_000 },
          )
          .toBe('%PDF-');
        await evaluate('document.querySelector("[data-webrad-name=External]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.template ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('Modelo externo');
        expect(await evaluate(`${root}.dataset.parameter`)).toBe('Clientes de São Paulo');
        await evaluate(
          `delete ${root}.dataset.pages; document.querySelector("[data-webrad-name=PDF]").click()`,
        );
        await expect
          .poll(() => evaluate(`${root}.dataset.pages ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('4');
        await evaluate('document.querySelector("[data-webrad-name=BlobTemplate]").click()');
        await expect
          .poll(() => evaluate(`${root}.dataset.blobTemplate ?? ${root}.dataset.error`), {
            timeout: 15_000,
          })
          .toBe('Blob template');
        expect(await evaluate(`${root}.dataset.blobParameter`)).toBe('Clientes de São Paulo');
        expect(await evaluate(`${root}.dataset.error`)).toBeUndefined();
        expect(await evaluate('document.body.dataset.csp')).toBeUndefined();
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
