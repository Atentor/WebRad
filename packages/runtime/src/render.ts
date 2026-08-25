import type { WebComponent } from './component.js';
import {
  WebButton,
  WebCheckBox,
  WebComboBox,
  WebEdit,
  WebImage,
  WebLabel,
  WebListBox,
  WebPanel,
  WebTextArea,
  type WebImageObjectFit,
  type WebInputType,
  type WebSelectItem,
} from './controls.js';
import { WebPage } from './page.js';
import { createWebRadIconElement, isWebRadIconName } from './icons.js';
import {
  applyRuntimeLayout,
  resolveRuntimeContainerLayout,
  type RuntimeComponentLayout,
  type RuntimeContainerLayout,
} from './layout.js';
import {
  projectComponentVisual,
  readBooleanProperty,
  readIntegerProperty,
  readStringProperty,
  tokenizeTailwindClasses,
} from './visual.js';

export interface RuntimeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RuntimeComponentNode {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly parentId: string | null;
  /** Instance-owned responsive layout. */
  readonly layout: RuntimeComponentLayout;
  readonly bounds: RuntimeBounds;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly string[];
  /** Resolved at compile time so generated apps do not ship a Tailwind runtime. */
  readonly styleClassName?: string;
}

export interface RuntimePageModel {
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly components: readonly RuntimeComponentNode[];
  readonly rootComponentId: string;
}

export interface RuntimeComponentAdapter<T extends WebComponent = WebComponent> {
  readonly createElement: (document: Document, node: RuntimeComponentNode) => HTMLElement;
  readonly createComponent: (element: HTMLElement) => T;
  readonly applyProperties?: (component: T, node: RuntimeComponentNode) => void;
}

function inputElement(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) throw new TypeError('Expected an input element.');
  return element;
}

function buttonElement(element: HTMLElement): HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement)) throw new TypeError('Expected a button element.');
  return element;
}

function textAreaElement(element: HTMLElement): HTMLTextAreaElement {
  if (!(element instanceof HTMLTextAreaElement))
    throw new TypeError('Expected a textarea element.');
  return element;
}

function selectElement(element: HTMLElement): HTMLSelectElement {
  if (!(element instanceof HTMLSelectElement)) throw new TypeError('Expected a select element.');
  return element;
}

function imageElement(element: HTMLElement): HTMLImageElement {
  if (!(element instanceof HTMLImageElement)) throw new TypeError('Expected an image element.');
  return element;
}

function selectItems(node: RuntimeComponentNode): readonly (string | WebSelectItem)[] {
  const items = node.props.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): readonly (string | WebSelectItem)[] => {
    if (typeof item === 'string') return [item];
    if (typeof item !== 'object' || item === null) return [];
    const value = Reflect.get(item, 'value');
    const label = Reflect.get(item, 'label');
    const disabled = Reflect.get(item, 'disabled');
    if (typeof value !== 'string' || typeof label !== 'string') return [];
    return [{ value, label, disabled: typeof disabled === 'boolean' ? disabled : undefined }];
  });
}

export class RuntimeComponentRegistry {
  readonly #adapters = new Map<string, RuntimeComponentAdapter>();

  public register<T extends WebComponent>(type: string, adapter: RuntimeComponentAdapter<T>): this {
    if (this.#adapters.has(type))
      throw new Error(`Runtime component "${type}" is already registered.`);
    const applyProperties = adapter.applyProperties;
    this.#adapters.set(type, {
      createElement: adapter.createElement,
      createComponent: adapter.createComponent,
      applyProperties:
        applyProperties === undefined
          ? undefined
          : (component, node) => {
              applyProperties(component as T, node);
            },
    });
    return this;
  }

  public has(type: string): boolean {
    return this.#adapters.has(type);
  }

  public require(type: string): RuntimeComponentAdapter {
    const adapter = this.#adapters.get(type);
    if (adapter === undefined) throw new Error(`No runtime adapter is registered for "${type}".`);
    return adapter;
  }

  public create(document: Document, node: RuntimeComponentNode): WebComponent {
    const adapter = this.require(node.type);
    const element = adapter.createElement(document, node);
    const component = adapter.createComponent(element);
    adapter.applyProperties?.(component, node);
    return component;
  }
}

