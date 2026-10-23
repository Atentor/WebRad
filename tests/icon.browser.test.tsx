import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { findDefaultComponentStyle } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { withChromium } from './chromium';
import { iconProject, iconUserSources } from './fixtures/icon';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'matches Lucide Designer/Preview styles and SVG geometry, and activates captionless buttons by native keyboard',
  async () => {
    const project = iconProject();
    const nodes = project.pages[0]!.components.filter((n) => n.type === 'WebIcon');
    const style = findDefaultComponentStyle(project.styles, 'WebIcon')!;
    const compiled = await compileProjectToMemory(project, { userSources: iconUserSources() });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.colorPalette,
    );
    const markup = nodes
      .map(
        (node) =>
          `<div style="width:${node.bounds.width}px;height:${node.bounds.height}px;margin:20px">${renderToStaticMarkup(<ComponentView node={node} designTime styleClassName={resolveComponentStyleClassName(style)} />)}</div>`,
      )
      .join('');
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        request.url === '/preview'
          ? compiled.previewHtml
          : `<!doctype html><style>${css}</style><main style="display:flex;align-items:start"><section>${markup}</section><iframe src="/preview" style="width:850px;height:450px;border:0"></iframe></main>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing icons test port');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          const evaluate = async (expression: string): Promise<unknown> => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (result.result as { value?: unknown }).value;
          };
          const runtime = (mode: string) =>
            `document.querySelector('iframe').contentDocument.querySelector('[data-webrad-id=${mode}]')`;
          const designer = (mode: string) =>
            `document.querySelector('[data-component-id=${mode}]')`;
          const paint = (expression: string) =>
            evaluate(`(() => {
            const e = ${expression}, s = e.ownerDocument.defaultView.getComputedStyle(e), b = e.getBoundingClientRect();
            return { color: s.color, background: s.backgroundColor, border: s.border, shadow: s.boxShadow, outline: s.outlineStyle, transform: s.transform, opacity: s.opacity, width: b.width, height: b.height };
          })()`);
          await expect
            .poll(() => evaluate(`Boolean(${runtime('button')})`), { timeout: 15_000 })
            .toBe(true);
          const read = (expression: string) =>
            evaluate(`(() => {
        const e = ${expression}, svg = e.querySelector('svg'), w = e.ownerDocument.defaultView, s = w.getComputedStyle(e);
        const b = e.getBoundingClientRect(), g = svg.getBoundingClientRect();
        return { role: e.getAttribute('role'), label: e.getAttribute('aria-label'), caption: e.textContent,
          color: s.color, background: s.backgroundColor, borderWidth: s.borderTopWidth, radius: s.borderRadius, cursor: s.cursor,
          width: b.width, height: b.height, graphicWidth: g.width, graphicHeight: g.height,
          viewBox: svg.getAttribute('viewBox'), stroke: w.getComputedStyle(svg).stroke,
          shapes: [...svg.children].map(c => [c.tagName, [...c.attributes].map(a => [a.name, a.value])]) };
      })()`);
          for (const mode of ['icon', 'button']) {
            expect(await read(runtime(mode))).toEqual(await read(designer(mode)));
            expect(await read(runtime(mode))).toMatchObject({
              caption: '',
              width: 48,
              height: 48,
              viewBox: '0 0 24 24',
              color: 'rgb(37, 99, 235)',
            });
          }
          const idlePaint = await paint(runtime('button'));
          expect(idlePaint).toMatchObject({ shadow: 'none', outline: 'none' });
          for (const expression of [designer('button'), runtime('button')]) {
            const baseline = await paint(expression);
            const position = (await evaluate(
              `(() => { const e = ${expression}, b = e.getBoundingClientRect(), iframe = e.ownerDocument === document ? null : document.querySelector('iframe'), f = iframe?.getBoundingClientRect(); return { x: b.x + b.width / 2 + (f?.x ?? 0), y: b.y + b.height / 2 + (f?.y ?? 0) }; })()`,
            )) as { x: number; y: number };
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position });
            expect(await paint(expression)).toEqual(baseline);
            await send('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              button: 'left',
              buttons: 1,
              clickCount: 1,
              ...position,
            });
            expect(await paint(expression)).toEqual(baseline);
            // Release away from the button to test :active/focus without firing its application handler.
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, buttons: 1 });
            await send('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x: 1,
              y: 1,
              button: 'left',
              buttons: 0,
              clickCount: 1,
            });
            expect(await paint(expression)).toEqual(baseline);
          }
          // Non-square responsive bounds preserve the SVG's 24x24 viewBox proportions.
          for (const [width, height] of [
            [32, 32],
            [96, 40],
          ]) {
            for (const expression of [runtime('icon'), designer('icon')])
              await evaluate(
                `${expression}.style.setProperty('width','${width}px','important'); ${expression}.style.setProperty('height','${height}px','important')`,
              );
            expect(await read(runtime('icon'))).toEqual(await read(designer('icon')));
            expect(
              await evaluate(
                `(() => { const m = ${runtime('icon')}.querySelector('svg circle').getScreenCTM(); return m.a / m.d; })()`,
              ),
            ).toBe(1);
          }
          await fs.mkdir('out/icons-review', { recursive: true });
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(
            'out/icons-review/designer-preview.png',
            Buffer.from(screenshot.data as string, 'base64'),
          );
          await evaluate(`${runtime('icon')}.click()`);
          expect(await evaluate(`${runtime('icon')}.dataset.webradIcon`)).toBe('camera');
          await evaluate(`${runtime('button')}.focus()`);
          expect(
            await evaluate(
              `${runtime('button')}.ownerDocument.activeElement === ${runtime('button')}`,
            ),
          ).toBe(true);
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            text: '\r',
            unmodifiedText: '\r',
          });
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          });
          expect(await evaluate(`${runtime('icon')}.parentElement.dataset.activations`)).toBe('1');
          expect(await paint(runtime('button'))).toEqual(idlePaint);
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: ' ',
            code: 'Space',
            windowsVirtualKeyCode: 32,
          });
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: ' ',
            code: 'Space',
            windowsVirtualKeyCode: 32,
          });
          expect(await evaluate(`${runtime('icon')}.parentElement.dataset.activations`)).toBe('2');
          expect(await paint(runtime('button'))).toEqual(idlePaint);
          expect(await evaluate(`${runtime('icon')}.dataset.webradIcon`)).toBe('check');
          await evaluate(`${runtime('button')}.disabled = true; ${runtime('button')}.click()`);
          await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          });
          await send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
          });
          expect(await evaluate(`${runtime('icon')}.parentElement.dataset.activations`)).toBe('2');
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60_000,
);
