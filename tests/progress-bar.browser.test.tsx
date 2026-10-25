import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { findDefaultComponentStyle } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { withChromium } from './chromium';
import { progressBarProject, progressBarUserSources } from './fixtures/progress-bar';
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'matches all ProgressBar formats, styles and responsive geometry in Designer and compiled Preview',
  async () => {
    const project = progressBarProject();
    const nodes = project.pages[0]!.components.filter((n) => n.type === 'WebProgressBar');
    const style = findDefaultComponentStyle(project.styles, 'WebProgressBar')!;
    const compiled = await compileProjectToMemory(project, {
      userSources: progressBarUserSources(),
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.themes,
    );
    const markup = nodes
      .map(
        (node) =>
          `<div style="width:${String(node.bounds.width)}px;height:${String(node.bounds.height)}px;margin:20px">${renderToStaticMarkup(<ComponentView node={node} designTime styleClassName={resolveComponentStyleClassName(style)} />)}</div>`,
      )
      .join('');
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        request.url === '/index.html'
          ? compiled.previewHtml
          : `<!doctype html><style>${css}</style><main style="display:flex;align-items:start"><section>${markup}</section><iframe src="/index.html" style="width:850px;height:500px;border:0"></iframe></main>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing progress test port');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          const evaluate = async (expression: string): Promise<unknown> => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (
              result.result as {
                value?: unknown;
              }
            ).value;
          };
          const runtime = (format: string) =>
            `document.querySelector('iframe').contentDocument.querySelector('[data-webrad-id=${format}]')`;
          const designer = (format: string) =>
            `document.querySelector('[data-component-id=${format}]')`;
          await expect
            .poll(() => evaluate(`Boolean(${runtime('bars')})`), { timeout: 15000 })
            .toBe(true);
          const read = (expression: string) =>
            evaluate(`(() => {
        const e = ${expression}, w = e.ownerDocument.defaultView, s = w.getComputedStyle(e), svg = e.querySelector('svg');
        const box = e.getBoundingClientRect(), graphic = svg.getBoundingClientRect();
        return { value: e.getAttribute('aria-valuenow'), text: e.querySelector('.wr-progress-label').textContent,
          borderWidth: s.borderTopWidth, borderStyle: s.borderTopStyle, background: s.backgroundImage, backgroundClip: s.backgroundClip, radius: s.borderRadius, color: s.color, fontSize: s.fontSize, opacity: s.opacity,
          width: box.width, height: box.height, graphicWidth: graphic.width, graphicHeight: graphic.height,
          aspect: svg.getAttribute('preserveAspectRatio'), shapes: [...svg.children].map(c => ({
            tag: c.tagName, geometry: ['width','r','d','stroke-dasharray'].map(a => c.getAttribute(a)),
            fill: w.getComputedStyle(c).fill, stroke: w.getComputedStyle(c).stroke, thickness: w.getComputedStyle(c).strokeWidth,
          })) };
      })()`);
          for (const format of ['bars', 'dunnet', 'circus']) {
            const actual = await read(runtime(format));
            expect(actual).toEqual(await read(designer(format)));
            expect(actual).toMatchObject({
              borderWidth: '1px',
              borderStyle: 'solid',
              background: expect.stringContaining('linear-gradient(to right bottom'),
              backgroundClip: 'padding-box, border-box',
              value: '50',
              text: '25%',
              radius: '6px',
              fontSize: '12px',
              opacity: '1',
              aspect: format === 'bars' ? 'none' : 'xMidYMid meet',
            });
          }
          await fs.mkdir('out/progress-bar-review', { recursive: true });
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            'out/progress-bar-review/designer-preview.png',
            Buffer.from(screenshot.data as string, 'base64'),
          );
          await evaluate(
            `document.querySelector('iframe').contentDocument.querySelector('[data-webrad-id=advance]').click()`,
          );
          expect(await evaluate(`${runtime('bars')}.parentElement.dataset.changes`)).toBe('1');
          for (const format of ['bars', 'dunnet', 'circus']) {
            expect(await read(runtime(format))).toMatchObject({ value: '100', text: '50%' });
          }
          // Check the exported runtime's value math against the shared Designer projection at 50%.
          for (const format of ['bars', 'dunnet', 'circus']) {
            await evaluate(`(() => { const e = ${designer(format)}; e.setAttribute('aria-valuenow', '100'); e.querySelector('.wr-progress-label').textContent = '50%';
          const fill = e.querySelector('.wr-progress-fill');
          ${format === 'bars' ? "fill.setAttribute('width','50')" : format === 'dunnet' ? "fill.setAttribute('stroke-dasharray','50 100')" : "fill.setAttribute('d','M 50 50 L 50 2 A 48 48 0 0 1 50.00000000000001 98 Z')"}; })()`);
            expect(await read(runtime(format))).toEqual(await read(designer(format)));
          }
          // Non-square and smaller bounds keep rings/sectors round, without overflow.
          for (const [width, height] of [
            [240, 120],
            [80, 80],
            [120, 240],
          ]) {
            for (const format of ['dunnet', 'circus']) {
              for (const expression of [designer(format), runtime(format)]) {
                await evaluate(
                  `${expression}.style.setProperty('width','${String(width)}px','important'); ${expression}.style.setProperty('height','${String(height)}px','important')`,
                );
              }
              expect(await read(runtime(format))).toEqual(await read(designer(format)));
              for (const expression of [designer(format), runtime(format)]) {
                const ratio = await evaluate(
                  `(() => { const c = ${expression}.querySelector('circle'), b = c.getBBox(), matrix = c.getScreenCTM(); return { ratio: matrix.a / matrix.d, contained: b.width * matrix.a <= ${String(width)} && b.height * matrix.d <= ${String(height)} }; })()`,
                );
                expect(ratio).toEqual({ ratio: 1, contained: true });
              }
            }
          }
          for (const expression of [designer('dunnet'), runtime('dunnet')]) {
            await evaluate(
              `${expression}.ownerDocument.documentElement.style.setProperty('--wr-palette-aurora-blue', '#123456'); ${expression}.style.setProperty('--wr-progress-track-color', '#abcdef'); ${expression}.style.setProperty('--wr-progress-thickness', '12')`,
            );
            const custom = await read(expression);
            expect(custom).toMatchObject({
              shapes: [
                { stroke: 'rgb(171, 205, 239)', thickness: '12px' },
                { stroke: 'rgb(18, 52, 86)', thickness: '12px' },
              ],
            });
            await evaluate(`${expression}.setAttribute('aria-disabled', 'true')`);
            expect(await read(expression)).toMatchObject({ opacity: '0.6' });
            await evaluate(
              `${expression}.setAttribute('aria-disabled', 'false'); ${expression}.querySelector('.wr-progress-label').hidden = true`,
            );
            expect(
              await evaluate(
                `${expression}.ownerDocument.defaultView.getComputedStyle(${expression}.querySelector('.wr-progress-label')).display`,
              ),
            ).toBe('none');
          }
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60000,
);
