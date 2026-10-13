// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { componentRegistry } from '@webrad/component-registry';
import { createDefaultComponentLayout } from '@webrad/project-model';
import { comboBoxApiConfiguration } from '../../../tests/fixtures/combo-box.js';
import {
  WebApiClient,
  type WebButton,
  WebCheckBox,
  WebLabel,
  WebRepeatingGroup,
  WebComponentScope,
  applyCurrentRowBindings,
  getRepeatingGroupCurrentRow,
  mountPage,
  normalizeWebRepeatingGroupConfiguration,
  readCurrentRowField,
  setRepeatingGroupReusableFactory,
  type RuntimeComponentNode,
  type RuntimePageModel,
  type WebRepeatingGroupCurrentRow,
} from '../src/index.js';

afterEach(() => {
  document.body.replaceChildren();
  setRepeatingGroupReusableFactory(() => undefined);
});

function node(
  type: string,
  id: string,
  parentId: string | null,
  props: Readonly<Record<string, unknown>> = {},
  children: readonly string[] = [],
): RuntimeComponentNode {
  return {
    ...componentRegistry.createComponent(type, {
      id,
      name: id.replace(/\W/gu, '_'),
      parentId,
      props,
    }),
    children,
  };
}
function setup(extra: readonly RuntimeComponentNode[] = []) {
  const root = node('WebPage', 'root', null, {}, ['group']);
  const group = node('WebRepeatingGroup', 'group', 'root', {}, ['name', 'button']);
  const model: RuntimePageModel = {
    id: 'page',
    name: 'PageMain',
    caption: 'Rows',
    width: 800,
    height: 600,
    rootComponentId: 'root',
    components: [
      root,
      group,
      node('WebLabel', 'name', 'group', {
        caption: 'Fallback',
        currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
      }),
      node('WebButton', 'button', 'group', {
        caption: 'Select',
        currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
      }),
      ...extra,
    ],
  };
  const mounted = mountPage(model);
  const repeater = mounted.components.get('group') as WebRepeatingGroup<{ name: string }>;
  return { mounted, repeater, model };
}

