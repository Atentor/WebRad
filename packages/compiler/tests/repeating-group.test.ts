import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  bindComponentEvent,
  createProject,
  createReusableElement,
  safeParseProject,
  updatePage,
} from '@webrad/project-model';
import { compileProjectToMemory } from '../src/index.js';
import {
  repeatingGroupProject,
  repeatingGroupUserSources,
} from '../../../tests/fixtures/repeating-group.js';

it('executes isolated row handlers in compiled Preview with real page state and stable async row values', async () => {
  const result = await compileProjectToMemory(repeatingGroupProject(), {
    userSources: repeatingGroupUserSources(),
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  let generation = 0;
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers:
              generation++ === 0
                ? [
                    { id: 1, name: 'First', 'full/name': 'First' },
                    { id: 2, name: 'Second', 'full/name': 'Second' },
                  ]
                : [{ id: 3, name: 'Replacement', 'full/name': 'Replacement' }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const document = dom.window.document;
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(8),
    );
    const group = document.querySelector<HTMLElement>('[data-webrad-id="group-fixed"]')!;
    const rows = group.querySelectorAll<HTMLElement>('[data-webrad-repeating-row]');
    expect(rows[0]!.textContent).toContain('First');
    expect(rows[1]!.textContent).toContain('Second');
    const button = rows[1]!.querySelector<HTMLButtonElement>('button')!;
    button.click();
    expect(rows[1]!.textContent).toContain('Selected Second');
    expect(rows[0]!.textContent).not.toContain('Selected');
    expect(document.querySelector('[data-webrad-id="result"]')?.textContent).toBe('Second:1');
    document.querySelector<HTMLButtonElement>('[data-webrad-id="reload"]')!.click();
    await vi.waitFor(() => expect(group.textContent).toContain('Replacement'));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-webrad-id="result"]')?.textContent).toBe(
        'Async Second:1',
      ),
    );
    const current = group.querySelector<HTMLElement>('[data-webrad-repeating-row]')!;
    current.querySelector<HTMLElement>('[data-webrad-name="Name0"]')!.click();
    expect(document.querySelector('[data-webrad-id="result"]')?.textContent).toBe('3');
    expect(group.textContent).not.toContain('Selected Second');
    button.click();
    expect(document.querySelector('[data-webrad-id="result"]')?.textContent).toBe('3');
  } finally {
    dom.window.close();
  }
}, 30_000);

it('restores the static value only in the clicked row when authored code clears its binding', async () => {
  const result = await compileProjectToMemory(repeatingGroupProject(), {
    userSources: {
      'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  async load(): Promise<void> { await ApiClient1.Load.execute(); }
  choose0(): void { Name0.currentRowBindings = []; this.Result.text = Name0.text; }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'First' },
              { id: 2, name: 'Second' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const document = dom.window.document;
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(8),
    );
    const names = document.querySelectorAll('[data-webrad-name="Name0"]');
    document.querySelectorAll<HTMLButtonElement>('[data-webrad-name="Choose0"]')[1]!.click();
    expect(names[0]?.textContent).toBe('First');
    expect(names[1]?.textContent).toBe('Name');
    expect(document.querySelector('[data-webrad-name="Result"]')?.textContent).toBe('Name');
  } finally {
    dom.window.close();
  }
}, 30_000);

it('rejects dangling row fields, incompatible visual bindings and current-row bindings outside a template', async () => {
  const project = repeatingGroupProject();
  const page = project.pages[0]!;
  const invalid = {
    ...project,
    pages: [
      {
        ...page,
        components: page.components.map((component) =>
          component.id === 'name-fixed'
            ? {
                ...component,
                props: {
                  ...component.props,
                  currentRowBindings: [
                    { property: 'caption', fieldPath: '/missing' },
                    { property: 'visible', fieldPath: '/name' },
                  ],
                },
              }
            : component.id === 'result'
              ? {
                  ...component,
                  props: {
                    ...component.props,
                    currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
                  },
                }
              : component,
        ),
      },
    ],
  };
  const result = await compileProjectToMemory(invalid, { userSources: {} });
  expect(result.success).toBe(false);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
    expect.arrayContaining([
      'Current row binding must reference a saved scalar field of the selected response-list item.',
      'Field "/name" is incompatible with the boolean property "visible".',
      'Current row bindings require a component inside a Repeating Group row template.',
    ]),
  );
});

