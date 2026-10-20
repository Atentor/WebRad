import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  popupLayoutEvidence,
  popupSmokeProject,
  popupSmokeSources,
} from '../apps/ide/main/popup-smoke-fixture';
import { withChromium } from './chromium';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'preserves intrinsic popup button sizes after opening, resizing and reopening compiled Preview',
  async () => {
    const compiled = await compileProjectToMemory(popupSmokeProject(), {
      userSources: popupSmokeSources,
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(compiled.previewHtml);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          await expect
            .poll(async () => {
              const r = await send('Runtime.evaluate', {
                expression: `!!document.querySelector('dialog')`,
                returnByValue: true,
              });
              return (r.result as { value: unknown }).value;
            })
            .toBe(true);
          // Let the initial observers measure the closed popup before opening it.
          await send('Runtime.evaluate', {
            expression: `new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`,
            awaitPromise: true,
          });
          for (const width of [363, 768, 320]) {
            await send('Emulation.setDeviceMetricsOverride', {
              width,
              height: 500,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await send('Runtime.evaluate', {
              expression: `(async () => {
                const dialog = document.querySelector('dialog');
                if (dialog.open) await new Promise(resolve => {
                  dialog.addEventListener('close', resolve, { once: true });
                  dialog.close();
                });
                document.body.click();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              })()`,
              awaitPromise: true,
            });
            await expect
              .poll(async () => {
                const r = await send('Runtime.evaluate', {
                  expression: popupLayoutEvidence,
                  returnByValue: true,
                });
                const v = (
                  r.result as { value?: { buttons: { width: number }[]; overflow: boolean } }
                ).value;
                return v && { widths: v.buttons.map((b) => b.width), overflow: v.overflow };
              })
              .toEqual({ widths: [96, 96], overflow: false });
          }
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  40_000,
);
