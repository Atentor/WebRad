import {
  RepeatingGroupConfigurationSchema,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';

import type { Command } from './command-history.js';
import { DEFAULT_GRID_SIZE, moveBoundsTogether, type Point } from './geometry.js';
import {
  cloneComponentNode,
  collectSubtreeIds,
  DesignerModelError,
  findDesignerComponent,
  getParentContentBounds,
  normalizeTopLevelIds,
  replaceComponentNodes,
} from './model-utils.js';

export interface DesignerClipboardData {
  readonly version: 1;
  readonly rootIds: readonly string[];
  readonly components: readonly ComponentNode[];
}

export type ClipboardIdFactory = (sourceId: string, index: number) => string;

export interface PasteOptions {
  readonly parentId?: string;
  readonly siblingIndex?: number;
  readonly offset?: Point;
  readonly snapToGrid?: boolean;
  readonly gridSize?: number;
  readonly constrainToParent?: boolean;
  readonly createId?: ClipboardIdFactory;
}

export interface MaterializedPaste {
  readonly parentId: string;
  readonly rootIds: readonly string[];
  readonly components: readonly ComponentNode[];
}

function createRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Pasting requires an ID factory when crypto.randomUUID() is unavailable.');
  }
  return globalThis.crypto.randomUUID();
}

function nextAvailableName(sourceName: string, usedNames: Set<string>): string {
  if (!usedNames.has(sourceName.toLocaleLowerCase())) {
    usedNames.add(sourceName.toLocaleLowerCase());
    return sourceName;
  }

  const base = `${sourceName}Copy`;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

export function copyComponents(
  page: PageModel,
  componentIds: Iterable<string>,
): DesignerClipboardData {
  const rootIds = normalizeTopLevelIds(page, componentIds);
  if (rootIds.length === 0) {
    throw new RangeError('At least one component ID is required.');
  }
  if (rootIds.includes(page.rootComponentId)) {
    throw new DesignerModelError('The page root component cannot be copied.');
  }
  const copiedIds = collectSubtreeIds(page, rootIds);
  return {
    version: 1,
    rootIds,
    components: page.components.filter(({ id }) => copiedIds.has(id)).map(cloneComponentNode),
  };
}

export function validateClipboardData(data: DesignerClipboardData): void {
  if (data.version !== 1) {
    throw new DesignerModelError(
      `Unsupported designer clipboard version: ${String(data.version)}.`,
    );
  }
  if (data.rootIds.length === 0 || data.components.length === 0) {
    throw new DesignerModelError('Designer clipboard data is empty.');
  }

  const byId = new Map<string, ComponentNode>();
  for (const component of data.components) {
    if (byId.has(component.id)) {
      throw new DesignerModelError(`Clipboard contains duplicate component ID "${component.id}".`);
    }
    byId.set(component.id, component);
  }
  const uniqueRoots = new Set(data.rootIds);
  if (uniqueRoots.size !== data.rootIds.length) {
    throw new DesignerModelError('Clipboard contains duplicate root IDs.');
  }

  const reachable = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new DesignerModelError(`Clipboard component tree contains a cycle at "${id}".`);
    }
    if (reachable.has(id)) {
      return;
    }
    const component = byId.get(id);
    if (component === undefined) {
      throw new DesignerModelError(`Clipboard references missing component "${id}".`);
    }
    visiting.add(id);
    for (const childId of component.children) {
      const child = byId.get(childId);
      if (child === undefined) {
        throw new DesignerModelError(`Clipboard references missing child "${childId}".`);
      }
      if (child.parentId !== component.id) {
        throw new DesignerModelError(`Clipboard child "${childId}" has an inconsistent parent.`);
      }
      visit(childId);
    }
    visiting.delete(id);
    reachable.add(id);
  };

  for (const rootId of data.rootIds) {
    visit(rootId);
  }
  if (reachable.size !== data.components.length) {
    throw new DesignerModelError(
      'Clipboard contains components that are not reachable from its roots.',
    );
  }
}

