import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileProjectToMemory } from '@webrad/compiler';
import { addPage, createPage, createProject } from '@webrad/project-model';
import { expect, it } from 'vitest';
import { withChromium } from './chromium';

const browser = process.env.WEBRAD_BROWSER_PATH;

it.runIf(browser !== undefined)(
  'uses Hash automatically for exported file URLs and replaces history without changing directories',
  async () => {
    const project = addPage(createProject('FileRouting'), createPage('PageCustomers'));
    const output = await compileProjectToMemory(project, { target: 'deploy', userSources: {} });
    expect(output.success, JSON.stringify(output.diagnostics)).toBe(true);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-route-file-'));

    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith('webrad-route-file-')
    )
      throw new Error('Unexpected file route fixture directory');
    try {
      for (const [relative, contents] of Object.entries(output.files)) {
        const target = path.join(directory, relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, contents);
      }
      const url = pathToFileURL(path.join(directory, 'index.html')).href;
      await withChromium(browser!, url, async (send) => {
        await expect
          .poll(async () => {
            const result = await send('Runtime.evaluate', {
              expression: 'typeof Navigate',
              returnByValue: true,
            });
            return (result.result as { value: string }).value;
          })
          .toBe('function');
        const result = await send('Runtime.evaluate', {
          expression: `(() => {
          Navigate('PageCustomers');
          const length = history.length;
          Navigate('PageMain', { replace: true });
          return { url: location.href, length, after: history.length, mounted: document.querySelector('[data-webrad-page-id="${project.pages[0]!.id}"]') !== null };
        })()`,
          returnByValue: true,
        });
        expect(result.exceptionDetails).toBeUndefined();
        const value = (
          result.result as {
            value: { url: string; length: number; after: number; mounted: boolean };
          }
        ).value;
        expect(value.url).toBe(url + '#/index');
        expect(value.after).toBe(value.length);
        expect(value.mounted).toBe(true);
      });
    } finally {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  },
  60_000,
);
