import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime';
import { withChromium } from './chromium';
import { groupProject, groupUserSources } from './fixtures/group';
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'keeps Group transparent in Designer and executes children in browser Preview',
  async () => {
    const project = groupProject();
    const group = project.pages[0]!.components.find((n) => n.id === 'group')!;
    const compiled = await compileProjectToMemory(project, { userSources: groupUserSources });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const markup = renderToStaticMarkup(
      <ComponentView node={group} designTime>
        <span>Designer child</span>
      </ComponentView>,
    );
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        request.url === '/index.html'
          ? compiled.previewHtml
          : `<!doctype html><style>${WEBRAD_COMPONENT_CSS}</style>${markup}<iframe src="/index.html"></iframe>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server port');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          await expect
            .poll(
              async () => {
                const result = await send('Runtime.evaluate', {
                  expression: `(() => {
            const preview = document.querySelector('iframe')?.contentDocument;
            const runtime = preview?.querySelector('[data-webrad-id="group"]');
            if (!runtime || runtime.getAttribute('aria-label') !== 'Ready') return null;
            const designer = document.querySelector('[data-component-id="group"]');
            const paint = element => { const s = element.ownerDocument.defaultView.getComputedStyle(element); return [s.backgroundColor, s.borderTopWidth, s.boxShadow]; };
            runtime.querySelector('button').click();
            return { designer: paint(designer), runtime: paint(runtime), child: runtime.querySelector('button').textContent };
          })()`,
                  returnByValue: true,
                });
                return (
                  result.result as {
                    value?: unknown;
                  }
                )?.value;
              },
              { timeout: 15000 },
            )
            .toEqual({
              designer: ['rgba(0, 0, 0, 0)', '0px', 'none'],
              runtime: ['rgba(0, 0, 0, 0)', '0px', 'none'],
              child: 'Ready',
            });
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  40000,
);
