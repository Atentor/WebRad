import {
  getTypeScriptIdentifierError,
  validateComponentName,
  type Bounds,
  type ContainerLayout,
  type ComponentNode,
  type LayoutItem,
  type PageModel,
} from '@webrad/project-model';

import type { Command } from './command-history.js';
import {
  assertValidBounds,
  moveBoundsTogether,
  resizeBounds,
  type MovementOptions,
  type Point,
  type ResizeHandle,
  type ResizeOptions,
} from './geometry.js';
import {
  collectSubtreeIds,
  DesignerModelError,
  findDesignerComponent,
  getParentContentBounds,
  normalizeTopLevelIds,
  replaceComponentBounds,
  replaceComponentNodes,
} from './model-utils.js';

export interface AddComponentOptions {
  readonly parentId?: string;
  readonly siblingIndex?: number;
  readonly componentIndex?: number;
}

function insertionIndex(requested: number | undefined, length: number, name: string): number {
  if (requested === undefined) {
    return length;
  }
  if (!Number.isInteger(requested) || requested < 0 || requested > length) {
    throw new RangeError(`${name} must be an integer between 0 and ${length}.`);
  }
  return requested;
}

export class AddComponentCommand implements Command<PageModel> {
  public readonly label = 'Add component';
  readonly #sourceNode: ComponentNode;
  readonly #options: AddComponentOptions;
  #addedNode: ComponentNode | null = null;
  #componentIndex = -1;
  #siblingIndex = -1;

  public constructor(node: ComponentNode, options: AddComponentOptions = {}) {
    if (node.children.length > 0) {
      throw new DesignerModelError(
        'AddComponentCommand accepts one childless node. Use clipboard paste for subtrees.',
      );
    }
    this.#sourceNode = {
      ...node,
      bounds: { ...node.bounds },
      props: { ...node.props },
      events: { ...node.events },
      children: [],
    };
    this.#options = { ...options };
  }

  public execute(page: PageModel): PageModel {
    if (page.components.some(({ id }) => id === this.#sourceNode.id)) {
      throw new DesignerModelError(`Component ID "${this.#sourceNode.id}" already exists.`);
    }

    const parentId =
      this.#addedNode?.parentId ??
      this.#options.parentId ??
      this.#sourceNode.parentId ??
      page.rootComponentId;
    if (parentId === this.#sourceNode.id) {
      throw new DesignerModelError('A component cannot be its own parent.');
    }
    const parent = findDesignerComponent(page, parentId);
    const node = this.#addedNode ?? { ...this.#sourceNode, parentId };
    if (this.#addedNode === null) {
      this.#componentIndex = insertionIndex(
        this.#options.componentIndex,
        page.components.length,
        'componentIndex',
      );
      this.#siblingIndex = insertionIndex(
        this.#options.siblingIndex,
        parent.children.length,
        'siblingIndex',
      );
      this.#addedNode = node;
    }

    const components = [...page.components];
    components.splice(this.#componentIndex, 0, node);
    const currentParent = findDesignerComponent({ ...page, components }, parentId);
    const children = [...currentParent.children];
    children.splice(this.#siblingIndex, 0, node.id);
    const replacements = new Map([[parentId, { ...currentParent, children }]]);
    return replaceComponentNodes({ ...page, components }, replacements);
  }

  public undo(page: PageModel): PageModel {
    const node = this.#addedNode;
    if (node === null) {
      throw new Error('Cannot undo an AddComponentCommand before it has executed.');
    }
    findDesignerComponent(page, node.id);
    const parent = findDesignerComponent(page, node.parentId as string);
    return {
      ...page,
      components: page.components
        .filter(({ id }) => id !== node.id)
        .map((component) =>
          component.id === parent.id
            ? {
                ...component,
                children: component.children.filter((childId) => childId !== node.id),
              }
            : component,
        ),
    };
  }
}

interface RemovedNodeRecord {
  readonly node: ComponentNode;
  readonly componentIndex: number;
}

interface RemovedRootRecord {
  readonly id: string;
  readonly parentId: string;
  readonly siblingIndex: number;
}

export class RemoveComponentCommand implements Command<PageModel> {
  public readonly label = 'Remove component';
  readonly #requestedIds: readonly string[];
  #removedNodes: readonly RemovedNodeRecord[] | null = null;
  #removedRoots: readonly RemovedRootRecord[] | null = null;

