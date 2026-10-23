import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { withChromium } from './chromium';
import { panelFloatingProject, panelFloatingUserSources } from './fixtures/panel-floating';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'renders a real Designer overlay and scrolls compiled Preview and exported app Panels with the page',
  async () => {
    const project = panelFloatingProject();
    const compiled = await compileProjectToMemory(project, {
      userSources: panelFloatingUserSources,
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.colorPalette,
    );
    const designerCss = await fs.readFile('apps/ide/renderer/src/layout.css', 'utf8');
    const bundle = await build({
      entryPoints: ['tests/fixtures/panel-floating-browser.tsx'],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const server = createServer((request, response) => {
      const url = request.url ?? '/';
      response.setHeader(
        'Content-Type',
        url.endsWith('.js') ? 'text/javascript' : url.endsWith('.css') ? 'text/css' : 'text/html',
      );
      response.end(
        url === '/preview'
          ? compiled.previewHtml
          : url === '/export'
            ? compiled.files['index.html']
            : url === '/designer.js'
              ? bundle.outputFiles[0]!.text
              : (compiled.files[url.slice(1)] ??
                `<!doctype html><style>${css}</style><style>${designerCss}</style><div id="root" style="height:900px"></div><iframe id="preview" src="/preview" style="width:800px;height:500px"></iframe><iframe id="export" src="/export" style="width:800px;height:500px"></iframe><script src="/designer.js"></script>`),
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
          const evaluate = async (expression: string) => {
            const result = await send('Runtime.evaluate', {
              expression,
              returnByValue: true,
              awaitPromise: true,
            });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (result.result as { value: unknown }).value;
          };
          await expect
            .poll(() =>
              evaluate(
                `document.querySelector('[data-designer-node-id="floating-panel"]')?.parentElement.className`,
              ),
            )
            .toContain('wr-designer-floating-layer');
          const designer = await evaluate(
            `(() => { const e = document.querySelector('[data-designer-node-id="floating-panel"]'); return { left: e.style.left, top: e.style.top, width: e.style.width, height: e.style.height, child: e.textContent }; })()`,
          );
          expect(designer).toMatchObject({
            left: '24px',
            top: '32px',
            width: '220px',
            height: '140px',
          });
          for (const frame of ['preview', 'export']) {
            const setup = `const w = document.getElementById('${frame}').contentWindow, d = w.document, p = d.querySelector('[data-webrad-name="FloatingPanel"]');`;
            await expect
              .poll(() => evaluate(`(() => { ${setup} return p?.parentElement.className; })()`), {
                timeout: 15000,
              })
              .toBe('wr-panel-floating-layer');
            expect(
              await evaluate(
                `(() => { ${setup} const b=p.getBoundingClientRect(); return { x:b.x,y:b.y,width:b.width,height:b.height,position:w.getComputedStyle(p).position }; })()`,
              ),
            ).toMatchObject({ x: 24, y: 32, width: 220, height: 140, position: 'absolute' });
            // A transformed/clipped model parent cannot capture or clip the overlay.
            expect(
              await evaluate(
                `(() => { ${setup} const parent=d.querySelector('[data-webrad-name="ParentPanel"]'); parent.style.transform='translate(70px,80px)'; parent.style.overflow='hidden'; const b=p.getBoundingClientRect(); d.body.style.minHeight='2000px'; w.scrollTo(0,180); return b.y; })()`,
              ),
            ).toBe(32);
            await expect
              .poll(() =>
                evaluate(
                  `(() => { ${setup} return {scroll:w.scrollY,y:p.getBoundingClientRect().y}; })()`,
                ),
              )
              .toEqual({ scroll: 180, y: -148 });
            expect(
              await evaluate(
                `(() => { ${setup} w.scrollTo(0,0); p.querySelector('button').click(); const b=p.getBoundingClientRect(); return { right:w.innerWidth-b.right,bottom:w.innerHeight-b.bottom,z:p.style.zIndex }; })()`,
              ),
            ).toMatchObject({ right: 24, bottom: 32, z: '300' });
            expect(
              await evaluate(
                `(() => { ${setup} d.querySelector('[data-webrad-name="ToggleButton"]').click(); const a=p.parentElement.dataset.webradName; d.querySelector('[data-webrad-name="ToggleButton"]').click(); return {parent:a,restored:p.parentElement.className,caption:p.querySelector('button').textContent}; })()`,
              ),
            ).toEqual({
              parent: 'ParentPanel',
              restored: 'wr-panel-floating-layer',
              caption: 'Anchored',
            });
          }
          await fs.mkdir('artifacts/panel-floating', { recursive: true });
          const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
          });
          await fs.writeFile(
            'artifacts/panel-floating/designer-preview-export.png',
            Buffer.from(screenshot.data as string, 'base64'),
          );
        },
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
