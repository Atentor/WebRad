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
  WebReusableElement,
  WebTextArea,
  type WebImageObjectFit,
  type WebInputType,
  type WebSelectItem,
} from './controls.js';
import { WebPage } from './page.js';
import { WebDataGrid, normalizeWebDataGridConfiguration } from './data-grid.js';
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
  /** Stable source-node identity when this node was expanded from a reusable definition. */
  readonly templateId?: string;
  /** True only for the definition root mounted inside a reusable instance. */
  readonly reusableRoot?: boolean;
  /** Stable reusable-definition ID that owns this expanded definition node. */
  readonly reusableDefinitionId?: string;
  /** Physical wrapper ID that owns this expanded definition node. */
  readonly reusableInstanceId?: string;
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

/** Browser-safe reusable definition supplied by the compiler alongside a page. */
export interface RuntimeReusableElementModel {
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly components: readonly RuntimeComponentNode[];
  readonly rootComponentId: string;
}

export interface RuntimePageModel {
  readonly id: string;
  readonly name: string;
  readonly caption: string;
  readonly width: number;
  readonly height: number;
  readonly components: readonly RuntimeComponentNode[];
  readonly rootComponentId: string;
  /** Definitions are expanded into each placement at mount time. */
  readonly reusableElements?: readonly RuntimeReusableElementModel[];
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
  if (node.templateId !== undefined) element.dataset.webradTemplateId = node.templateId;
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
  component.collapseWhenHidden = visual.collapseWhenHidden;
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
  .register<WebReusableElement>('WebReusableElement', {
    createElement: elementFactory('div'),
    createComponent: (element) => new WebReusableElement(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.caption = readStringProperty(node, 'caption');
      component.reusableElementId = readStringProperty(node, 'reusableElementId');
      component.placement =
        readStringProperty(node, 'placement') === 'floating' ? 'floating' : 'in-flow';
      const horizontalAnchor = readStringProperty(node, 'floatingHorizontalAnchor');
      component.floatingHorizontalAnchor =
        horizontalAnchor === 'center' || horizontalAnchor === 'right' ? horizontalAnchor : 'left';
      const verticalAnchor = readStringProperty(node, 'floatingVerticalAnchor');
      component.floatingVerticalAnchor =
        verticalAnchor === 'center' || verticalAnchor === 'bottom' ? verticalAnchor : 'top';
      const zIndex = node.props.floatingZIndex;
      component.floatingZIndex =
        typeof zIndex === 'number' && Number.isFinite(zIndex) ? zIndex : 100;
      component.element.dataset.webradReusableInstance = 'true';
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
  })
  .register<WebDataGrid>('WebDataGrid', {
    createElement: elementFactory('div'),
    createComponent: (element) => new WebDataGrid(element),
    applyProperties: (component, node) => {
      applyCommon(component, node);
      component.dataGridConfig = normalizeWebDataGridConfiguration(node.props.dataGridConfig);
    },
  });

export interface MountedRuntimePage {
  readonly element: HTMLElement;
  readonly page: WebPage;
  readonly components: ReadonlyMap<string, WebComponent>;
  /** Every physical reusable placement mounted for this page, including nested definitions. */
  readonly reusableInstances: readonly MountedReusableElementInstance[];
}

/** DOM and identity inputs used to construct one authored reusable class. */
export interface MountedReusableElementInstance {
  /** Physical ID of the `WebReusableElement` wrapper for this placement. */
  readonly instanceId: string;
  /** Stable Project Model ID of the reusable definition. */
  readonly reusableElementId: string;
  /** The expanded definition root that forms this class instance's scope. */
  readonly element: HTMLElement;
  /** Maps stable definition component IDs to this placement's physical IDs. */
  readonly componentIds: ReadonlyMap<string, string>;
}

export interface MountPageOptions {
  readonly replaceHostContents?: boolean;
  readonly registry?: RuntimeComponentRegistry;
}

function scopedReusableComponentId(
  scope: string,
  templateId: string,
  occupiedIds: Set<string>,
): string {
  const base = `${scope}:${templateId}`;
  let candidate = base;
  let disambiguator = 2;
  while (occupiedIds.has(candidate)) {
    candidate = `${base}#${String(disambiguator)}`;
    disambiguator += 1;
  }
  occupiedIds.add(candidate);
  return candidate;
}

function isFloatingReusableElement(node: RuntimeComponentNode): boolean {
  return node.type === 'WebReusableElement' && node.props.placement === 'floating';
}

function isReusableElement(node: RuntimeComponentNode): boolean {
  return node.type === 'WebReusableElement';
}

/**
 * Materializes browser-only instance trees without changing the Project Model.
 * Every definition node receives an instance-scoped physical ID, so two
 * placements of the same reusable element never share DOM or runtime state.
 */
export function expandReusableElements(model: RuntimePageModel): RuntimePageModel {
  const reusableElements = model.reusableElements ?? [];
  if (reusableElements.length === 0 && !model.components.some(isReusableElement)) return model;
  const reusableById = new Map(reusableElements.map((element) => [element.id, element]));
  const expanded = new Map<string, RuntimeComponentNode>();
  // Component IDs are opaque strings, so an instance-scoped ID can still be
  // equal to a persisted page ID (or another scoped ID). Reserve all original
  // page IDs first and allocate a deterministic suffix when that happens.
  const occupiedIds = new Set(model.components.map((node) => node.id));

  const resolveReusableInstance = (
    instance: RuntimeComponentNode,
    stack: readonly string[],
  ): string => {
    const reusableElementId = instance.props.reusableElementId;
    if (typeof reusableElementId !== 'string' || reusableElementId.length === 0) {
      throw new Error(`Reusable instance "${instance.id}" does not declare a reusableElementId.`);
    }
    const reusableElement = reusableById.get(reusableElementId);
    if (reusableElement === undefined) {
      throw new Error(
        `Reusable instance "${instance.id}" references unknown reusable component "${reusableElementId}".`,
      );
    }
    if (stack.includes(reusableElementId)) {
      throw new Error(`Reusable component "${reusableElementId}" is recursively referenced.`);
    }
    const nodes = new Map(reusableElement.components.map((node) => [node.id, node]));
    const root = nodes.get(reusableElement.rootComponentId);
    if (root === undefined) {
      throw new Error(`Reusable component "${reusableElement.name}" has no root component.`);
    }

    const cloneDefinitionNode = (
      sourceId: string,
      parentId: string,
      scope: string,
      isRoot = false,
    ): string => {
      const source = nodes.get(sourceId);
      if (source === undefined) {
        throw new Error(
          `Reusable component "${reusableElement.name}" references unknown component "${sourceId}".`,
        );
      }
      const id = scopedReusableComponentId(scope, source.id, occupiedIds);
      const node: RuntimeComponentNode = {
        ...source,
        id,
        templateId: source.id,
        parentId,
        bounds: isRoot
          ? { x: 0, y: 0, width: instance.bounds.width, height: instance.bounds.height }
          : source.bounds,
        children: [],
        reusableDefinitionId: reusableElement.id,
        reusableInstanceId: instance.id,
        ...(isRoot ? { reusableRoot: true } : {}),
      };
      expanded.set(id, node);
      const children = source.children.map((childId) => cloneDefinitionNode(childId, id, scope));
      if (source.type === 'WebReusableElement') {
        children.push(resolveReusableInstance(node, [...stack, reusableElementId]));
      }
      expanded.set(id, { ...node, children });
      return id;
    };

    return cloneDefinitionNode(root.id, instance.id, instance.id, true);
  };

  const pageNodes = new Map(model.components.map((node) => [node.id, node]));
  const clonePageNode = (sourceId: string): string => {
    const source = pageNodes.get(sourceId);
    if (source === undefined) {
      throw new Error(`Runtime page references unknown component "${sourceId}".`);
    }
    const node: RuntimeComponentNode = { ...source, children: [] };
    expanded.set(node.id, node);
    const children = source.children.map(clonePageNode);
    if (source.type === 'WebReusableElement') children.push(resolveReusableInstance(node, []));
    expanded.set(node.id, { ...node, children });
    return node.id;
  };

  clonePageNode(model.rootComponentId);
  return { ...model, components: [...expanded.values()], reusableElements: [] };
}

export function mountPage(
  model: RuntimePageModel,
  host: HTMLElement = document.body,
  options: MountPageOptions = {},
): MountedRuntimePage {
  const expandedModel = expandReusableElements(model);
  const registry = options.registry ?? runtimeComponentRegistry;
  const nodes = new Map(expandedModel.components.map((node) => [node.id, node]));
  const components = new Map<string, WebComponent>();
  // Floating reusable instances must not live below styled page containers:
  // CSS transforms on those ancestors would otherwise turn `fixed` into a
  // local containing block. This sibling layer preserves the model parentage
  // for layout while placing the browser overlay outside that visual tree.
  const floatingLayer = host.ownerDocument.createElement('div');
  floatingLayer.className = 'wr-floating-layer';
  floatingLayer.dataset.webradFloatingOwner = expandedModel.id;

  const createBranch = (nodeId: string): HTMLElement => {
    const node = nodes.get(nodeId);
    if (node === undefined)
      throw new Error(`Runtime page references unknown component "${nodeId}".`);
    const component = registry.create(host.ownerDocument, node);
    if (node.reusableRoot === true) {
      // A floating reusable lives in a sibling overlay layer rather than below
      // the page root, so the host page cannot reliably be discovered by
      // walking DOM ancestors. Keep the page name on every instance root.
      component.element.dataset.webradPageName = expandedModel.name;
    }
    components.set(node.id, component);
    for (const childId of node.children) {
      const child = nodes.get(childId);
      const childElement = createBranch(childId);
      if (child !== undefined && isFloatingReusableElement(child)) {
        floatingLayer.append(childElement);
      } else {
        component.element.append(childElement);
      }
    }
    return component.element;
  };

  const rootElement = createBranch(expandedModel.rootComponentId);
  const rootComponent = components.get(expandedModel.rootComponentId);
  if (!(rootComponent instanceof WebPage))
    throw new Error('The runtime root component must be WebPage.');
  rootComponent.width = expandedModel.width;
  rootComponent.height = expandedModel.height;
  rootComponent.caption = expandedModel.caption;

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
    applyRuntimeLayout(component.element, node, parentContainer, {
      isPageRoot,
      isReusableRoot: node.reusableRoot,
    });
    const container = resolveRuntimeContainerLayout(node.layout);
    for (const childId of node.children) applyBranchLayout(childId, container);
  };
  applyBranchLayout(expandedModel.rootComponentId, undefined, true);
  rootElement.dataset.webradLayout = resolveRuntimeContainerLayout(
    nodes.get(expandedModel.rootComponentId)?.layout,
  ).mode;

  rootElement.dataset.webradPageId = expandedModel.id;
  const hostChildren =
    floatingLayer.childElementCount > 0 ? [rootElement, floatingLayer] : [rootElement];
  if (options.replaceHostContents ?? true) host.replaceChildren(...hostChildren);
  else host.append(...hostChildren);
  const componentIdsByReusableInstance = new Map<string, Map<string, string>>();
  for (const node of expandedModel.components) {
    if (node.reusableInstanceId === undefined || node.templateId === undefined) continue;
    let componentIds = componentIdsByReusableInstance.get(node.reusableInstanceId);
    if (componentIds === undefined) {
      componentIds = new Map();
      componentIdsByReusableInstance.set(node.reusableInstanceId, componentIds);
    }
    componentIds.set(node.templateId, node.id);
  }
  const reusableInstances = expandedModel.components.flatMap((node) => {
    if (
      node.reusableRoot !== true ||
      node.reusableDefinitionId === undefined ||
      node.reusableInstanceId === undefined
    ) {
      return [];
    }
    const root = components.get(node.id);
    if (root === undefined) return [];
    return [
      {
        instanceId: node.reusableInstanceId,
        reusableElementId: node.reusableDefinitionId,
        element: root.element,
        componentIds: componentIdsByReusableInstance.get(node.reusableInstanceId) ?? new Map(),
      },
    ];
  });
  return { element: rootElement, page: rootComponent, components, reusableInstances };
}