export function materializePaste(
  page: PageModel,
  data: DesignerClipboardData,
  options: PasteOptions = {},
): MaterializedPaste {
  validateClipboardData(data);
  const parentId = options.parentId ?? page.rootComponentId;
  findDesignerComponent(page, parentId);
  const createId = options.createId ?? (() => createRandomId());
  const existingIds = new Set(page.components.map(({ id }) => id));
  const idMap = new Map<string, string>();
  const generatedIds = new Set<string>();
  data.components.forEach((component, index) => {
    const newId = createId(component.id, index);
    if (newId.length === 0 || existingIds.has(newId) || generatedIds.has(newId)) {
      throw new DesignerModelError(
        `Clipboard ID factory produced duplicate or empty ID "${newId}".`,
      );
    }
    idMap.set(component.id, newId);
    generatedIds.add(newId);
  });

  const usedNames = new Set(page.components.map(({ name }) => name.toLocaleLowerCase()));
  const rootSet = new Set(data.rootIds);
  let components = data.components.map((source) => {
    const id = idMap.get(source.id);
    if (id === undefined) {
      throw new DesignerModelError(`Missing pasted ID for "${source.id}".`);
    }
    const mappedParent = rootSet.has(source.id)
      ? parentId
      : source.parentId === null
        ? null
        : (idMap.get(source.parentId) ?? null);
    if (mappedParent === null) {
      throw new DesignerModelError(`Missing pasted parent for "${source.id}".`);
    }
    return {
      ...cloneComponentNode(source),
      props: remapRepeatingGroupApiReference(source.props, idMap),
      id,
      name: nextAvailableName(source.name, usedNames),
      parentId: mappedParent,
      children: source.children.map((childId) => {
        const mapped = idMap.get(childId);
        if (mapped === undefined) {
          throw new DesignerModelError(`Missing pasted child ID for "${childId}".`);
        }
        return mapped;
      }),
    };
  });

  const pastedRootIds = data.rootIds.map((id) => idMap.get(id) as string);
  const rootNodes = pastedRootIds.map(
    (id) => components.find((component) => component.id === id) as ComponentNode,
  );
  const offset = options.offset ?? { x: DEFAULT_GRID_SIZE, y: DEFAULT_GRID_SIZE };
  const move = moveBoundsTogether(
    rootNodes.map(({ bounds }) => bounds),
    offset,
    {
      snapToGrid: options.snapToGrid,
      gridSize: options.gridSize,
      containerBounds:
        options.constrainToParent === false ? undefined : getParentContentBounds(page, parentId),
    },
  );
  const movedRootBounds = new Map(pastedRootIds.map((id, index) => [id, move.bounds[index]]));
  components = components.map((component) => {
    const bounds = movedRootBounds.get(component.id);
    return bounds === undefined ? component : { ...component, bounds: { ...bounds } };
  });

  return { parentId, rootIds: pastedRootIds, components };
}

function remapRepeatingGroupApiReference(
  props: ComponentNode['props'],
  idMap: ReadonlyMap<string, string>,
): ComponentNode['props'] {
  const parsed = RepeatingGroupConfigurationSchema.safeParse(props.repeatingGroupConfig);
  if (!parsed.success || parsed.data.apiClientId === null) return props;
  const apiClientId = idMap.get(parsed.data.apiClientId);
  return apiClientId === undefined
    ? props
    : { ...props, repeatingGroupConfig: { ...parsed.data, apiClientId } };
}

export class PasteComponentsCommand implements Command<PageModel> {
  public readonly label = 'Paste components';
  readonly #data: DesignerClipboardData;
  readonly #options: PasteOptions;
  #paste: MaterializedPaste | null = null;
  #siblingIndex = -1;

  public constructor(data: DesignerClipboardData, options: PasteOptions = {}) {
    this.#data = data;
    this.#options = { ...options };
  }

  public get pastedRootIds(): readonly string[] {
    return this.#paste === null ? [] : [...this.#paste.rootIds];
  }

  public execute(page: PageModel): PageModel {
    if (this.#paste === null) {
      const paste = materializePaste(page, this.#data, this.#options);
      const parent = findDesignerComponent(page, paste.parentId);
      const requested = this.#options.siblingIndex;
      if (
        requested !== undefined &&
        (!Number.isInteger(requested) || requested < 0 || requested > parent.children.length)
      ) {
        throw new RangeError(
          `siblingIndex must be an integer between 0 and ${parent.children.length}.`,
        );
      }
      this.#siblingIndex = requested ?? parent.children.length;
      this.#paste = paste;
    }

    const paste = this.#paste;
    const pastedIds = new Set(paste.components.map(({ id }) => id));
    if (page.components.some(({ id }) => pastedIds.has(id))) {
      throw new DesignerModelError('One or more pasted component IDs already exist.');
    }
    const parent = findDesignerComponent(page, paste.parentId);
    const children = [...parent.children];
    children.splice(this.#siblingIndex, 0, ...paste.rootIds);
    const components = [...page.components, ...paste.components];
    return replaceComponentNodes(
      { ...page, components },
      new Map([[parent.id, { ...parent, children }]]),
    );
  }

  public undo(page: PageModel): PageModel {
    if (this.#paste === null) {
      throw new Error('Cannot undo a PasteComponentsCommand before it has executed.');
    }
    const pastedIds = new Set(this.#paste.components.map(({ id }) => id));
    const pastedRoots = new Set(this.#paste.rootIds);
    const parent = findDesignerComponent(page, this.#paste.parentId);
    return {
      ...page,
      components: page.components
        .filter(({ id }) => !pastedIds.has(id))
        .map((component) =>
          component.id === parent.id
            ? { ...component, children: component.children.filter((id) => !pastedRoots.has(id)) }
            : component,
        ),
    };
  }
}

export { PasteComponentsCommand as PasteCommand };