it('preserves shadowed CurrentRow and component names while resolving visual instances across async arrows', async () => {
  const result = await compileProjectToMemory(repeatingGroupProject(), {
    userSources: {
      'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
import type { RepeatingGroup0CurrentRow } from './PageMain.generated';
import type { WebButton } from '@webrad/runtime';
export class PageMain extends PageMainGenerated {
  async load() { await ApiClient1.Load.execute(); }
  async choose0(sender: WebButton, event: Event, CurrentRow: RepeatingGroup0CurrentRow) {
    const __wrCurrentRow1 = 'collision'; void __wrCurrentRow1;
    { const CurrentRow = { value: { name: 'Local' } };
      Name0.text = CurrentRow.value.name;
      this.Name0.text += ' Value';
    }
    { const Name0 = { text: 'Local component' }; Name0.text = 'Shadow'; }
    await Promise.resolve();
    (() => { this.Name0.text += ' async'; Result.text = CurrentRow.value.name; })();
  }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'First', 'full/name': 'First' },
              { id: 2, name: 'Second', 'full/name': 'Second' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(8),
    );
    const group = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="group-fixed"]')!;
    const rows = group.querySelectorAll<HTMLElement>('[data-webrad-repeating-row]');
    rows[1]!.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(rows[1]!.textContent).toContain('Local Value async'));
    expect(rows[0]!.textContent).toContain('First');
    expect(dom.window.document.querySelector('[data-webrad-id="result"]')?.textContent).toBe(
      'Second',
    );
  } finally {
    dom.window.close();
  }
}, 30_000);

it('rejects one handler assigned to different row scopes', async () => {
  const project = repeatingGroupProject();
  const page = project.pages[0]!;
  const result = await compileProjectToMemory(
    {
      ...project,
      pages: [
        {
          ...page,
          components: page.components.map((component) =>
            component.id === 'button-row'
              ? { ...component, events: { ...component.events, OnClick: 'choose0' } }
              : component,
          ),
        },
      ],
    },
    { userSources: {} },
  );
  expect(result.success).toBe(false);
  expect(
    result.diagnostics.some((diagnostic) =>
      diagnostic.message.includes('assigned to different Repeating Groups'),
    ),
  ).toBe(true);
});

it('initializes nested repeating groups and binds events to their closest row template', async () => {
  let project = repeatingGroupProject();
  let page = project.pages[0]!;
  const config = page.components.find((component) => component.id === 'group-fixed')!.props
    .repeatingGroupConfig;
  for (const node of [
    defaultComponentRegistry.createComponent('WebRepeatingGroup', {
      id: 'nested-group',
      name: 'Nested',
      parentId: 'panel-fixed',
      props: { repeatingGroupConfig: config },
    }),
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'nested-name',
      name: 'InnerName',
      parentId: 'nested-group',
      props: { currentRowBindings: [{ property: 'caption', fieldPath: '/name' }] },
    }),
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'nested-button',
      name: 'InnerChoose',
      parentId: 'nested-group',
    }),
  ])
    page = addComponent(page, node, node.parentId!);
  page = bindComponentEvent(page, 'nested-button', 'OnClick', 'innerClick');
  project = updatePage(project, page.id, page);
  const result = await compileProjectToMemory(project, {
    userSources: {
      'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
import type { NestedCurrentRow } from './PageMain.generated';
import type { WebButton } from '@webrad/runtime';
export class PageMain extends PageMainGenerated {
  async load() { await ApiClient1.Load.execute(); }
  innerClick(sender: WebButton, event: Event, CurrentRow: NestedCurrentRow) {
    this.InnerName.text = 'Nested ' + CurrentRow.value.name;
    Result.text = CurrentRow.value.name;
  }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'First', 'full/name': 'First' },
              { id: 2, name: 'Second', 'full/name': 'Second' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(12),
    );
    const groups = dom.window.document.querySelectorAll<HTMLElement>('[data-webrad-name="Nested"]');
    expect(groups).toHaveLength(2);
    const rows = groups[1]!.querySelectorAll<HTMLElement>('[data-webrad-repeating-row]');
    rows[1]!.querySelector<HTMLButtonElement>('[data-webrad-name="InnerChoose"]')!.click();
    expect(rows[1]!.textContent).toContain('Nested Second');
    expect(rows[0]!.textContent).not.toContain('Nested');
    expect(groups[0]!.textContent).not.toContain('Nested');
    expect(dom.window.document.querySelector('[data-webrad-id="result"]')?.textContent).toBe(
      'Second',
    );
  } finally {
    dom.window.close();
  }
}, 30_000);

