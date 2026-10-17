import { WebComponent } from './component.js';
import type { WebApiClient } from './api-client.js';
import type { MountedReusableElementInstance } from './render.js';
import type { RuntimeComponentLayout } from './layout.js';

export interface WebRepeatingGroupConfiguration {
  readonly schemaVersion: 1;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly rowHeightMode: 'fixed' | 'dynamic';
  readonly fixedRowHeight: number;
  readonly minRowHeight: number;
  readonly maxRowHeight: number | null;
  readonly gap: number;
  readonly emptyMessage: string;
}

export interface WebRepeatingGroupCurrentRow<T = unknown> {
  readonly index: number;
  readonly value: T;
  /** Resolves one concrete instance inside this row, including across awaits. */
  component<C extends WebComponent>(templateId: string): C;
}

export interface WebRepeatingGroupRow<T = unknown> extends WebRepeatingGroupCurrentRow<T> {
  readonly element: HTMLElement;
  /** Physical IDs are unique per row and reusable placement. */
  readonly components: ReadonlyMap<string, WebComponent>;
  readonly componentIds: ReadonlyMap<string, string>;
  readonly reusableInstances: readonly MountedReusableElementInstance[];
  dispose(): void;
}

export type WebRepeatingGroupRowRenderer = (
  index: number,
  value: unknown,
  configuration: WebRepeatingGroupConfiguration,
) => WebRepeatingGroupRow;
export type WebRepeatingGroupRowListener<T = unknown> = (
  row: WebRepeatingGroupRow<T>,
) => void | (() => void);

interface RowSubscription {
  readonly listener: WebRepeatingGroupRowListener;
  readonly disposers: Map<WebRepeatingGroupRow, () => void>;
}
interface RepeatingGroupState {
  configuration: WebRepeatingGroupConfiguration;
  values: readonly unknown[];
  mountedRows: readonly WebRepeatingGroupRow[];
  renderer: WebRepeatingGroupRowRenderer | undefined;
  templateHost: HTMLElement | undefined;
  apiClient: WebApiClient | null;
  unsubscribe: (() => void) | undefined;
  readonly subscriptions: Set<RowSubscription>;
  disposed: boolean;
}

const states = new WeakMap<HTMLElement, RepeatingGroupState>();
const rowContexts = new WeakMap<HTMLElement, WebRepeatingGroupCurrentRow>();
interface BoundVisualProperty {
  readonly fallback: string | number | boolean;
  readonly setter: (value: unknown) => void;
}
const boundVisualProperties = new WeakMap<HTMLElement, Map<string, BoundVisualProperty>>();
let reusableFactory: WebRepeatingGroupRowListener | undefined;