describe('Repeating Group runtime', () => {
  it('mounts one template per row, binds native visual values safely, and isolates concrete instances', () => {
    const { repeater, mounted } = setup();
    expect(mounted.components.has('name')).toBe(false);
    repeater.rows = [{ name: '<script>unsafe()</script>' }, { name: 'Bruno' }];
    expect(repeater.rowCount).toBe(2);
    const first = repeater.getRow(0).component<WebLabel>('name');
    const second = repeater.getRow(1).component<WebLabel>('name');
    expect(first.caption).toBe('<script>unsafe()</script>');
    expect(first.element.querySelector('script')).toBeNull();
    expect(first.id).not.toBe(second.id);
    first.caption = 'Only first';
    expect(second.caption).toBe('Bruno');
    expect(repeater.element.querySelector('thead')).toBeNull();
    expect(repeater.element.querySelector('[role=columnheader]')).toBeNull();
    mounted.dispose();
  });

  it('shares renderer state with generated wrappers and preserves event row context across response replacement', async () => {
    const { mounted, repeater } = setup();
    const generated = new WebRepeatingGroup<{ name: string }>(repeater.element);
    let continueHandler: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      continueHandler = resolve;
    });
    let captured: WebRepeatingGroupCurrentRow<{ name: string }> | undefined;
    const unsubscribe = generated.subscribeRows((row) =>
      row.component<WebButton>('button').bindEvent('OnClick', async () => {
        await gate;
        captured = row;
      }),
    );
    generated.rows = [{ name: 'Ana' }];
    const oldButton = generated.getRow(0).component<WebButton>('button');
    oldButton.element.click();
    generated.rows = [{ name: 'Bruno' }];
    continueHandler?.();
    await gate;
    await Promise.resolve();
    expect(captured?.value.name).toBe('Ana');
    expect(captured?.component<WebButton>('button').caption).toBe('Ana');
    expect(generated.getRow(0).value.name).toBe('Bruno');
    unsubscribe();
    mounted.dispose();
  });

  it('passes row context with the real authored receiver and tears down generated event bindings', () => {
    const { mounted, repeater } = setup();
    class Scope extends WebComponentScope {
      #selected = '';
      public get selected(): string {
        return this.#selected;
      }
      public bind(button: WebButton): () => void {
        return this.bindGeneratedEvent(button, 'OnClick', 'handle');
      }
      public handle(
        _sender: WebButton,
        _event: Event,
        CurrentRow: WebRepeatingGroupCurrentRow<{ name: string }>,
      ): void {
        this.#selected = CurrentRow.value.name;
      }
    }
    const scope = new Scope(mounted.element);
    const cleanup = vi.fn();
    repeater.subscribeRows((row) => {
      const unbind = scope.bind(row.component<WebButton>('button'));
      return () => {
        cleanup();
        unbind();
      };
    });
    repeater.rows = [{ name: 'Ana' }];
    const previous = repeater.getRow(0).component<WebButton>('button');
    expect(getRepeatingGroupCurrentRow(previous.element)?.value).toEqual({ name: 'Ana' });
    previous.element.click();
    expect(scope.selected).toBe('Ana');
    repeater.rows = [{ name: 'Bruno' }];
    expect(cleanup).toHaveBeenCalledTimes(1);
    previous.element.click();
    expect(scope.selected).toBe('Ana');
    repeater.getRow(0).component<WebButton>('button').element.click();
    expect(scope.selected).toBe('Bruno');
    scope.dispose();
    mounted.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('subscribes to the selected operation without requesting, preserves rows during unrelated updates, and supports scoped clients', async () => {
    const { mounted, repeater } = setup();
    const values: unknown[] = [
      { customers: [{ name: 'Ana' }] },
      { customers: [{ name: 'Other' }] },
      { customers: null },
      { unexpected: [] },
    ];
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(values.shift()), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const config = comboBoxApiConfiguration();
    const first = config.operations[0];
    if (first === undefined) throw new Error('Missing fixture operation.');
    const api = new WebApiClient({
      id: 'placement:customers-api',
      baseUrl: 'https://api.example.test',
      apiClientConfig: {
        ...config,
        operations: [...config.operations, { ...first, id: 'other', name: 'Other' }],
      },
      fetch: fetcher,
    });
    repeater.repeatingGroupConfig = {
      ...normalizeWebRepeatingGroupConfiguration(undefined),
      apiClientId: 'customers-api',
      operationId: 'load-customers',
      listPath: '/customers',
    };
    repeater.bindApiClient(api);
    expect(fetcher).not.toHaveBeenCalled();
    await api.execute('Load');
    const row = repeater.getRow(0);
    await api.execute('Other');
    expect(repeater.getRow(0)).toBe(row);
    expect(repeater.rows).toEqual([{ name: 'Ana' }]);
    await api.execute('Load');
    expect(repeater.rows).toEqual([]);
    await api.execute('Load');
    expect(repeater.rows).toEqual([]);
    expect(repeater.element.textContent).toBe('No data');
    repeater.bindApiClient(null);
    mounted.dispose();
    api.dispose();
  });

  it('supports primitive list values, escaped pointers, null and missing fields without modifying prototypes', () => {
    const label = new WebLabel(document.createElement('span'));
    label.caption = 'Fallback';
    applyCurrentRowBindings(label, [{ property: 'caption', fieldPath: '' }], 42);
    expect(label.caption).toBe('42');
    applyCurrentRowBindings(label, [{ property: 'caption', fieldPath: '/missing' }], {});
    expect(label.caption).toBe('');
    applyCurrentRowBindings(
      label,
      [
        { property: '__proto__', fieldPath: '' },
        { property: 'element', fieldPath: '' },
      ],
      'ignored',
    );
    expect(label).toBeInstanceOf(WebLabel);
    expect(readCurrentRowField({ 'a/b': { '~key': 'yes' } }, '/a~1b/~0key')).toBe('yes');
    expect(readCurrentRowField({}, '/constructor')).toBeUndefined();
    expect(readCurrentRowField(null, '/name')).toBeUndefined();
    expect(readCurrentRowField({}, '/~2')).toBeUndefined();
    const input = document.createElement('input');
    input.type = 'checkbox';
    const checkbox = new WebCheckBox(input);
    applyCurrentRowBindings(checkbox, [{ property: 'checked', fieldPath: '/active' }], {
      active: 'false',
    });
    expect(checkbox.checked).toBe(false);
  });

  it('preserves responsive template child rules while projecting independent fixed and dynamic rows', () => {
    const { repeater, mounted, model } = setup();
    const original = model.components.find((component) => component.id === 'group');
    if (original === undefined) throw new Error('Missing group.');
    const layout = createDefaultComponentLayout();
    const group = {
      ...original,
      layout: {
        ...layout,
        container: { ...layout.container, mode: 'row' as const, wrap: true, gap: 12 },
      },
    };
    mounted.dispose();
    const next = mountPage({
      ...model,
      components: model.components.map((component) =>
        component.id === 'group' ? group : component,
      ),
    });
    const flow = next.components.get('group') as WebRepeatingGroup;
    flow.rows = [{ name: 'Ana' }];
    expect(flow.element.style.display).not.toBe('flex');
    expect(flow.getRow(0).element.style.display).toBe('flex');
    expect(flow.getRow(0).element.style.flexDirection).toBe('row');
    expect(flow.getRow(0).element.style.flexWrap).toBe('wrap');
    expect(flow.getRow(0).element.style.height).toBe('auto');
    flow.repeatingGroupConfig = {
      ...flow.repeatingGroupConfig,
      rowHeightMode: 'fixed',
      fixedRowHeight: 64,
    };
    expect(flow.getRow(0).element.style.height).toBe('64px');
    expect(repeater.rows).toEqual([]);
    next.dispose();
  });

  it('reserves adversarial persisted IDs when creating physical row identities', () => {
    const { model, mounted } = setup();
    mounted.dispose();
    const occupied = '@wr-row:group:0:name';
    const next = mountPage({
      ...model,
      components: model.components
        .map((component) =>
          component.id === 'root'
            ? { ...component, children: [...component.children, occupied] }
            : component,
        )
        .concat(node('WebLabel', occupied, 'root')),
    });
    const repeater = next.components.get('group') as WebRepeatingGroup;
    repeater.rows = [{ name: 'Ana' }];
    expect(repeater.getRow(0).component('name').id).toBe(`${occupied}#2`);
    expect(next.components.get(occupied)?.id).toBe(occupied);
    next.dispose();
  });

  it('creates isolated authored reusable placements for every row and releases their lifecycles', () => {
    const { model, mounted } = setup();
    mounted.dispose();
    const initialize = vi.fn();
    const dispose = vi.fn();
    setRepeatingGroupReusableFactory((row) => {
      initialize(row.reusableInstances);
      return dispose;
    });
    const definition = {
      id: 'card',
      name: 'Card',
      caption: 'Card',
      width: 200,
      height: 100,
      rootComponentId: 'card-root',
      components: [
        node('WebPanel', 'card-root', null, {}, ['card-label']),
        node('WebLabel', 'card-label', 'card-root', {
          caption: 'Original',
          currentRowBindings: [{ property: 'caption', fieldPath: '/name' }],
        }),
      ],
    };
    const next = mountPage({
      ...model,
      components: model.components
        .map((component) =>
          component.id === 'group' ? { ...component, children: ['card-a', 'card-b'] } : component,
        )
        .concat(
          node('WebReusableElement', 'card-a', 'group', { reusableElementId: 'card' }),
          node('WebReusableElement', 'card-b', 'group', { reusableElementId: 'card' }),
        ),
      reusableElements: [definition],
    });
    const repeater = next.components.get('group') as WebRepeatingGroup;
    expect(next.reusableInstances).toEqual([]);
    repeater.rows = [{ name: 'Ana' }, { name: 'Bruno' }];
    expect(initialize).toHaveBeenCalledTimes(2);
    const rows = [repeater.getRow(0), repeater.getRow(1)];
    const labels = rows.flatMap((row) =>
      row.reusableInstances.map((instance) => {
        const id = instance.componentIds.get('card-label');
        const label = id === undefined ? undefined : row.components.get(id);
        if (!(label instanceof WebLabel)) throw new Error('Missing card label.');
        return label;
      }),
    );
    expect(labels.map((label) => label.caption)).toEqual(['Ana', 'Ana', 'Bruno', 'Bruno']);
    expect(new Set(labels.map((label) => label.id)).size).toBe(4);
    const first = labels[0];
    if (first === undefined) throw new Error('Missing first label.');
    first.caption = 'Changed only here';
    expect(labels[1]?.caption).toBe('Ana');
    expect(rows[0]?.reusableInstances.map((instance) => instance.instanceId)).not.toEqual(
      rows[1]?.reusableInstances.map((instance) => instance.instanceId),
    );
    repeater.rows = [];
    expect(dispose).toHaveBeenCalledTimes(2);
    next.dispose();
  });

  it('updates a row visual immediately when bindings change on a second wrapper', () => {
    const { mounted, repeater } = setup();
    repeater.rows = [{ name: 'Ana' }];
    const first = repeater.getRow(0).component<WebLabel>('name');
    const wrapper = new WebLabel(first.element);
    wrapper.currentRowBindings = [{ property: 'caption', fieldPath: '/missing' }];
    expect(first.caption).toBe('');
    wrapper.currentRowBindings = [{ property: 'caption', fieldPath: '/name' }];
    expect(first.caption).toBe('Ana');
    expect(first.currentRowBindings).toEqual(wrapper.currentRowBindings);
    mounted.dispose();
  });

  it('restores authored scalar values when runtime row bindings are removed or replaced', () => {
    const { repeater, mounted } = setup();
    repeater.rows = [{ name: 'Ana' }, { name: 'Bruno' }];
    const first = repeater.getRow(0).component<WebLabel>('name');
    const second = repeater.getRow(1).component<WebLabel>('name');
    const wrapper = new WebLabel(first.element);
    wrapper.currentRowBindings = [{ property: 'visible', fieldPath: '/active' }];
    expect(first.caption).toBe('Fallback');
    expect(first.visible).toBe(false);
    wrapper.currentRowBindings = [];
    expect(first.visible).toBe(true);
    expect(first.caption).toBe('Fallback');
    expect(second.caption).toBe('Bruno');
    wrapper.currentRowBindings = [{ property: 'caption', fieldPath: '/name' }];
    expect(first.caption).toBe('Ana');
    mounted.dispose();
  });

  it('finishes all subscription cleanup and makes unsubscribe idempotent when a disposer throws', () => {
    const { repeater, mounted } = setup();
    repeater.rows = [{ name: 'Ana' }, { name: 'Bruno' }];
    const click = vi.fn();
    const cleaned = vi.fn();
    const unsubscribe = repeater.subscribeRows((row) => {
      const unbind = row.component<WebButton>('button').bindEvent('OnClick', click);
      return () => {
        unbind();
        cleaned(row.index);
        if (row.index === 0) throw new Error('Cleanup failed');
      };
    });
    expect(unsubscribe).toThrow('Cleanup failed');
    expect(cleaned).toHaveBeenCalledTimes(2);
    repeater.getRow(1).component<WebButton>('button').element.click();
    expect(click).not.toHaveBeenCalled();
    expect(unsubscribe).not.toThrow();
    expect(cleaned).toHaveBeenCalledTimes(2);
    mounted.dispose();
  });

  it('releases outer component events even if a row disposer fails during disposal', () => {
    const { repeater, mounted } = setup();
    repeater.rows = [{ name: 'Ana' }];
    const click = vi.fn();
    repeater.bindEvent('OnClick', click);
    repeater.subscribeRows(() => () => {
      throw new Error('Cleanup failed');
    });
    expect(() => repeater.dispose()).toThrow('Cleanup failed');
    repeater.element.click();
    expect(click).not.toHaveBeenCalled();
    expect(() => mounted.dispose()).not.toThrow();
  });

  it('isolates nested repeater instances and disposes their subscriptions', () => {
    const { model, mounted } = setup();
    mounted.dispose();
    const nested = node('WebRepeatingGroup', 'nested', 'group', {}, ['nested-label']);
    const next = mountPage({
      ...model,
      components: model.components
        .map((component) =>
          component.id === 'group'
            ? { ...component, children: [...component.children, 'nested'] }
            : component,
        )
        .concat(
          nested,
          node('WebLabel', 'nested-label', 'nested', {
            caption: '',
            currentRowBindings: [{ property: 'caption', fieldPath: '' }],
          }),
        ),
    });
    const repeater = next.components.get('group') as WebRepeatingGroup;
    repeater.rows = ['parent A', 'parent B'];
    const first = repeater.getRow(0).component<WebRepeatingGroup<string>>('nested');
    const second = repeater.getRow(1).component<WebRepeatingGroup<string>>('nested');
    first.rows = ['A'];
    second.rows = ['B'];
    expect(first.getRow(0).component<WebLabel>('nested-label').caption).toBe('A');
    expect(second.getRow(0).component<WebLabel>('nested-label').caption).toBe('B');
    const dispose = vi.fn();
    first.subscribeRows(() => dispose);
    repeater.rows = [];
    expect(dispose).toHaveBeenCalledOnce();
    next.dispose();
  });

  it('cleans already-created rows when a renderer fails partway through replacement', () => {
    const repeater = new WebRepeatingGroup(document.createElement('div'));
    const dispose = vi.fn();
    repeater.configureRowTemplate((index, value) => {
      if (index === 1) throw new Error('Render failure');
      return {
        index,
        value,
        element: document.createElement('div'),
        components: new Map(),
        componentIds: new Map(),
        reusableInstances: [],
        component: () => {
          throw new Error('No children');
        },
        dispose,
      };
    });
    expect(() => {
      repeater.rows = [1, 2];
    }).toThrow('Render failure');
    expect(dispose).toHaveBeenCalledOnce();
    expect(() => repeater.getRow(0)).toThrow(RangeError);
    repeater.dispose();
  });

  it('releases all row listeners and components when one lifecycle disposer throws', () => {
    const { repeater, mounted } = setup();
    const clean = vi.fn();
    const subscribe = repeater.subscribeRows((row) => {
      const button = row.component<WebButton>('button');
      const unbind = button.bindEvent('OnClick', clean);
      return () => {
        unbind();
        clean();
        if (row.index === 0) throw new Error('Disposer failed');
      };
    });
    repeater.rows = [{ name: 'Ana' }, { name: 'Bruno' }];
    const previous = [
      repeater.getRow(0).component<WebButton>('button'),
      repeater.getRow(1).component<WebButton>('button'),
    ];
    expect(() => {
      repeater.rows = [];
    }).toThrow('Disposer failed');
    expect(clean).toHaveBeenCalledTimes(2);
    previous.forEach((button) => button.element.click());
    expect(clean).toHaveBeenCalledTimes(2);
    expect(() => repeater.getRow(0)).toThrow(RangeError);
    subscribe();
    mounted.dispose();
  });
});
