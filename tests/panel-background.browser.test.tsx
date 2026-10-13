import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView, ProjectAssetsContext } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { withChromium } from './chromium';
import {
  panelBackgroundProject,
  panelBackgroundUserSources,
  panelAsset,
  panelImage,
} from './fixtures/panel-background';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'renders imported Panel backgrounds in Designer and Preview, preserves gradient borders and restores the style',
  async () => {
    const project = panelBackgroundProject();
    const panel = project.pages[0]!.components.find((node) => node.id === 'panel')!;
    const compiled = await compileProjectToMemory(project, {
      userSources: panelBackgroundUserSources,
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.colorPalette,
    );
    const markup = renderToStaticMarkup(
      <ProjectAssetsContext.Provider value={project.assets!}>
        <ComponentView
          node={panel}
          designTime
          styleClassName={resolveComponentStyleClassName(
            project.styles.find((style) => style.id === panel.styleId),
          )}
        >
          <span>Designer child</span>
        </ComponentView>
      </ProjectAssetsContext.Provider>,
    );
    const server = createServer((request, response) => {
      if (decodeURIComponent(request.url ?? '').replace(/^\//u, '') === panelImage) {
        response.setHeader('Content-Type', panelAsset.mediaType);
        response.end(Buffer.from(panelAsset.base64, 'base64'));
        return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end(
        request.url === '/preview'
          ? compiled.previewHtml
          : `<!doctype html><style>${css}</style><div style="width:280px;height:160px">${markup}</div><iframe src="/preview"></iframe>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing browser test port');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
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
          const runtime = `document.querySelector('iframe').contentDocument.querySelector('[data-webrad-id="panel"]')`;
          const designer = `document.querySelector('[data-component-id="panel"]')`;
          await expect.poll(() => evaluate(`Boolean(${runtime})`), { timeout: 15_000 }).toBe(true);
          const paint = (expression: string) =>
            evaluate(`(() => {
        const e = ${expression}, s = e.ownerDocument.defaultView.getComputedStyle(e);
        return { image: s.backgroundImage, size: s.backgroundSize, position: s.backgroundPosition, repeat: s.backgroundRepeat, clip: s.backgroundClip, border: s.borderTopWidth, radius: s.borderRadius };
      })()`);
          for (const expression of [runtime, designer]) {
            expect(await paint(expression)).toMatchObject({
              image: expect.stringContaining('url('),
              size: 'cover, auto',
              position: '50% 50%, 0% 0%',
              repeat: 'no-repeat, no-repeat',
              clip: 'padding-box, border-box',
              border: '1px',
              radius: '6px',
            });
            expect(await paint(expression)).toMatchObject({
              image: expect.stringContaining('linear-gradient(to right bottom'),
            });
            expect(
              await evaluate(
                `new Promise(resolve => { const e = ${expression}, image = new e.ownerDocument.defaultView.Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = () => resolve(false); image.src = e.style.getPropertyValue('--wr-panel-background-image').slice(5, -2); })`,
              ),
            ).toEqual([32, 16]);
          }
          await evaluate(`${runtime}.querySelector('button').click()`);
          await expect
            .poll(() => paint(runtime))
            .toMatchObject({
              size: 'contain, auto',
              position: '100% 100%, 0% 0%',
              repeat: 'repeat-x, no-repeat',
              image: expect.stringContaining('url('),
            });
          await evaluate(`${runtime}.querySelector('button').click()`);
          await expect
            .poll(() => paint(runtime))
            .toMatchObject({
              image: expect.stringContaining(
                'linear-gradient(rgb(255, 255, 255), rgb(248, 250, 252))',
              ),
              size: 'auto, auto',
              border: '1px',
            });
          const restored = await paint(runtime);
          expect(restored).toMatchObject({
            image: expect.stringContaining(
              'linear-gradient(rgb(255, 255, 255), rgb(248, 250, 252))',
            ),
            size: 'auto, auto',
            border: '1px',
          });
          expect((restored as { image: string }).image).not.toContain('url(');
          expect(await evaluate(`${runtime}.querySelector('button').textContent`)).toBe('Cleared');
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  45_000,
);