/** User cleanup failures must not prevent unrelated subscriptions from being released. */
function disposeCallbacks(callbacks: Iterable<() => void>): void {
  let failed = false;
  let failure: unknown;
  for (const callback of callbacks) {
    try {
      callback();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) throw failure;
}

/** Generated entry supplies authored reusable classes before requests execute. */
export function setRepeatingGroupReusableFactory(factory: WebRepeatingGroupRowListener): void {
  reusableFactory = factory;
}

/** Native events keep the row that owns the sender even after the row is removed. */
export function getRepeatingGroupCurrentRow(
  sender: HTMLElement | Event,
): WebRepeatingGroupCurrentRow | undefined {
  const target = sender instanceof HTMLElement ? sender : sender.target;
  let element =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  while (element !== null) {
    const context = rowContexts.get(element);
    if (context !== undefined) return context;
    element = element.parentElement;
  }
  return undefined;
}

/** Renderer associates native sender elements without copying row data into DOM attributes. */
export function bindRepeatingGroupRowContext(
  element: HTMLElement,
  context: WebRepeatingGroupCurrentRow,
): void {
  rowContexts.set(element, context);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
function pixels(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(10_000, Math.max(minimum, value))
    : fallback;
}
export function normalizeWebRepeatingGroupConfiguration(
  value: unknown,
): WebRepeatingGroupConfiguration {
  const source = record(value);
  const minRowHeight = pixels(source.minRowHeight, 80);
  const apiClientId =
    typeof source.apiClientId === 'string' && source.apiClientId.length > 0
      ? source.apiClientId
      : null;
  const operationId =
    typeof source.operationId === 'string' && source.operationId.length > 0
      ? source.operationId
      : null;
  return {
    schemaVersion: 1,
    apiClientId: operationId === null ? null : apiClientId,
    operationId: apiClientId === null ? null : operationId,
    listPath:
      typeof source.listPath === 'string' &&
      (source.listPath === '' || source.listPath.startsWith('/'))
        ? source.listPath
        : '',
    rowHeightMode: source.rowHeightMode === 'fixed' ? 'fixed' : 'dynamic',
    fixedRowHeight: pixels(source.fixedRowHeight, 120, 1),
    minRowHeight,
    maxRowHeight:
      typeof source.maxRowHeight === 'number' && Number.isFinite(source.maxRowHeight)
        ? Math.max(minRowHeight, pixels(source.maxRowHeight, minRowHeight, 1))
        : null,
    gap: pixels(source.gap, 8),
    emptyMessage: typeof source.emptyMessage === 'string' ? source.emptyMessage : 'No data',
  };
}

/** Shared row shell geometry for the Designer and browser runtime. */
export function projectRepeatingGroupRowStyle(
  configuration: WebRepeatingGroupConfiguration,
  layout?: RuntimeComponentLayout,
  childrenBounds: readonly { readonly y: number; readonly height: number }[] = [],
): Readonly<Record<string, string>> {
  const flow = layout?.container.mode === 'row' || layout?.container.mode === 'column';
  const extent = Math.max(
    configuration.minRowHeight,
    ...childrenBounds.map((bounds) => bounds.y + bounds.height),
  );
  const initialHeight =
    configuration.maxRowHeight === null ? extent : Math.min(configuration.maxRowHeight, extent);
  return {
    width: flow && layout?.item.width === 'fit-content' ? 'max-content' : '100%',
    'min-width': '0px',
    'box-sizing': 'border-box',
    'flex-shrink': '0',
    height:
      configuration.rowHeightMode === 'fixed'
        ? `${String(configuration.fixedRowHeight)}px`
        : flow
          ? 'auto'
          : `${String(initialHeight)}px`,
    'min-height': `${String(configuration.rowHeightMode === 'fixed' ? configuration.fixedRowHeight : configuration.minRowHeight)}px`,
    ...(configuration.rowHeightMode === 'fixed'
      ? { 'max-height': `${String(configuration.fixedRowHeight)}px` }
      : configuration.maxRowHeight === null
        ? {}
        : { 'max-height': `${String(configuration.maxRowHeight)}px` }),
    overflow:
      configuration.rowHeightMode === 'fixed' || configuration.maxRowHeight !== null
        ? 'auto'
        : 'visible',
  };
}

/** Reads only own JSON fields; never follows object prototypes. */
export function readCurrentRowField(value: unknown, pointer: string): unknown {
  if (pointer === '') return value;
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) return undefined;
  let current = value;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key))
      return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}

