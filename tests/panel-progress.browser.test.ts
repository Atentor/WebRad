import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { build } from 'esbuild';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { withChromium } from './chromium';
import { panelProgressProject, panelProgressUserSources } from './fixtures/panel-progress';
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'matches real Designer/Preview border geometry, Aurora styles, dynamic resize and automatic visibility',
  async () => {
    const project = panelProgressProject(false, 50);
    const compiled = await compileProjectToMemory(project, {
      userSources: panelProgressUserSources(),
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.themes,
    );
    const bundle = await build({
      entryPoints: ['tests/fixtures/panel-progress-browser.tsx'],
      bundle: true,
      write: false,
      outdir: 'bundle',
      loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
      format: 'iife',
      platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    const server = createServer((request, response) => {
      response.setHeader(
        'Content-Type',
        request.url === '/designer.js'
          ? 'text/javascript'
          : request.url === '/designer.css'
            ? 'text/css'
            : 'text/html',
      );
      response.end(
        request.url === '/index.html'
          ? compiled.previewHtml
          : request.url === '/designer.js'
            ? bundle.outputFiles.find((file) => file.path.endsWith('.js'))!.text
            : request.url === '/designer.css'
              ? bundle.outputFiles.find((file) => file.path.endsWith('.css'))!.text
              : `<!doctype html><link rel="stylesheet" href="/designer.css"><style data-webrad-project-styles>${css}</style><div id="root"></div><script src="/designer.js"></script>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing Panel browser test port');
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
          const runtime = `document.querySelector('iframe').contentDocument.querySelector('[data-webrad-name="Panel1"]')`;
          const designer = `document.querySelector('[data-component-id="panel"]')`;
          const paint = (expression: string) =>
            evaluate(`(() => {
        const e = ${expression}; if (!e) return null;
        const svg = e.querySelector('.wr-panel-progress'); if (!svg) return { visible: false };
        const w = e.ownerDocument.defaultView, s = w.getComputedStyle(e), path = svg.querySelector('.wr-panel-progress-fill');
        const box = e.getBoundingClientRect(), overlay = svg.getBoundingClientRect(), pathBox = path.getBBox();
        return { visible: true, value: svg.getAttribute('aria-valuenow'), d: path.getAttribute('d'), length: path.getTotalLength(), dash: path.getAttribute('stroke-dasharray'), color: w.getComputedStyle(path).stroke, track: w.getComputedStyle(svg.querySelector('.wr-panel-progress-track')).stroke, thickness: path.getAttribute('stroke-width'), paintedThickness: w.getComputedStyle(path).strokeWidth, svgWidth: overlay.width, svgHeight: overlay.height, width: box.width, height: box.height, leftOffset: overlay.left-box.left, topOffset: overlay.top-box.top, pathBox: { x: pathBox.x, y: pathBox.y, width: pathBox.width, height: pathBox.height }, radius: s.borderTopLeftRadius, pointer: w.getComputedStyle(svg).pointerEvents };
      })()`);
          await expect
            .poll(() => paint(runtime), { timeout: 15000 })
            .toMatchObject({ visible: true, value: '50' });
          await expect
            .poll(() => paint(designer), { timeout: 15000 })
            .toEqual(await paint(runtime));
          expect(await paint(runtime)).toMatchObject({
            dash: '50 100',
            color: 'rgb(37, 99, 235)',
            track: 'rgb(219, 234, 254)',
            thickness: '3',
            svgWidth: 280,
            svgHeight: 160,
            leftOffset: 0,
            topOffset: 0,
            pathBox: { x: 0, y: 0, width: 280, height: 160 },
            radius: '8px',
            pointer: 'none',
          });
          const childBounds = () =>
            evaluate(
              `(() => { const b=${runtime}.querySelector('button').getBoundingClientRect(); return [b.width,b.height]; })()`,
            );
          const before = await childBounds();
          for (const expression of [designer, runtime]) {
            await evaluate(`${expression}.style.setProperty('--wr-panel-progress-thickness','6')`);
            await expect
              .poll(() => paint(expression))
              .toMatchObject({
                thickness: '6',
                paintedThickness: '6px',
                pathBox: { x: 0, y: 0, width: 280, height: 160 },
              });
          }
          const centeredScreenshot = await send('Page.captureScreenshot', { format: 'png' });
          const centeredPixels = await sharp(
            Buffer.from(centeredScreenshot.data as string, 'base64'),
          )
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          for (const expression of [designer, runtime]) {
            const point = (await evaluate(
              `(() => { const e=${expression}, b=e.getBoundingClientRect(), f=e.ownerDocument===document ? {left:0,top:0} : document.querySelector('iframe').getBoundingClientRect(); return {x:Math.round(f.left+b.left+b.width/2),y:Math.round(f.top+b.top)}; })()`,
            )) as {
              x: number;
              y: number;
            };
            const rgb = (dy: number): number[] => {
              const offset =
                ((point.y + dy) * centeredPixels.info.width + point.x) *
                centeredPixels.info.channels;
              return [...centeredPixels.data.subarray(offset, offset + 3)];
            };
            expect(rgb(-2), 'The outer half must be painted above the Panel edge').toEqual([
              37, 99, 235,
            ]);
            expect(rgb(1), 'The inner half must be painted below the Panel edge').toEqual([
              37, 99, 235,
            ]);
            expect(rgb(-4), 'The outer half stops at half the 6px thickness').not.toEqual([
              37, 99, 235,
            ]);
            expect(rgb(3), 'The inner half stops at half the 6px thickness').not.toEqual([
              37, 99, 235,
            ]);
            await evaluate(`${expression}.style.removeProperty('--wr-panel-progress-thickness')`);
            await expect.poll(() => paint(expression)).toMatchObject({ thickness: '3' });
          }
          await fs.mkdir('out/panel-progress-review', { recursive: true });
          const auroraScreenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            'out/panel-progress-review/aurora.png',
            Buffer.from(auroraScreenshot.data as string, 'base64'),
          );
          for (const [width, height] of [
            [240, 120],
            [240.5, 120.25],
            [120, 240],
            [80, 80],
          ]) {
            await evaluate(
              `(() => { const d=${designer}, r=${runtime}; for (const e of [d,r]) { e.style.transition = 'none'; e.style.borderTopLeftRadius='20px 12px'; e.style.borderTopRightRadius='30%'; e.style.borderBottomRightRadius='10px'; e.style.borderBottomLeftRadius='0'; e.style.setProperty('--wr-panel-progress-thickness','5'); } document.querySelector('#designer-frame').style.width='${width}px'; document.querySelector('#designer-frame').style.height='${height}px'; r.style.setProperty('width','${width}px','important'); r.style.setProperty('height','${height}px','important'); })()`,
            );
            await expect
              .poll(() => paint(runtime))
              .toMatchObject({
                width,
                height,
                svgWidth: width,
                svgHeight: height,
                thickness: '5',
                paintedThickness: '5px',
                leftOffset: 0,
                topOffset: 0,
                pathBox: { x: 0, y: 0, width, height },
              });
            await expect.poll(() => paint(designer)).toEqual(await paint(runtime));
            expect(await childBounds()).toEqual(before);
          }
          for (const expression of [designer, runtime]) {
            await evaluate(
              `(() => { const e=${expression}, doc=e.ownerDocument; for (const property of ['border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius','--wr-panel-progress-thickness']) e.style.removeProperty(property); doc.querySelector('style').textContent += ${JSON.stringify('\n.wr-webpanel { --wr-panel-progress-thickness: 7; border-radius: 11px; } .wr-webpanel[aria-disabled=true] { --wr-panel-progress-thickness: 9; }')}; })()`,
            );
            await expect
              .poll(() => paint(expression))
              .toMatchObject({ thickness: '7', paintedThickness: '7px', radius: '11px' });
            await evaluate(`${expression}.setAttribute('aria-disabled','true')`);
            await expect
              .poll(() => paint(expression))
              .toMatchObject({ thickness: '9', paintedThickness: '9px' });
            await evaluate(`${expression}.setAttribute('aria-disabled','false')`);
            await expect.poll(() => paint(expression)).toMatchObject({ thickness: '7' });
            await evaluate(
              `${expression}.ownerDocument.documentElement.style.setProperty('--wr-theme-primary','#123456')`,
            );
            expect(await paint(expression)).toMatchObject({ color: 'rgb(18, 52, 86)' });
            await evaluate(
              `${expression}.style.setProperty('--wr-panel-progress-color','#ff6600'); ${expression}.style.setProperty('--wr-panel-progress-track-color','#abcdef')`,
            );
            expect(await paint(expression)).toMatchObject({
              color: 'rgb(255, 102, 0)',
              track: 'rgb(171, 205, 239)',
            });
          }
          await fs.mkdir('out/panel-progress-review', { recursive: true });
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            'out/panel-progress-review/designer-preview.png',
            Buffer.from(screenshot.data as string, 'base64'),
          );
          for (const expression of [designer, runtime]) {
            const click =
              expression === designer
                ? `document.querySelector('#designer-child').click()`
                : `${runtime}.querySelector('button').click()`;
            await evaluate(click);
            await expect
              .poll(() => paint(expression))
              .toMatchObject({ visible: true, value: '75', dash: '75 100' });
            await evaluate(click);
            await expect.poll(() => paint(expression)).toEqual({ visible: false });
            expect(await evaluate(`${expression}.hidden`)).toBe(false);
            expect(await evaluate(`${expression}.querySelector('button') !== null`)).toBe(true);
          }
          await evaluate(`document.querySelector('#designer-child').click()`);
          await expect.poll(() => paint(designer)).toEqual({ visible: false }); // Reset to zero.
          await evaluate(`document.querySelector('#designer-child').click()`);
          await expect.poll(() => paint(designer)).toMatchObject({ visible: true, value: '25' });
          await evaluate(`document.querySelector('#designer-disable').click()`);
          await expect.poll(() => paint(designer)).toEqual({ visible: false });
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  45000,
);