function applyCommon(component: WebComponent, node: RuntimeComponentNode): void {
  const { element } = component;
  const visual = projectComponentVisual(node);
  element.dataset.webradId = node.id;
  element.dataset.webradName = node.name;
  element.dataset.webradType = node.type;
  element.classList.add(
    ...visual.classNames,
    ...tokenizeTailwindClasses(node.styleClassName ?? ''),
  );
  component.width = node.bounds.width;
  component.height = node.bounds.height;
  // A selected Tailwind style owns paint properties. The structural layout is
  // applied after the hierarchy exists, when each child can read its parent's
  // persisted container mode.
  if (node.styleClassName === undefined) {
    component.backgroundColor = visual.style.backgroundColor ?? '';
    component.color = visual.style.color ?? '';
    component.borderColor = visual.style.borderColor ?? '';
    element.style.borderStyle = visual.style.borderStyle ?? '';
    element.style.borderWidth = visual.style.borderWidth ?? '';
  }
  if (node.parentId !== null) {
    // Preserve the historic registry.create() behavior for callers that create
    // a standalone node. mountPage() replaces this legacy fallback with the
    // responsive projection below.
    element.style.position = 'absolute';
    component.x = node.bounds.x;
    component.y = node.bounds.y;
  }
  component.visible = visual.visible;
  component.enabled = visual.enabled;
  if (visual.tabIndex !== undefined) component.tabIndex = visual.tabIndex;
  if (visual.title !== undefined) element.title = visual.title;
}

function elementFactory(tagName: string): RuntimeComponentAdapter['createElement'] {
  return (document) => document.createElement(tagName);
}

export const runtimeComponentRegistry = new RuntimeComponentRegistry();

runtimeComponentRegistry
  .register<WebPage>('WebPage', {
    createElement: elementFactory('section'),
    createComponent: (element) => new WebPage(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.element.setAttribute('role', 'application');
      component.caption = readStringProperty(node, 'caption', node.name);
    },
  })
  .register<WebPanel>('WebPanel', {
    createElement: elementFactory('div'),
    createComponent: (element) => new WebPanel(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.caption = readStringProperty(node, 'caption');
    },
  })
  .register<WebLabel>('WebLabel', {
    createElement: (document) => {
      const element = document.createElement('span');
      const textContent = document.createElement('span');
      textContent.dataset.webradTextContent = '';
      element.append(textContent);
      return element;
    },
    createComponent: (element) => new WebLabel(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.caption = readStringProperty(
        node,
        'caption',
        readStringProperty(node, 'text', node.name),
      );
      component.autoSize = readBooleanProperty(node, 'autoSize');
    },
  })
  .register<WebEdit>('WebEdit', {
    createElement: (document) => {
      const element = document.createElement('input');
      element.type = 'text';
      return element;
    },
    createComponent: (element) => new WebEdit(inputElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.value = readStringProperty(node, 'value');
      component.placeholder = readStringProperty(node, 'placeholder');
      component.readOnly = readBooleanProperty(node, 'readOnly');
      component.inputType = readStringProperty(node, 'inputType', 'text') as WebInputType;
    },
  })
  .register<WebTextArea>('WebTextArea', {
    createElement: elementFactory('textarea'),
    createComponent: (element) => new WebTextArea(textAreaElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.value = readStringProperty(node, 'value');
      component.placeholder = readStringProperty(node, 'placeholder');
      component.readOnly = readBooleanProperty(node, 'readOnly');
      const rows = readIntegerProperty(node, 'rows');
      if (rows !== undefined && rows > 0) {
        component.rows = rows;
      }
    },
  })
  .register<WebButton>('WebButton', {
    createElement: (document, node) => {
      const element = document.createElement('button');
      element.type = 'button';
      const requestedIcon = readStringProperty(node, 'icon', 'add');
      const icon = createWebRadIconElement(
        document,
        isWebRadIconName(requestedIcon) ? requestedIcon : 'add',
      );
      icon.classList.add('wr-button-icon');
      icon.dataset.webradButtonIcon = '';
      const textContent = document.createElement('span');
      textContent.dataset.webradTextContent = '';
      textContent.classList.add('wr-button-text');
      element.append(icon, textContent);
      return element;
    },
    createComponent: (element) => new WebButton(buttonElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      const requestedIcon = readStringProperty(node, 'icon', 'add');
      component.icon = isWebRadIconName(requestedIcon) ? requestedIcon : 'add';
      component.caption = readStringProperty(node, 'caption', node.name);
    },
  })
  .register<WebCheckBox>('WebCheckBox', {
    createElement: (document) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      const caption = document.createElement('span');
      caption.dataset.webradCheckboxCaption = '';
      caption.dataset.webradTextContent = '';
      label.append(input, caption);
      return label;
    },
    createComponent: (element) => new WebCheckBox(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.caption = readStringProperty(node, 'caption', node.name);
      component.checked = readBooleanProperty(node, 'checked');
    },
  })
  .register<WebComboBox>('WebComboBox', {
    createElement: elementFactory('select'),
    createComponent: (element) => new WebComboBox(selectElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.items = selectItems(node);
      const selectedIndex = readIntegerProperty(node, 'selectedIndex');
      if (selectedIndex !== undefined) {
        component.selectedIndex = selectedIndex;
      } else {
        component.value = readStringProperty(node, 'value');
      }
    },
  })
  .register<WebImage>('WebImage', {
    createElement: elementFactory('img'),
    createComponent: (element) => new WebImage(imageElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.src = readStringProperty(node, 'src');
      component.alt = readStringProperty(node, 'alt', node.name);
      if (node.styleClassName === undefined) {
        const objectFit = readStringProperty(node, 'objectFit');
        if (objectFit.length > 0) component.objectFit = objectFit as WebImageObjectFit;
      }
    },
  })
  .register<WebListBox>('WebListBox', {
    createElement: (document) => {
      const element = document.createElement('select');
      element.size = 4;
      return element;
    },
    createComponent: (element) => new WebListBox(selectElement(element)),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.items = selectItems(node);
      component.multiple = readBooleanProperty(node, 'multiple');
      const selectedIndex = readIntegerProperty(node, 'selectedIndex');
      if (selectedIndex !== undefined) {
        component.selectedIndex = selectedIndex;
      } else {
        component.value = readStringProperty(node, 'value');
      }
    },
  });