  public constructor(componentIds: string | readonly string[]) {
    this.#requestedIds = typeof componentIds === 'string' ? [componentIds] : [...componentIds];
    if (this.#requestedIds.length === 0) {
      throw new RangeError('At least one component ID is required.');
    }
  }

  public execute(page: PageModel): PageModel {
    if (this.#removedNodes === null || this.#removedRoots === null) {
      const roots = normalizeTopLevelIds(page, this.#requestedIds);
      if (roots.includes(page.rootComponentId)) {
        throw new DesignerModelError('The page root component cannot be removed.');
      }
      const removedIds = collectSubtreeIds(page, roots);
      this.#removedNodes = page.components
        .map((node, componentIndex) => ({ node, componentIndex }))
        .filter(({ node }) => removedIds.has(node.id));
      this.#removedRoots = roots.map((id) => {
        const node = findDesignerComponent(page, id);
        if (node.parentId === null) {
          throw new DesignerModelError(`Component "${id}" has no removable parent.`);
        }
        const parent = findDesignerComponent(page, node.parentId);
        const siblingIndex = parent.children.indexOf(id);
        if (siblingIndex < 0) {
          throw new DesignerModelError(`Parent "${parent.id}" does not reference child "${id}".`);
        }
        return { id, parentId: parent.id, siblingIndex };
      });
    }

    const removedIds = new Set(this.#removedNodes.map(({ node }) => node.id));
    const rootIds = new Set(this.#removedRoots.map(({ id }) => id));
    return {
      ...page,
      components: page.components
        .filter(({ id }) => !removedIds.has(id))
        .map((component) =>
          this.#removedRoots?.some(({ parentId }) => parentId === component.id) === true
            ? { ...component, children: component.children.filter((id) => !rootIds.has(id)) }
            : component,
        ),
    };
  }

  public undo(page: PageModel): PageModel {
    if (this.#removedNodes === null || this.#removedRoots === null) {
      throw new Error('Cannot undo a RemoveComponentCommand before it has executed.');
    }
    for (const { node } of this.#removedNodes) {
      if (page.components.some(({ id }) => id === node.id)) {
        throw new DesignerModelError(`Cannot restore duplicate component ID "${node.id}".`);
      }
    }

    const components = [...page.components];
    for (const record of [...this.#removedNodes].sort(
      (a, b) => a.componentIndex - b.componentIndex,
    )) {
      components.splice(record.componentIndex, 0, record.node);
    }

    const rootsByParent = new Map<string, RemovedRootRecord[]>();
    for (const root of this.#removedRoots) {
      const records = rootsByParent.get(root.parentId) ?? [];
      records.push(root);
      rootsByParent.set(root.parentId, records);
    }
    const replacements = new Map<string, ComponentNode>();
    for (const [parentId, roots] of rootsByParent) {
      const parent = findDesignerComponent({ ...page, components }, parentId);
      const children = [...parent.children];
      for (const root of roots.sort((a, b) => a.siblingIndex - b.siblingIndex)) {
        children.splice(root.siblingIndex, 0, root.id);
      }
      replacements.set(parentId, { ...parent, children });
    }
    return replaceComponentNodes({ ...page, components }, replacements);
  }
}

export interface MoveCommandOptions extends MovementOptions {
  readonly constrainToParent?: boolean;
}

export class MoveCommand implements Command<PageModel> {
  public readonly label = 'Move component';
  readonly #componentIds: readonly string[];
  readonly #delta: Point;
  readonly #options: MoveCommandOptions;
  #before: ReadonlyMap<string, Bounds> | null = null;
  #after: ReadonlyMap<string, Bounds> | null = null;

  public constructor(
    componentIds: string | readonly string[],
    delta: Point,
    options: MoveCommandOptions = {},
  ) {
    this.#componentIds = [
      ...new Set(typeof componentIds === 'string' ? [componentIds] : componentIds),
    ];
    if (this.#componentIds.length === 0) {
      throw new RangeError('At least one component ID is required.');
    }
    this.#delta = { ...delta };
    this.#options = { ...options };
  }

