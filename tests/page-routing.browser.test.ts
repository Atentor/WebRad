import { createServer } from 'node:http';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  addPage,
  createPage,
  createProject,
  updateProjectSettings,
  serializeProject,
  deserializeProject,
} from '@webrad/project-model';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';
import { publishPreviewHtml, closePreviewServer } from '../apps/ide/main/preview-server';
const browser = process.env.WEBRAD_BROWSER_PATH;
it.runIf(browser !== undefined)(
  'navigates and reloads compiled clean routes in Preview and subdirectory exports',
  async () => {
    const initial = updateProjectSettings(createProject('Routing'), {
      routingBasePath: '/portal/',
    });
    const details = createPage('PageDetails');
    const project = deserializeProject(serializeProject(addPage(initial, details)));
    const output = await compileProjectToMemory(project, { userSources: {}, target: 'deploy' });
    expect(output.success, JSON.stringify(output.diagnostics)).toBe(true);
    const previewOutput = await compileProjectToMemory(project, { userSources: {} });
    expect(previewOutput.success, JSON.stringify(previewOutput.diagnostics)).toBe(true);
    const preview = await publishPreviewHtml(98765, previewOutput.previewHtml!);
    const server = createServer((request, response) => {
      const pathname = new URL(request.url!, 'http://localhost').pathname;
      const file = pathname.slice('/portal/'.length);
      const contents =
        output.files[file] ?? (file.includes('.') ? undefined : output.files['index.html']);
      response.setHeader(
        'Content-Type',
        file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      );
      response.statusCode = contents === undefined ? 404 : 200;
      response.end(contents ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const exported = `http://127.0.0.1:${address.port}/portal/index.html`;
    try {
      for (const entry of [preview, exported]) {
        await withChromium(browser!, entry, async (send) => {
          const evaluate = async (expression: string): Promise<unknown> => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true });
            expect(result.exceptionDetails).toBeUndefined();
            return (
              result.result as {
                value: unknown;
              }
            ).value;
          };
          const mounted = async (root: string): Promise<void> => {
            await expect
              .poll(() => evaluate(`document.querySelector('[data-webrad-id="${root}"]') !== null`))
              .toBe(true);
          };
          await mounted(project.pages[0]!.rootComponentId);
          await evaluate("Navigate('PageDetails')");
          await mounted(details.rootComponentId);
          expect(await evaluate('location.hash')).toBe('');
          const path = await evaluate('location.pathname');
          expect(String(path)).toMatch(/\/pagedetails$/);
          const previousTimeOrigin = await evaluate('performance.timeOrigin');
          await send('Page.reload');
          await expect.poll(() => evaluate('performance.timeOrigin')).not.toBe(previousTimeOrigin);
          await mounted(details.rootComponentId);
          await evaluate('history.back()');
          await mounted(project.pages[0]!.rootComponentId);
          await evaluate('history.forward()');
          await mounted(details.rootComponentId);
          await evaluate('Navigate("index", { replace: true })');
          await mounted(project.pages[0]!.rootComponentId);
          await evaluate("Navigate('/pagedetails')");
          await mounted(details.rootComponentId);
        });
        const direct = new URL('pagedetails?filter=active', new URL('./', entry)).href;
        await withChromium(browser!, direct, async (send) => {
          await expect
            .poll(async () => {
              const result = await send('Runtime.evaluate', {
                expression: `document.querySelector('[data-webrad-id="${details.rootComponentId}"]') !== null`,
                returnByValue: true,
              });
              return (
                result.result as {
                  value: boolean;
                }
              ).value;
            })
            .toBe(true);
        });
      }
    } finally {
      await closePreviewServer();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  120000,
);
