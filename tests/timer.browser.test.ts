import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import { withChromium } from './chromium';
import { timerProject, timerUserSources } from './fixtures/timer';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'executes Timer Interact handlers in compiled F9 and stops after three ticks',
  async () => {
    const compiled = await compileProjectToMemory(timerProject(), {
      userSources: timerUserSources,
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(compiled.previewHtml);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing timer test port.');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          const read = async () => {
            const result = await send('Runtime.evaluate', {
              expression: `document.querySelector('[data-webrad-page-id]')?.dataset.timerTicks`,
              returnByValue: true,
            });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (result.result as { value?: string }).value;
          };
          await expect.poll(read, { timeout: 15000 }).toBe('3');
          const result = await send('Runtime.evaluate', {
            expression: `document.querySelector('[data-webrad-page-id]').dataset.timerEnabled`,
            returnByValue: true,
          });
          expect((result.result as { value: string }).value).toBe('false');
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
