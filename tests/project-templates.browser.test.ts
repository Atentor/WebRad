import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  createProjectFromTemplate,
  defaultComponentRegistry,
  PROJECT_TEMPLATE_IDS,
} from '@webrad/component-registry';
import { parseProject } from '@webrad/project-model';
import { withChromium } from './chromium';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined).each(PROJECT_TEMPLATE_IDS)(
  'creates, serializes, compiles and runs the %s template in Preview and exported output',
  async (templateId) => {
    for (const theme of ['aurora', 'prism', 'flat', 'webrad'] as const) {
      const { project } = createProjectFromTemplate('Template verification', templateId, theme);
      expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      if (templateId === 'aurora-workspace') {
        const types = new Set(
          [...project.pages, ...project.reusableElements].flatMap((page) =>
            page.components.map((node) => node.type),
          ),
        );
        expect(
          defaultComponentRegistry.list().every((definition) => types.has(definition.type)),
        ).toBe(true);
      }
    }
    const { project, userSources } = createProjectFromTemplate('Template verification', templateId);
    const compiled = await compileProjectToMemory(project, { userSources });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    let previewMode = true;
    const server = createServer((request, response) => {
      const resource = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
      const body = compiled.files[resource] ?? compiled.binaryFiles?.[resource];
      const mime = resource.endsWith('.js')
        ? 'text/javascript'
        : resource.endsWith('.css')
          ? 'text/css'
          : resource.endsWith('.json')
            ? 'application/json'
            : resource.endsWith('.woff2')
              ? 'font/woff2'
              : resource.endsWith('.svg')
                ? 'image/svg+xml'
                : 'text/html';
      response.writeHead(200, { 'Content-Type': mime });
      response.end(body ?? (previewMode ? compiled.previewHtml : compiled.files['index.html']));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing template test port.');
    try {
      for (const output of ['preview', 'export']) {
        previewMode = output === 'preview';
        await withChromium(
          process.env.WEBRAD_BROWSER_PATH!,
          `http://127.0.0.1:${address.port}/index`,
          async (send) => {
            const evaluate = async (expression: string): Promise<unknown> => {
              const result = await send('Runtime.evaluate', {
                expression,
                returnByValue: true,
                awaitPromise: true,
              });
              if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
              return (result.result as { value?: unknown }).value;
            };
            await expect
              .poll(
                () =>
                  evaluate(
                    'document.querySelector("[data-webrad-type=WebPage]")?.dataset.webradName',
                  ),
                { timeout: 15_000 },
              )
              .toBe('index');
            await evaluate(`(() => {
              window.templateErrors = [];
              addEventListener('error', event => window.templateErrors.push(event.message));
              addEventListener('unhandledrejection', event => window.templateErrors.push(String(event.reason)));
            })()`);
            for (const page of project.pages.filter((candidate) => candidate.name !== 'index')) {
              await evaluate(`Navigate(${JSON.stringify(page.name)})`);
              await expect
                .poll(
                  () =>
                    evaluate(
                      'document.querySelector("[data-webrad-type=WebPage]")?.dataset.webradName',
                    ),
                  { timeout: 15_000 },
                )
                .toBe(page.name);
            }
            expect(await evaluate('window.templateErrors')).toEqual([]);
            if (templateId !== 'aurora-workspace') return;
            await evaluate("Navigate('Data')");
            await expect
              .poll(
                () =>
                  evaluate(
                    'document.querySelectorAll("[data-webrad-name=ProjectsChart] [data-chart-point]").length',
                  ),
                { timeout: 15_000 },
              )
              .toBe(5);
            const point = (await evaluate(
              `(() => { const point = document.querySelector('[data-webrad-name=ProjectsChart] [data-chart-point="0"]'); point.scrollIntoView({ block: 'center' }); const box = point.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`,
            )) as { x: number; y: number };
            await send('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              button: 'left',
              clickCount: 1,
              ...point,
            });
            await send('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              button: 'left',
              clickCount: 1,
              ...point,
            });
            await expect
              .poll(() =>
                evaluate('document.querySelector("[data-webrad-name=SelectedProject]")?.value'),
              )
              .toBe('Selected in Charts: Customer portal (75%)');
            expect(await evaluate('window.templateErrors')).toEqual([]);
            const screenshotDirectory = process.env.WEBRAD_TEMPLATE_SCREENSHOT_DIRECTORY;
            if (screenshotDirectory !== undefined) {
              await fs.mkdir(screenshotDirectory, { recursive: true });
              const capture = await send('Page.captureScreenshot', { format: 'png' });
              await fs.writeFile(
                path.join(screenshotDirectory, `aurora-charts-${output}.png`),
                Buffer.from(capture.data as string, 'base64'),
              );
            }
          },
        );
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
