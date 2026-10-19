import { createServer } from 'node:http';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { ComponentView, SharedComponentStyles } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';
import { withChromium } from './chromium';

it.runIf(process.env.WEBRAD_BROWSER_PATH !== undefined)(
  'preserves saved and legacy TextArea spell checking in Designer and compiled Preview with typed runtime changes',
  async () => {
    const initial = createProject('TextAreaSpellCheck');
    let page = initial.pages[0]!;
    for (const [index, spellCheck] of [false, true, undefined].entries()) {
      const node = defaultComponentRegistry.createComponent('WebTextArea', {
        id: `notes-${index}`,
        name: `Notes${index}`,
        parentId: page.rootComponentId,
        x: 20,
        y: 20 + index * 140,
        props: { value: 'procedure GeraExcel(const S_CAMINHO_ARQ: String);', spellCheck },
      });
      const props = { ...node.props };
      if (spellCheck === undefined) delete props.spellCheck;
      page = addComponent(page, { ...node, props }, page.rootComponentId);
    }
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebButton', {
        id: 'toggle',
        name: 'ToggleSpellCheck',
        parentId: page.rootComponentId,
        x: 400,
        y: 20,
        props: { caption: 'Toggle spell checking' },
      }),
      page.rootComponentId,
    );
    page = bindComponentEvent(page, 'toggle', 'OnClick', 'toggleSpellCheck');
    const project = updatePage(initial, page.id, { components: page.components });
    const compiled = await compileProjectToMemory(project, {
      userSources: {
        [`pages/${page.name}.ts`]: `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  public toggleSpellCheck(): void {
    const current: boolean = this.Notes0.spellCheck;
    Notes0.spellCheck = !current;
  }
}`,
      },
    });
    expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
    const designer = renderToStaticMarkup(
      <>
        <SharedComponentStyles />
        {page.components
          .filter((node) => node.type === 'WebTextArea')
          .map((node) => (
            <ComponentView key={node.id} node={node} designTime />
          ))}
      </>,
    );
    const server = createServer((request, response) => {
      const route = request.url?.slice(1) ?? '';
      response.setHeader(
        'Content-Type',
        route.endsWith('.js')
          ? 'text/javascript'
          : route.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      );
      response.end(
        route === 'designer'
          ? designer
          : route === ''
            ? compiled.previewHtml
            : (compiled.files[route] ?? ''),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing TextArea test port');
    try {
      for (const mode of ['designer', '']) {
        await withChromium(
          process.env.WEBRAD_BROWSER_PATH!,
          `http://127.0.0.1:${address.port}/${mode}`,
          async (send) => {
            const evaluate = async (expression: string): Promise<unknown> => {
              const result = await send('Runtime.evaluate', { expression, returnByValue: true });
              expect(result.exceptionDetails).toBeUndefined();
              return (result.result as { value?: unknown }).value;
            };
            await expect
              .poll(() => evaluate('document.querySelectorAll("textarea").length'))
              .toBe(3);
            const read = `Array.from(document.querySelectorAll('textarea'), e => ({ enabled: e.spellcheck, attribute: e.getAttribute('spellcheck') }))`;
            expect(await evaluate(read)).toEqual([
              { enabled: false, attribute: 'false' },
              { enabled: true, attribute: 'true' },
              { enabled: true, attribute: 'true' },
            ]);
            if (mode === '') {
              for (const enabled of [true, false]) {
                await evaluate(`document.querySelector('[data-webrad-id="toggle"]').click()`);
                expect(await evaluate(read)).toEqual([
                  { enabled, attribute: String(enabled) },
                  { enabled: true, attribute: 'true' },
                  { enabled: true, attribute: 'true' },
                ]);
              }
            }
          },
        );
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
  60_000,
);