it('keeps repeating groups inside separate authored reusable placements isolated', async () => {
  const original = repeatingGroupProject().pages[0]!;
  const reusable = createReusableElement('CustomerRows');
  const kept = new Set([
    original.rootComponentId,
    'customers-api',
    'group-fixed',
    'panel-fixed',
    'name-fixed',
    'button-fixed',
    'result',
  ]);
  const definition = {
    ...reusable,
    width: 960,
    height: 700,
    components: original.components
      .filter((node) => kept.has(node.id))
      .map((node) =>
        node.id === original.rootComponentId
          ? {
              ...node,
              styleId: undefined,
              id: reusable.rootComponentId,
              name: reusable.name,
              type: 'WebPanel',
              bounds: { ...node.bounds, width: 960, height: 700 },
              events: {},
              children: node.children.filter((id) => kept.has(id)),
            }
          : {
              ...node,
              styleId: undefined,
              parentId:
                node.parentId === original.rootComponentId
                  ? reusable.rootComponentId
                  : node.parentId,
              children: node.children.filter((id) => kept.has(id)),
            },
      ),
  };
  const base = createProject('ReusableRepeating');
  const validation = safeParseProject({ ...base, reusableElements: [definition] });
  expect(
    validation.success,
    validation.success ? '' : JSON.stringify(validation.error.issues),
  ).toBe(true);
  let project = addReusableElement(base, definition);
  let page = project.pages[0]!;
  for (const [id, name] of [
    ['first-placement', 'FirstPlacement'],
    ['second-placement', 'SecondPlacement'],
  ] as const) {
    const placement = defaultComponentRegistry.createComponent('WebReusableElement', {
      id,
      name,
      parentId: page.rootComponentId,
      props: { reusableElementId: definition.id },
    });
    page = addComponent(page, placement, page.rootComponentId);
  }
  project = updatePage(project, page.id, page);
  const result = await compileProjectToMemory(project, {
    userSources: {
      'reusables/CustomerRows.ts': `import { CustomerRowsGenerated } from './CustomerRows.generated';
import type { RepeatingGroup0CurrentRow } from './CustomerRows.generated';
import type { WebButton, WebComponent } from '@webrad/runtime';
export class CustomerRows extends CustomerRowsGenerated {
  #clicks = 0;
  constructor(element: HTMLElement, instanceId: string, components: ReadonlyMap<string, WebComponent>, ids: ReadonlyMap<string, string>) {
    super(element, instanceId, components, ids); void this.ApiClient1.Load.execute();
  }
  choose0(sender: WebButton, event: Event, CurrentRow: RepeatingGroup0CurrentRow) {
    this.#clicks++; Name0.text = 'Selected ' + CurrentRow.value.name;
    this.Result.text = CurrentRow.value.name + ':' + this.#clicks;
  }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  let request = 0;
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [{ id: ++request, name: `Placement${request}`, 'full/name': 'Customer' }],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(2),
    );
    const first = dom.window.document.querySelector<HTMLElement>(
      '[data-webrad-id="first-placement"]',
    )!;
    const second = dom.window.document.querySelector<HTMLElement>(
      '[data-webrad-id="second-placement"]',
    )!;
    first.querySelector<HTMLButtonElement>('[data-webrad-name="Choose0"]')!.click();
    expect(first.querySelector('[data-webrad-name="Result"]')?.textContent).toBe('Placement1:1');
    expect(second.querySelector('[data-webrad-name="Result"]')?.textContent).toBe('Waiting');
    second.querySelector<HTMLButtonElement>('[data-webrad-name="Choose0"]')!.click();
    expect(second.querySelector('[data-webrad-name="Result"]')?.textContent).toBe('Placement2:1');
    expect(first.querySelector('[data-webrad-name="Result"]')?.textContent).toBe('Placement1:1');
  } finally {
    dom.window.close();
  }
}, 30_000);

it('constructs authored reusable classes in each row with independent state and inferred CurrentRow', async () => {
  let definition = createReusableElement('RowCard');
  for (const node of [
    defaultComponentRegistry.createComponent('WebLabel', {
      id: 'card-detail',
      name: 'Detail',
      parentId: definition.rootComponentId,
      props: { caption: 'Untouched' },
    }),
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'card-action',
      name: 'Action',
      parentId: definition.rootComponentId,
    }),
  ])
    definition = addComponent(definition, node, definition.rootComponentId);
  definition = bindComponentEvent(definition, 'card-action', 'OnClick', 'choose');
  let project = addReusableElement(repeatingGroupProject(), definition);
  let page = project.pages[0]!;
  for (const [id, name] of [
    ['row-card-a', 'CardA'],
    ['row-card-b', 'CardB'],
  ] as const) {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id,
        name,
        parentId: 'panel-fixed',
        props: { reusableElementId: definition.id },
      }),
      'panel-fixed',
    );
  }
  project = updatePage(project, page.id, page);
  const result = await compileProjectToMemory(project, {
    userSources: {
      ...repeatingGroupUserSources(),
      'reusables/RowCard.ts': `import { RowCardGenerated } from './RowCard.generated';
import type { WebButton, WebRepeatingGroupCurrentRow } from '@webrad/runtime';
export class RowCard extends RowCardGenerated {
  #clicks = 0;
  choose(sender: WebButton, event: Event, CurrentRow: WebRepeatingGroupCurrentRow<{ id: number; name: string }>) {
    this.#clicks++; Detail.text = CurrentRow.value.name + ':' + this.#clicks;
  }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'First', 'full/name': 'First' },
              { id: 2, name: 'Second', 'full/name': 'Second' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[data-webrad-name="RowCard"]')).toHaveLength(4),
    );
    const group = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="group-fixed"]')!;
    const rows = group.querySelectorAll<HTMLElement>('[data-webrad-repeating-row]');
    const first = rows[0]!.querySelectorAll<HTMLElement>('[data-webrad-name="RowCard"]');
    const second = rows[1]!.querySelectorAll<HTMLElement>('[data-webrad-name="RowCard"]');
    second[0]!.querySelector<HTMLButtonElement>('[data-webrad-name="Action"]')!.click();
    expect(second[0]!.querySelector('[data-webrad-name="Detail"]')?.textContent).toBe('Second:1');
    expect(second[1]!.querySelector('[data-webrad-name="Detail"]')?.textContent).toBe('Untouched');
    expect(first[0]!.querySelector('[data-webrad-name="Detail"]')?.textContent).toBe('Untouched');
    second[1]!.querySelector<HTMLButtonElement>('[data-webrad-name="Action"]')!.click();
    expect(second[1]!.querySelector('[data-webrad-name="Detail"]')?.textContent).toBe('Second:1');
    second[0]!.querySelector<HTMLButtonElement>('[data-webrad-name="Action"]')!.click();
    expect(second[0]!.querySelector('[data-webrad-name="Detail"]')?.textContent).toBe('Second:2');
  } finally {
    dom.window.close();
  }
}, 30_000);

it('resolves method parameter defaults and arrow or function property handlers to the clicked second row', async () => {
  const result = await compileProjectToMemory(repeatingGroupProject(), {
    userSources: {
      'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
import type { RepeatingGroup0CurrentRow, RepeatingGroup1CurrentRow, RepeatingGroup2CurrentRow, RepeatingGroup3CurrentRow } from './PageMain.generated';
import type { WebButton, WebLabel } from '@webrad/runtime';
export class PageMain extends PageMainGenerated {
  async load() { await ApiClient1.Load.execute(); }
  choose0(sender: WebButton, event: Event, CurrentRow: RepeatingGroup0CurrentRow, label: WebLabel = this.Name0) {
    label.text = 'Default ' + CurrentRow.value.name;
  }
  choose1 = async (sender: WebButton, event: Event, CurrentRow: RepeatingGroup1CurrentRow) => {
    { const CurrentRow = { value: { name: 'Local' } }; Name1.text = 'Arrow ' + CurrentRow.value.name; }
    await Promise.resolve(); (() => { this.Name1.text += ' ' + CurrentRow.value.name; })();
  };
  choose2 = function(sender: WebButton, event: Event, CurrentRow: RepeatingGroup2CurrentRow) { Name2.text = 'Function ' + CurrentRow.value.name; };
  choose3 = (sender: WebButton, event: Event, CurrentRow: RepeatingGroup3CurrentRow) => Name3.text = 'Expression ' + CurrentRow.value.name;
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Headers: { value: globalThis.Headers },
    fetch: {
      value: async () =>
        new Response(
          JSON.stringify({
            customers: [
              { id: 1, name: 'First', 'full/name': 'First' },
              { id: 2, name: 'Second', 'full/name': 'Second' },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[data-webrad-repeating-row]')).toHaveLength(8),
    );
    for (const [mode, expected] of [
      ['fixed', 'Default Second'],
      ['align-to-parent', 'Arrow Local Second'],
      ['row', 'Function Second'],
      ['column', 'Expression Second'],
    ]) {
      const group = dom.window.document.querySelector<HTMLElement>(
        `[data-webrad-id="group-${mode}"]`,
      )!;
      const rows = group.querySelectorAll<HTMLElement>('[data-webrad-repeating-row]');
      rows[1]!.querySelector<HTMLButtonElement>('button')!.click();
      await vi.waitFor(() => expect(rows[1]!.textContent).toContain(expected));
      expect(rows[0]!.textContent).toContain('First');
      expect(rows[0]!.textContent).not.toContain(expected);
    }
  } finally {
    dom.window.close();
  }
}, 30_000);