export interface MountedRuntimePage {
  readonly element: HTMLElement;
  readonly page: WebPage;
  readonly components: ReadonlyMap<string, WebComponent>;
}

export interface MountPageOptions {
  readonly replaceHostContents?: boolean;
  readonly registry?: RuntimeComponentRegistry;
}

export function mountPage(
  model: RuntimePageModel,
  host: HTMLElement = document.body,
  options: MountPageOptions = {},
): MountedRuntimePage {
  const registry = options.registry ?? runtimeComponentRegistry;
  const nodes = new Map(model.components.map((node) => [node.id, node]));
  const components = new Map<string, WebComponent>();

  const createBranch = (nodeId: string): HTMLElement => {
    const node = nodes.get(nodeId);
    if (node === undefined)
      throw new Error(`Runtime page references unknown component "${nodeId}".`);
    const component = registry.create(host.ownerDocument, node);
    components.set(node.id, component);
    for (const childId of node.children) component.element.append(createBranch(childId));
    return component.element;
  };

  const rootElement = createBranch(model.rootComponentId);
  const rootComponent = components.get(model.rootComponentId);
  if (!(rootComponent instanceof WebPage))
    throw new Error('The runtime root component must be WebPage.');
  rootComponent.width = model.width;
  rootComponent.height = model.height;
  rootComponent.caption = model.caption;

  const applyBranchLayout = (
    nodeId: string,
    parentContainer: RuntimeContainerLayout | undefined,
    isPageRoot = false,
  ): void => {
    const node = nodes.get(nodeId);
    const component = components.get(nodeId);
    if (node === undefined || component === undefined) {
      throw new Error(`Runtime page layout references unknown component "${nodeId}".`);
    }
    applyRuntimeLayout(component.element, node, parentContainer, { isPageRoot });
    const container = resolveRuntimeContainerLayout(node.layout);
    for (const childId of node.children) applyBranchLayout(childId, container);
  };
  applyBranchLayout(model.rootComponentId, undefined, true);
  rootElement.dataset.webradLayout = resolveRuntimeContainerLayout(
    nodes.get(model.rootComponentId)?.layout,
  ).mode;

  rootElement.dataset.webradPageId = model.id;
  if (options.replaceHostContents ?? true) host.replaceChildren(rootElement);
  else host.append(rootElement);
  return { element: rootElement, page: rootComponent, components };
}