/** A native typed setter remains responsible for its visual projection. */
export function applyCurrentRowBindings(
  component: WebComponent,
  bindings: unknown,
  value: unknown,
): void {
  if (!Array.isArray(bindings)) return;
  const tracked =
    boundVisualProperties.get(component.element) ?? new Map<string, BoundVisualProperty>();
  const active = new Set(
    bindings.flatMap((binding) => {
      const source = record(binding);
      return typeof source.property === 'string' && typeof source.fieldPath === 'string'
        ? [source.property]
        : [];
    }),
  );
  for (const [property, binding] of tracked) {
    if (active.has(property)) continue;
    Reflect.apply(binding.setter, component, [binding.fallback]);
    tracked.delete(property);
  }
  for (const binding of bindings) {
    const source = record(binding);
    const property = source.property;
    if (
      typeof property !== 'string' ||
      typeof source.fieldPath !== 'string' ||
      ['__proto__', 'prototype', 'constructor', 'element', 'id', 'name'].includes(property)
    )
      continue;
    let prototype: object | null = Object.getPrototypeOf(component) as object | null;
    let setter: ((value: unknown) => void) | undefined;
    while (prototype !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor !== undefined) {
        setter = descriptor.set as ((value: unknown) => void) | undefined;
        break;
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    if (setter === undefined) continue;
    const current = Reflect.get(component, property) as unknown;
    const field = readCurrentRowField(value, source.fieldPath);
    let resolved: unknown;
    if (typeof current === 'string')
      resolved =
        typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean'
          ? String(field)
          : '';
    else if (typeof current === 'number')
      resolved = typeof field === 'number' && Number.isFinite(field) ? field : 0;
    else if (typeof current === 'boolean') resolved = typeof field === 'boolean' ? field : false;
    else continue;
    if (!tracked.has(property))
      tracked.set(property, { setter, fallback: current as string | number | boolean });
    try {
      Reflect.apply(setter, component, [resolved]);
    } catch (error) {
      // A constrained visual setter (for example icon or select index) may
      // reject otherwise scalar API data. Keep its authored fallback value.
      if (!(error instanceof TypeError) && !(error instanceof RangeError)) throw error;
    }
  }
  if (tracked.size === 0) boundVisualProperties.delete(component.element);
  else boundVisualProperties.set(component.element, tracked);
}

/** One responsive template mounted independently for every response-list item. */
export class WebRepeatingGroup<T = unknown> extends WebComponent<HTMLDivElement> {
  readonly #state: RepeatingGroupState;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement))
      throw new TypeError('WebRepeatingGroup requires a div element.');
    super(element);
    let state = states.get(element);
    if (state === undefined) {
      state = {
        configuration: normalizeWebRepeatingGroupConfiguration(undefined),
        values: [],
        mountedRows: [],
        renderer: undefined,
        templateHost: undefined,
        apiClient: null,
        unsubscribe: undefined,
        subscriptions: new Set(),
        disposed: false,
      };
      states.set(element, state);
    }
    this.#state = state;
  }

  public get repeatingGroupConfig(): WebRepeatingGroupConfiguration {
    return this.#state.configuration;
  }
  public set repeatingGroupConfig(value: WebRepeatingGroupConfiguration) {
    this.#state.configuration = normalizeWebRepeatingGroupConfiguration(value);
    this.#refreshApiRows(true);
  }
  public get rows(): readonly T[] {
    return this.#state.values as readonly T[];
  }
  public set rows(values: readonly T[]) {
    this.#replaceRows([...values]);
  }
  public get rowCount(): number {
    return this.#state.values.length;
  }
  public getRow(index: number): WebRepeatingGroupRow<T> {
    const row = this.#state.mountedRows[index];
    if (row === undefined)
      throw new RangeError(`Repeating Group "${this.name}" has no row at index ${String(index)}.`);
    return row as WebRepeatingGroupRow<T>;
  }

  /** The Designer uses one editable host without serializing sampled row data. */
  public getTemplateHost(): HTMLElement {
    if (this.#state.templateHost === undefined) {
      const row = this.element.ownerDocument.createElement('div');
      row.dataset.webradRepeatingRow = 'template';
      row.dataset.webradChildHost = '';
      row.className = 'wr-repeating-group-row';
      row.style.minHeight = `${String(this.#state.configuration.minRowHeight)}px`;
      this.#state.templateHost = row;
      this.element.replaceChildren(row);
    }
    return this.#state.templateHost;
  }

  /** Runtime renderer owns creation; authored code only supplies values. */
  public configureRowTemplate(renderer: WebRepeatingGroupRowRenderer): void {
    this.#state.renderer = renderer;
    this.#state.templateHost = undefined;
    this.#render();
  }

  /** Observes completed API results; it never executes an operation itself. */
  public bindApiClient(apiClient: WebApiClient | null): void {
    const wasBound = this.#state.apiClient !== null;
    this.#state.unsubscribe?.();
    this.#state.apiClient = apiClient;
    this.#state.unsubscribe = apiClient?.subscribe(() => this.#refreshApiRows()) ?? undefined;
    if (apiClient === null && wasBound) this.#replaceRows([]);
    else this.#refreshApiRows();
  }

  public subscribeRows(listener: WebRepeatingGroupRowListener<T>): () => void {
    const subscription: RowSubscription = {
      listener: listener as WebRepeatingGroupRowListener,
      disposers: new Map(),
    };
    this.#state.subscriptions.add(subscription);
    const unsubscribe = (): void => {
      this.#state.subscriptions.delete(subscription);
      const disposers = [...subscription.disposers.values()];
      subscription.disposers.clear();
      disposeCallbacks(disposers);
    };
    try {
      for (const row of this.#state.mountedRows) this.#notify(subscription, row);
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return unsubscribe;
  }

  #notify(subscription: RowSubscription, row: WebRepeatingGroupRow): void {
    const dispose = subscription.listener(row);
    if (dispose !== undefined) subscription.disposers.set(row, dispose);
  }
  #refreshApiRows(force = false): void {
    const { apiClient, configuration } = this.#state;
    if (apiClient === null) {
      if (force) this.#render();
      return;
    }
    const operation = apiClient.operations.find(
      (candidate) => candidate.id === configuration.operationId,
    );
    this.#replaceRows(
      operation === undefined
        ? []
        : apiClient.getList<unknown>(operation.name, configuration.listPath),
      force,
    );
  }
  #replaceRows(values: readonly unknown[], force = false): void {
    if (
      !force &&
      values.length === this.#state.values.length &&
      values.every((value, index) => value === this.#state.values[index])
    )
      return;
    this.#state.values = Object.freeze([...values]);
    this.#render();
  }
  #clearRows(): void {
    const rows = this.#state.mountedRows;
    this.#state.mountedRows = [];
    const disposers: Array<() => void> = [];
    for (const row of rows) {
      for (const subscription of this.#state.subscriptions) {
        const dispose = subscription.disposers.get(row);
        subscription.disposers.delete(row);
        if (dispose !== undefined) disposers.push(dispose);
      }
      disposers.push(() => row.dispose());
    }
    disposeCallbacks(disposers);
  }
  #render(): void {
    if (this.#state.disposed) return;
    this.#clearRows();
    const { configuration, renderer } = this.#state;
    if (renderer === undefined) return;
    const rows: WebRepeatingGroupRow[] = [];
    const fragments = this.element.ownerDocument.createDocumentFragment();
    const content = this.element.ownerDocument.createElement('div');
    content.className = 'wr-repeating-group-content';
    content.setAttribute('role', 'list');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = `${String(configuration.gap)}px`;
    content.style.width = '100%';
    content.style.minWidth = '0';
    try {
      for (const [index, value] of this.#state.values.entries()) {
        const row = renderer(index, value, configuration);
        rows.push(row);
        const disposeReusable = reusableFactory?.(row);
        if (disposeReusable !== undefined)
          rows[rows.length - 1] = {
            ...row,
            dispose: () => {
              try {
                disposeReusable();
              } finally {
                row.dispose();
              }
            },
          };
        content.append(row.element);
      }
    } catch (error) {
      try {
        disposeCallbacks(rows.map((row) => () => row.dispose()));
      } finally {
        this.element.replaceChildren();
      }
      throw error;
    }
    if (rows.length === 0) {
      const empty = this.element.ownerDocument.createElement('div');
      empty.className = 'wr-repeating-group-empty';
      empty.textContent = configuration.emptyMessage;
      content.append(empty);
    }
    fragments.append(content);
    this.element.replaceChildren(fragments);
    this.#state.mountedRows = rows;
    try {
      for (const row of rows)
        for (const subscription of this.#state.subscriptions) this.#notify(subscription, row);
    } catch (error) {
      this.#clearRows();
      this.element.replaceChildren();
      throw error;
    }
  }

  public override dispose(): void {
    try {
      if (!this.#state.disposed) {
        this.#state.disposed = true;
        const unsubscribe = this.#state.unsubscribe;
        this.#state.unsubscribe = undefined;
        try {
          disposeCallbacks([() => unsubscribe?.(), () => this.#clearRows()]);
        } finally {
          this.#state.subscriptions.clear();
        }
      }
    } finally {
      super.dispose();
    }
  }
}