  public execute(page: PageModel): PageModel {
    if (this.#after === null) {
      const components = this.#componentIds.map((id) => findDesignerComponent(page, id));
      if (components.some(({ id }) => id === page.rootComponentId)) {
        throw new DesignerModelError('The page root component cannot be moved.');
      }
      const parentId = components[0]?.parentId;
      if (
        parentId === null ||
        parentId === undefined ||
        components.some((component) => component.parentId !== parentId)
      ) {
        throw new DesignerModelError('Components moved together must have the same parent.');
      }
      const containerBounds =
        this.#options.containerBounds ??
        (this.#options.constrainToParent === false
          ? undefined
          : getParentContentBounds(page, parentId));
      const result = moveBoundsTogether(
        components.map(({ bounds }) => bounds),
        this.#delta,
        { ...this.#options, containerBounds },
      );
      this.#before = new Map(components.map((component) => [component.id, component.bounds]));
      this.#after = new Map(
        components.map((component, index) => [component.id, result.bounds[index] as Bounds]),
      );
    }
    return replaceComponentBounds(page, this.#after);
  }

  public undo(page: PageModel): PageModel {
    if (this.#before === null) {
      throw new Error('Cannot undo a MoveCommand before it has executed.');
    }
    return replaceComponentBounds(page, this.#before);
  }
}

export interface ResizeCommandOptions extends ResizeOptions {
  readonly constrainToParent?: boolean;
}

type ResizeRequest =
  | { readonly kind: 'bounds'; readonly bounds: Bounds }
  | {
      readonly kind: 'interaction';
      readonly handle: ResizeHandle;
      readonly delta: Point;
      readonly options: ResizeCommandOptions;
    };

export class ResizeCommand implements Command<PageModel> {
  public readonly label = 'Resize component';
  readonly #componentId: string;
  readonly #request: ResizeRequest;
  #before: Bounds | null = null;
  #after: Bounds | null = null;

  public constructor(componentId: string, bounds: Bounds);
  public constructor(
    componentId: string,
    handle: ResizeHandle,
    delta: Point,
    options?: ResizeCommandOptions,
  );
  public constructor(
    componentId: string,
    boundsOrHandle: Bounds | ResizeHandle,
    delta?: Point,
    options: ResizeCommandOptions = {},
  ) {
    this.#componentId = componentId;
    if (typeof boundsOrHandle === 'string') {
      if (delta === undefined) {
        throw new TypeError('A resize delta is required with a resize handle.');
      }
      this.#request = {
        kind: 'interaction',
        handle: boundsOrHandle,
        delta: { ...delta },
        options: { ...options },
      };
    } else {
      assertValidBounds(boundsOrHandle);
      this.#request = { kind: 'bounds', bounds: { ...boundsOrHandle } };
    }
  }

  public execute(page: PageModel): PageModel {
    if (this.#after === null) {
      const component = findDesignerComponent(page, this.#componentId);
      if (component.id === page.rootComponentId) {
        throw new DesignerModelError(
          'The page root component cannot be resized with ResizeCommand.',
        );
      }
      this.#before = component.bounds;
      if (this.#request.kind === 'bounds') {
        this.#after = this.#request.bounds;
      } else {
        const parentId = component.parentId;
        if (parentId === null) {
          throw new DesignerModelError(`Component "${component.id}" has no parent bounds.`);
        }
        const containerBounds =
          this.#request.options.containerBounds ??
          (this.#request.options.constrainToParent === false
            ? undefined
            : getParentContentBounds(page, parentId));
        this.#after = resizeBounds(component.bounds, this.#request.handle, this.#request.delta, {
          ...this.#request.options,
          containerBounds,
        });
      }
    }
    return replaceComponentBounds(page, new Map([[this.#componentId, this.#after]]));
  }

  public undo(page: PageModel): PageModel {
    if (this.#before === null) {
      throw new Error('Cannot undo a ResizeCommand before it has executed.');
    }
    return replaceComponentBounds(page, new Map([[this.#componentId, this.#before]]));
  }
}

interface PreviousPropertyValue {
  readonly existed: boolean;
  readonly value: unknown;
}

export class ChangePropertyCommand implements Command<PageModel> {
  public readonly label = 'Change property';
  readonly #componentIds: readonly string[];
  readonly #propertyName: string;
  readonly #value: unknown;
  #previous = new Map<string, PreviousPropertyValue>();
  #hasExecuted = false;

  public constructor(
    componentIds: string | readonly string[],
    propertyName: string,
    value: unknown,
  ) {
    this.#componentIds = [
      ...new Set(typeof componentIds === 'string' ? [componentIds] : componentIds),
    ];
    if (this.#componentIds.length === 0) {
      throw new RangeError('At least one component ID is required.');
    }
    if (propertyName.length === 0) {
      throw new RangeError('propertyName must not be empty.');
    }
    this.#propertyName = propertyName;
    this.#value = value;
  }

  public execute(page: PageModel): PageModel {
    const replacements = new Map<string, ComponentNode>();
    for (const id of this.#componentIds) {
      const component = findDesignerComponent(page, id);
      if (!this.#hasExecuted) {
        this.#previous.set(id, {
          existed: Object.hasOwn(component.props, this.#propertyName),
          value: component.props[this.#propertyName],
        });
      }
      replacements.set(id, {
        ...component,
        props: { ...component.props, [this.#propertyName]: this.#value },
      });
    }
    this.#hasExecuted = true;
    return replaceComponentNodes(page, replacements);
  }

  public undo(page: PageModel): PageModel {
    if (!this.#hasExecuted) {
      throw new Error('Cannot undo a ChangePropertyCommand before it has executed.');
    }
    const replacements = new Map<string, ComponentNode>();
    for (const id of this.#componentIds) {
      const component = findDesignerComponent(page, id);
      const previous = this.#previous.get(id);
      if (previous === undefined) {
        throw new Error(`Missing previous property value for "${id}".`);
      }
      const props = { ...component.props };
      if (previous.existed) {
        props[this.#propertyName] = previous.value;
      } else {
        delete props[this.#propertyName];
      }
      replacements.set(id, { ...component, props });
    }
    return replaceComponentNodes(page, replacements);
  }
}

export type LayoutPropertyTarget = 'container' | 'item';

type LayoutPropertyRecord = ContainerLayout | LayoutItem;

function replaceLayoutProperty(
  component: ComponentNode,
  target: LayoutPropertyTarget,
  propertyName: string,
  value: unknown,
): ComponentNode {
  const current = component.layout[target] as LayoutPropertyRecord;
  if (!Object.hasOwn(current, propertyName)) {
    throw new DesignerModelError(
      `Unknown ${target} layout property "${propertyName}" for component "${component.id}".`,
    );
  }
  return {
    ...component,
    layout: {
      ...component.layout,
      [target]: { ...current, [propertyName]: value },
    },
  } as ComponentNode;
}

/** Changes one persisted responsive-layout rule and preserves its undo delta. */
export class ChangeLayoutPropertyCommand implements Command<PageModel> {
  public readonly label = 'Change responsive layout';
  readonly #componentIds: readonly string[];
  readonly #target: LayoutPropertyTarget;
  readonly #propertyName: string;
  readonly #value: unknown;
  #previous = new Map<string, unknown>();
  #hasExecuted = false;

  public constructor(
    componentIds: string | readonly string[],
    target: LayoutPropertyTarget,
    propertyName: string,
    value: unknown,
  ) {
    this.#componentIds = [
      ...new Set(typeof componentIds === 'string' ? [componentIds] : componentIds),
    ];
    if (this.#componentIds.length === 0) {
      throw new RangeError('At least one component is required to change responsive layout.');
    }
    this.#target = target;
    this.#propertyName = propertyName;
    this.#value = value;
  }

  public execute(page: PageModel): PageModel {
    const replacements = new Map<string, ComponentNode>();
    for (const id of this.#componentIds) {
      const component = findDesignerComponent(page, id);
      const current = component.layout[this.#target] as LayoutPropertyRecord;
      if (!this.#hasExecuted) this.#previous.set(id, Reflect.get(current, this.#propertyName));
      replacements.set(
        id,
        replaceLayoutProperty(component, this.#target, this.#propertyName, this.#value),
      );
    }
    this.#hasExecuted = true;
    return replaceComponentNodes(page, replacements);
  }

  public undo(page: PageModel): PageModel {
    if (!this.#hasExecuted) {
      throw new Error('Cannot undo a ChangeLayoutPropertyCommand before it has executed.');
    }
    const replacements = new Map<string, ComponentNode>();
    for (const id of this.#componentIds) {
      const previous = this.#previous.get(id);
      if (previous === undefined) {
        throw new Error(`Missing previous responsive-layout value for component "${id}".`);
      }
      const component = findDesignerComponent(page, id);
      replacements.set(
        id,
        replaceLayoutProperty(component, this.#target, this.#propertyName, previous),
      );
    }
    return replaceComponentNodes(page, replacements);
  }
}

/**
 * Reorders direct siblings without altering component identity, bounds, or
 * parentage. Flow containers use this ordered child list as their visual
 * sequence, so it is the persisted counterpart of a canvas drag reorder.
 */
export class ReorderComponentsCommand implements Command<PageModel> {
  public readonly label = 'Reorder components';
  readonly #parentId: string;
  readonly #componentIds: readonly string[];
  readonly #beforeComponentId: string | null;
  #before: readonly string[] | null = null;
  #after: readonly string[] | null = null;

  public constructor(
    parentId: string,
    componentIds: string | readonly string[],
    beforeComponentId: string | null,
  ) {
    this.#parentId = parentId;
    this.#componentIds = [
      ...new Set(typeof componentIds === 'string' ? [componentIds] : componentIds),
    ];
    if (this.#componentIds.length === 0) {
      throw new RangeError('At least one component is required to reorder siblings.');
    }
    this.#beforeComponentId = beforeComponentId;
  }

  public execute(page: PageModel): PageModel {
    const parent = findDesignerComponent(page, this.#parentId);
    if (this.#after === null) {
      const moved = new Set(this.#componentIds);
      for (const componentId of this.#componentIds) {
        const component = findDesignerComponent(page, componentId);
        if (component.parentId !== parent.id || !parent.children.includes(component.id)) {
          throw new DesignerModelError(
            `Component "${component.id}" is not a direct child of "${parent.id}".`,
          );
        }
      }
      if (
        this.#beforeComponentId !== null &&
        (!parent.children.includes(this.#beforeComponentId) || moved.has(this.#beforeComponentId))
      ) {
        throw new DesignerModelError(
          `Reorder target "${this.#beforeComponentId}" must be an unmoved child of "${parent.id}".`,
        );
      }

      this.#before = [...parent.children];
      const remaining = parent.children.filter((componentId) => !moved.has(componentId));
      const insertionIndex =
        this.#beforeComponentId === null
          ? remaining.length
          : remaining.indexOf(this.#beforeComponentId);
      if (insertionIndex < 0) {
        throw new DesignerModelError(
          `Unable to resolve a valid reorder position in "${parent.id}".`,
        );
      }
      this.#after = [
        ...remaining.slice(0, insertionIndex),
        ...this.#componentIds,
        ...remaining.slice(insertionIndex),
      ];
    }
    return replaceComponentNodes(
      page,
      new Map([[parent.id, { ...parent, children: this.#after }]]),
    );
  }

  public undo(page: PageModel): PageModel {
    if (this.#before === null) {
      throw new Error('Cannot undo a ReorderComponentsCommand before it has executed.');
    }
    const parent = findDesignerComponent(page, this.#parentId);
    return replaceComponentNodes(
      page,
      new Map([[parent.id, { ...parent, children: this.#before }]]),
    );
  }
}

export function isValidComponentName(name: string): boolean {
  return getTypeScriptIdentifierError(name) === undefined;
}

export class RenameComponentCommand implements Command<PageModel> {
  public readonly label = 'Rename component';
  readonly #componentId: string;
  readonly #newName: string;
  #oldName: string | null = null;

  public constructor(componentId: string, newName: string) {
    const nameError = getTypeScriptIdentifierError(newName);
    if (nameError !== undefined) {
      throw new DesignerModelError(`"${newName}" is not a valid component name: ${nameError}.`);
    }
    this.#componentId = componentId;
    this.#newName = newName;
  }

  public execute(page: PageModel): PageModel {
    const component = findDesignerComponent(page, this.#componentId);
    const validation = validateComponentName(this.#newName, page, this.#componentId);
    if (!validation.valid) {
      throw new DesignerModelError(
        `Component name "${this.#newName}" is invalid: ${validation.reason ?? 'unknown reason'}.`,
      );
    }
    this.#oldName ??= component.name;
    return replaceComponentNodes(
      page,
      new Map([[component.id, { ...component, name: this.#newName }]]),
    );
  }

  public undo(page: PageModel): PageModel {
    if (this.#oldName === null) {
      throw new Error('Cannot undo a RenameComponentCommand before it has executed.');
    }
    const component = findDesignerComponent(page, this.#componentId);
    return replaceComponentNodes(
      page,
      new Map([[component.id, { ...component, name: this.#oldName }]]),
    );
  }
}

export {
  AddComponentCommand as AddCommand,
  ChangeLayoutPropertyCommand as ChangeLayoutProperty,
  ChangePropertyCommand as ChangeProperty,
  MoveCommand as Move,
  ReorderComponentsCommand as ReorderComponents,
  RemoveComponentCommand as RemoveCommand,
  RenameComponentCommand as RenameCommand,
  ResizeCommand as Resize,
};
