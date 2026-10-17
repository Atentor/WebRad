import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { compileProjectToMemory } from '../src/index.js';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  createProject,
  createReusableElement,
  updatePage,
} from '@webrad/project-model';
import {
  comboBoxBinding,
  comboBoxProject,
  comboBoxUserSources,
} from '../../../tests/fixtures/combo-box.js';

it.each(['api', 'static'] as const)(
  'executes a compiled %s ComboBox and passes the selected key to authored OnChange code',
  async (mode) => {
    const initial = comboBoxProject();
    const project =
      mode === 'api'
        ? initial
        : {
            ...initial,
            pages: initial.pages.map((page) => ({
              ...page,
              components: page.components.map((component) =>
                component.type === 'WebComboBox'
                  ? {
                      ...component,
                      props: {
                        ...component.props,
                        comboBoxConfig: null,
                        items: ['Ana', 'Bruno'],
                        values: ['1', '2'],
                      },
                    }
                  : component,
              ),
            })),
          };
    const page = project.pages[0];
    if (page === undefined) throw new Error('Missing page.');
    const result = await compileProjectToMemory(project, {
      userSources: comboBoxUserSources(page.name),
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: {
        value: async () =>
          new Response(
            JSON.stringify({
              customers: [
                { id: 1, name: 'Ana' },
                { id: 2, name: 'Bruno' },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      },
      Headers: { value: globalThis.Headers },
      ReadableStream: { value: globalThis.ReadableStream },
      AbortController: { value: globalThis.AbortController },
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      const select = dom.window.document.querySelector<HTMLSelectElement>(
        '[data-webrad-id="customer-combo"]',
      );
      await expect.poll(() => select?.options.length).toBe(2);
      expect(select?.options[0]?.textContent).toBe('Ana');
      expect(select?.value).toBe('2');
      if (select === null) throw new Error('Missing ComboBox.');
      select.value = '1';
      select.dispatchEvent(new dom.window.Event('change'));
      expect(
        dom.window.document.querySelector('[data-webrad-id="selected-label"]')?.textContent,
      ).toBe('1');
    } finally {
      dom.window.close();
    }
  },
);

it('rejects a static Values list which does not match the Items count', async () => {
  const initial = comboBoxProject();
  const project = {
    ...initial,
    pages: initial.pages.map((page) => ({
      ...page,
      components: page.components.map((component) =>
        component.type === 'WebComboBox'
          ? {
              ...component,
              props: {
                ...component.props,
                comboBoxConfig: null,
                items: ['Ana', 'Bruno'],
                values: ['1'],
              },
            }
          : component,
      ),
    })),
  };
  const result = await compileProjectToMemory(project, { userSources: {} });
  expect(result.success).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      path: expect.arrayContaining(['values']),
      message: 'WebComboBox Values must have one value per Item.',
    }),
  );
});

it.each([
  ['apiClientId', 'missing-client'],
  ['operationId', 'missing-operation'],
  ['listPath', '/missing-list'],
  ['displayField', '/missing-label'],
  ['keyField', '/missing-key'],
] as const)('rejects an invalid ComboBox %s before Preview compilation', async (field, value) => {
  const project = comboBoxProject();
  const invalid = {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      components: page.components.map((component) =>
        component.type === 'WebComboBox'
          ? {
              ...component,
              props: { ...component.props, comboBoxConfig: { ...comboBoxBinding, [field]: value } },
            }
          : component,
      ),
    })),
  };
  const result = await compileProjectToMemory(invalid, { userSources: {} });
  expect(result.success).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      source: 'registry',
      path: expect.arrayContaining(['comboBoxConfig', field]),
    }),
  );
});

it('isolates the API result and selected key in two compiled reusable placements', async () => {
  const fixturePage = comboBoxProject().pages[0];
  if (fixturePage === undefined) throw new Error('Missing fixture.');
  const reusable = createReusableElement('CustomerPicker');
  const root = reusable.components[0];
  if (root === undefined) throw new Error('Missing reusable root.');
  const children = fixturePage.components.filter(
    (component) => component.id !== fixturePage.rootComponentId,
  );
  const definition = {
    ...reusable,
    components: [
      { ...root, children: children.map((component) => component.id) },
      ...children.map((component) => ({ ...component, parentId: root.id })),
    ],
  };
  let project = addReusableElement(createProject('ReusableComboBoxes'), definition);
  let page = project.pages[0];
  if (page === undefined) throw new Error('Missing host page.');
  for (const [index, name] of ['PickerOne', 'PickerTwo'].entries()) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: name,
        name,
        parentId: page.rootComponentId,
        y: index * 240,
        props: { reusableElementId: definition.id },
      }),
      page.rootComponentId,
    );
  }
  project = updatePage(project, page.id, { components: page.components });
  const result = await compileProjectToMemory(project, {
    userSources: {
      'reusables/CustomerPicker.ts': `import type { WebComponent } from '@webrad/runtime';
import { CustomerPickerGenerated } from './CustomerPicker.generated';
export class CustomerPicker extends CustomerPickerGenerated {
  public constructor(element: HTMLElement, instanceId: string, components: ReadonlyMap<string, WebComponent>, ids: ReadonlyMap<string, string>) {
    super(element, instanceId, components, ids);
    void ApiClient1.Load.execute();
  }
  public async loadCustomers(): Promise<void> { await ApiClient1.Load.execute(); }
  public choiceChanged(): void { SelectedKey.text = ComboBox1.value; }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  let sequence = 0;
  Object.defineProperties(dom.window, {
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'Ana' },
              { id: 2, name: `Bruno ${String(++sequence)}` },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    },
    Headers: { value: globalThis.Headers },
    ReadableStream: { value: globalThis.ReadableStream },
    AbortController: { value: globalThis.AbortController },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const selects = [...dom.window.document.querySelectorAll<HTMLSelectElement>('select')];
    expect(selects).toHaveLength(2);
    await expect.poll(() => selects.map((select) => select.options.length)).toEqual([2, 2]);
    expect(selects.map((select) => select.options[1]?.textContent)).toEqual(['Bruno 1', 'Bruno 2']);
    const first = selects[0];
    if (first === undefined) throw new Error('Missing picker.');
    first.value = '1';
    first.dispatchEvent(new dom.window.Event('change'));
    expect(selects.map((select) => select.value)).toEqual(['1', '2']);
    expect(
      [...dom.window.document.querySelectorAll('[data-webrad-name="SelectedKey"]')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['1', 'Waiting']);
  } finally {
    dom.window.close();
  }
});
