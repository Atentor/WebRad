import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileGeneratedAppStyles, compileProjectToMemory } from '@webrad/compiler';
import { findDefaultComponentStyle } from '@webrad/project-model';
import { resolveComponentStyleClassName } from '@webrad/runtime';
import { withChromium } from './chromium';
import { toggleProject, toggleUserSources } from './fixtures/toggle';
it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'matches Aurora Toggle styles in Designer and compiled Preview and handles native keyboard activation',
  async () => {
    const project = toggleProject();
    const toggle = project.pages[0]!.components.find((n) => n.id === 'toggle')!;
    const style = findDefaultComponentStyle(project.styles, 'WebToggle')!;
    const compiled = await compileProjectToMemory(project, { userSources: toggleUserSources() });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const css = await compileGeneratedAppStyles(
      project.styles,
      project.settings.scrollbar,
      project.settings.themes,
    );
    const markup = renderToStaticMarkup(
      <ComponentView
        node={toggle}
        designTime
        styleClassName={resolveComponentStyleClassName(style)}
      />,
    );
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        request.url === '/index.html'
          ? compiled.previewHtml
          : `<!doctype html><style>${css}</style><div style="width:48px;height:26px;margin:20px">${markup}</div><iframe src="/index.html" style="width:900px;height:500px"></iframe>`,
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing Toggle test port');
    try {
      await withChromium(
        process.env.WEBRAD_BROWSER_PATH!,
        `http://127.0.0.1:${address.port}`,
        async (send) => {
          const expressions = [
            'document.querySelector("[data-component-id=toggle]")',
            'document.querySelector("iframe").contentDocument.querySelector("[data-webrad-id=toggle]")',
          ];
          const evaluate = async (expression: string): Promise<unknown> => {
            const result = await send('Runtime.evaluate', { expression, returnByValue: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return (
              result.result as {
                value?: unknown;
              }
            )?.value;
          };
          await expect
            .poll(() => evaluate(`Boolean(${expressions[1]})`), { timeout: 15000 })
            .toBe(true);
          const read = (expression: string) =>
            evaluate(`(() => {
          const e = ${expression}, w = e.ownerDocument.defaultView;
          const s = w.getComputedStyle(e), track = e.querySelector('.wr-toggle-track'), thumb = e.querySelector('.wr-toggle-thumb');
          const t = w.getComputedStyle(track), b = w.getComputedStyle(thumb), box = e.getBoundingClientRect(), knob = thumb.getBoundingClientRect();
          return { role: e.getAttribute('role'), text: e.textContent, checked: e.getAttribute('aria-checked'),
            width: box.width, height: box.height, radius: s.borderRadius, border: s.borderTopWidth, gradient: s.backgroundImage,
            shadow: s.boxShadow, opacity: s.opacity, track: t.backgroundColor, thumb: b.backgroundColor,
            thumbX: Math.round(knob.left - box.left), thumbWidth: knob.width, thumbHeight: knob.height };
        })()`);
          const settle = () => new Promise((resolve) => setTimeout(resolve, 240));
          const off = await Promise.all(expressions.map(read));
          expect(off[0]).toEqual(off[1]);
          expect(off[0]).toMatchObject({
            role: 'switch',
            text: '',
            checked: 'false',
            width: 48,
            height: 26,
            radius: '6px',
            border: '1px',
            track: 'rgba(0, 0, 0, 0)',
            thumb: 'rgb(255, 255, 255)',
            thumbX: 4,
          });
          await evaluate(
            `${expressions[1]}.click(); ${expressions[0]}.setAttribute('aria-checked', 'true')`,
          );
          await settle();
          const on = await Promise.all(expressions.map(read));
          expect(on[0]).toEqual(on[1]);
          expect(on[0]).toMatchObject({ checked: 'true', track: 'rgb(37, 99, 235)', thumbX: 26 });
          expect(await evaluate(`${expressions[1]}.parentElement.dataset.changes`)).toBe('1');
          await send('DOM.enable');
          await send('CSS.enable');
          await send('DOM.getDocument', { depth: -1, pierce: true });
          const states: unknown[][] = [];
          for (const expression of expressions) {
            const object = await send('Runtime.evaluate', { expression });
            const node = await send('DOM.requestNode', {
              objectId: (
                object.result as {
                  objectId: string;
                }
              ).objectId,
            });
            const paints: unknown[] = [];
            for (const state of ['hover', 'focus-within', 'active']) {
              await send('CSS.forcePseudoState', {
                nodeId: node.nodeId,
                forcedPseudoClasses: [state],
              });
              await settle();
              paints.push(await read(expression));
            }
            await send('CSS.forcePseudoState', { nodeId: node.nodeId, forcedPseudoClasses: [] });
            await evaluate(
              `${expression}.disabled = true; ${expression}.setAttribute('aria-disabled', 'true')`,
            );
            await settle();
            const disabled = await read(expression);
            expect(disabled).toMatchObject({
              opacity: '0.6',
              track: 'rgb(148, 163, 184)',
              thumb: 'rgb(255, 255, 255)',
            });
            paints.push(disabled);
            await evaluate(
              `${expression}.disabled = false; ${expression}.setAttribute('aria-disabled', 'false'); ${expression}.ownerDocument.documentElement.style.setProperty('--wr-theme-primary', '#123456')`,
            );
            await settle();
            const linked = await read(expression);
            expect(linked).toMatchObject({ track: 'rgb(18, 52, 86)' });
            paints.push(linked);
            states.push(paints);
          }
          expect(states[0]).toEqual(states[1]);
          // Real browser key dispatch uses the focused native button in the iframe.
          await evaluate(`${expressions[1]}.focus()`);
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
          expect(await evaluate(`${expressions[1]}.getAttribute('aria-checked')`)).toBe('false');
          expect(await evaluate(`${expressions[1]}.parentElement.dataset.changes`)).toBe('2');
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
          expect(await evaluate(`${expressions[1]}.getAttribute('aria-checked')`)).toBe('true');
          expect(await evaluate(`${expressions[1]}.parentElement.dataset.changes`)).toBe('3');
          await evaluate(`${expressions[1]}.blur()`);
          expect(await evaluate(`${expressions[1]}.parentElement.dataset.focused`)).toBe('true');
          expect(await evaluate(`${expressions[1]}.parentElement.dataset.blurred`)).toBe('true');
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60000,
);
