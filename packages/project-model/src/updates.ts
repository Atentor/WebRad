import { ModelUpdateError } from './errors.js';
import { applyDefaultComponentStyle } from './default-styles.js';
import { detachPaletteColors } from './color-palette.js';
import {
  assertValidPageName,
  assertValidTypeScriptIdentifier,
  portableFileNameKey,
  validateComponentName,
} from './naming.js';
import {
  parseComponentNode,
  parseComponentStyle,
  parsePage,
  parseProject,
  parseReusableElement,
  parseVisualDocument,
} from './schemas.js';
import type {
  Bounds,
  ComponentNode,
  ComponentStyleModel,
  ComponentStylePropertyName,
  ComponentStyleStateName,
  PageModel,
  ProjectSettings,
  ReusableElementModel,
  StylePropertyValue,
  WebRadProject,
} from './types.js';

export function findComponent(page: PageModel, componentId: string): ComponentNode | undefined {
  return page.components.find((component) => component.id === componentId);
}

export function getComponent(page: PageModel, componentId: string): ComponentNode {
  const component = findComponent(page, componentId);
  if (component === undefined) {
    throw new ModelUpdateError(
      `Component ID "${componentId}" does not exist in page "${page.name}".`,
    );
  }
  return component;
}

export type ComponentPatch = Partial<Omit<ComponentNode, 'id'>> & { readonly id?: string };
export type ComponentUpdater = ComponentPatch | ((component: ComponentNode) => ComponentNode);

export function updateComponent(
  pageInput: PageModel,
  componentId: string,
  updater: ComponentUpdater,
): PageModel {
  const page = parseVisualDocument(pageInput);
  const current = getComponent(page, componentId);
  const updated =
    typeof updater === 'function'
      ? updater(current)
      : ({ ...current, ...updater, id: current.id } satisfies ComponentNode);

  if (
    updated.id !== current.id ||
    (typeof updater !== 'function' && updater.id !== undefined && updater.id !== current.id)
  ) {
    throw new ModelUpdateError('Component IDs are immutable and cannot be changed by an update.');
  }

  const parsedComponent = parseComponentNode(updated);
  const components = page.components.map((component) =>
    component.id === componentId ? parsedComponent : component,
  );
  return parseVisualDocument({ ...page, components });
}

export function renameComponent(page: PageModel, componentId: string, name: string): PageModel {
  const validation = validateComponentName(name, page, componentId);
  if (!validation.valid) {
    throw new ModelUpdateError(validation.reason ?? `Invalid component name "${name}".`);
  }
  return updateComponent(page, componentId, { name });
}

export function updateComponentBounds(
  page: PageModel,
  componentId: string,
  patch: Partial<Bounds>,
): PageModel {
  const current = getComponent(page, componentId);
  return updateComponent(page, componentId, {
    bounds: { ...current.bounds, ...patch },
  });
}

export function updateComponentProps(
  page: PageModel,
  componentId: string,
  patch: Readonly<Record<string, unknown>>,
): PageModel {
  const current = getComponent(page, componentId);
  return updateComponent(page, componentId, { props: { ...current.props, ...patch } });
}

export function removeComponentProperty(
  page: PageModel,
  componentId: string,
  propertyName: string,
): PageModel {
  const current = getComponent(page, componentId);
  const props: Record<string, unknown> = { ...current.props };
  delete props[propertyName];
  return updateComponent(page, componentId, { props });
}

export function bindComponentEvent(
  page: PageModel,
  componentId: string,
  eventName: string,
  handlerName: string | null,
): PageModel {
  if (handlerName !== null) {
    assertValidTypeScriptIdentifier(handlerName);
  }
  const current = getComponent(page, componentId);
  return updateComponent(page, componentId, {
    events: { ...current.events, [eventName]: handlerName },
  });
}

export function addComponent(
  pageInput: PageModel,
  nodeInput: ComponentNode,
  parentId: string | null = nodeInput.parentId,
): PageModel {
  const page = parseVisualDocument(pageInput);
  const node = parseComponentNode({ ...nodeInput, parentId });

  if (findComponent(page, node.id) !== undefined) {
    throw new ModelUpdateError(`Component ID "${node.id}" already exists.`);
  }
  if (node.children.length > 0) {
    throw new ModelUpdateError('A newly added component cannot already own child IDs.');
  }

  let components = [...page.components];
  if (parentId !== null) {
    const parent = getComponent(page, parentId);
    components = components.map((component) =>
      component.id === parentId
        ? { ...parent, children: [...parent.children, node.id] }
        : component,
    );
  }
  components.push(node);
  return parseVisualDocument({ ...page, components });
}

function collectDescendantIds(page: PageModel, componentId: string, output: Set<string>): void {
  if (output.has(componentId)) return;
  output.add(componentId);
  const component = getComponent(page, componentId);
  component.children.forEach((childId) => collectDescendantIds(page, childId, output));
}

export function removeComponent(pageInput: PageModel, componentId: string): PageModel {
  const page = parseVisualDocument(pageInput);
  if (componentId === page.rootComponentId) {
    throw new ModelUpdateError('The root WebPage component cannot be removed.');
  }
  getComponent(page, componentId);

  const removedIds = new Set<string>();
  collectDescendantIds(page, componentId, removedIds);
  const components = page.components
    .filter((component) => !removedIds.has(component.id))
    .map((component) => ({
      ...component,
      children: component.children.filter((childId) => !removedIds.has(childId)),
    }));

  return parseVisualDocument({ ...page, components });
}

export function reparentComponent(
  pageInput: PageModel,
  componentId: string,
  newParentId: string | null,
  childIndex?: number,
): PageModel {
  const page = parseVisualDocument(pageInput);
  const component = getComponent(page, componentId);
  if (componentId === page.rootComponentId) {
    throw new ModelUpdateError('The root WebPage component cannot be reparented.');
  }
  if (newParentId === componentId) {
    throw new ModelUpdateError('A component cannot be its own parent.');
  }
  if (newParentId !== null) getComponent(page, newParentId);

  const components = page.components.map((candidate) => {
    if (candidate.id === componentId) {
      return { ...candidate, parentId: newParentId };
    }
    if (candidate.id === component.parentId) {
      return {
        ...candidate,
        children: candidate.children.filter((id) => id !== componentId),
      };
    }
    if (candidate.id === newParentId) {
      const children = candidate.children.filter((id) => id !== componentId);
      const index = childIndex === undefined ? children.length : childIndex;
      if (!Number.isInteger(index) || index < 0 || index > children.length) {
        throw new ModelUpdateError('The requested child index is outside the parent child list.');
      }
      children.splice(index, 0, componentId);
      return { ...candidate, children };
    }
    return candidate;
  });

  return parseVisualDocument({ ...page, components });
}

export function reorderChildren(
  pageInput: PageModel,
  parentId: string,
  orderedChildIds: readonly string[],
): PageModel {
  const page = parseVisualDocument(pageInput);
  const parent = getComponent(page, parentId);
  if (
    parent.children.length !== orderedChildIds.length ||
    parent.children.some((id) => !orderedChildIds.includes(id)) ||
    new Set(orderedChildIds).size !== orderedChildIds.length
  ) {
    throw new ModelUpdateError(
      'A reordered child list must be an exact permutation of existing children.',
    );
  }
  return updateComponent(page, parentId, { children: [...orderedChildIds] });
}

export function findPage(project: WebRadProject, pageId: string): PageModel | undefined {
  return project.pages.find((page) => page.id === pageId);
}

export function getPage(project: WebRadProject, pageId: string): PageModel {
  const page = findPage(project, pageId);
  if (page === undefined) {
    throw new ModelUpdateError(`Page ID "${pageId}" does not exist in project "${project.name}".`);
  }
  return page;
}

export function findReusableElement(
  project: WebRadProject,
  reusableElementId: string,
): ReusableElementModel | undefined {
  return project.reusableElements.find((element) => element.id === reusableElementId);
}

export function getReusableElement(
  project: WebRadProject,
  reusableElementId: string,
): ReusableElementModel {
  const reusableElement = findReusableElement(project, reusableElementId);
  if (reusableElement === undefined) {
    throw new ModelUpdateError(
      `Reusable component ID "${reusableElementId}" does not exist in project "${project.name}".`,
    );
  }
  return reusableElement;
}

export function findComponentStyle(
  project: WebRadProject,
  styleId: string,
): ComponentStyleModel | undefined {
  return project.styles.find((style) => style.id === styleId);
}

export function getComponentStyle(project: WebRadProject, styleId: string): ComponentStyleModel {
  const style = findComponentStyle(project, styleId);
  if (style === undefined) {
    throw new ModelUpdateError(
      `Component style ID "${styleId}" does not exist in project "${project.name}".`,
    );
  }
  return style;
}

export function addComponentStyle(
  projectInput: WebRadProject,
  styleInput: ComponentStyleModel,
): WebRadProject {
  const project = parseProject(projectInput);
  const style = parseComponentStyle(styleInput);
  return parseProject({ ...project, styles: [...project.styles, style] });
}

export type ComponentStylePatch = Partial<Omit<ComponentStyleModel, 'id'>> & {
  readonly id?: string;
};
export type ComponentStyleUpdater =
  ComponentStylePatch | ((style: ComponentStyleModel) => ComponentStyleModel);

export function updateComponentStyle(
  projectInput: WebRadProject,
  styleId: string,
  updater: ComponentStyleUpdater,
): WebRadProject {
  const project = parseProject(projectInput);
  const current = getComponentStyle(project, styleId);
  const updated =
    typeof updater === 'function'
      ? updater(current)
      : ({ ...current, ...updater, id: current.id } satisfies ComponentStyleModel);

  if (
    updated.id !== current.id ||
    (typeof updater !== 'function' && updater.id !== undefined && updater.id !== current.id)
  ) {
    throw new ModelUpdateError(
      'Component style IDs are immutable and cannot be changed by an update.',
    );
  }

  if (current.preset === 'default' && updated.componentType !== current.componentType) {
    throw new ModelUpdateError('A default component style must keep its component type.');
  }

  const parsedStyle = parseComponentStyle(updated);
  if (parsedStyle.preset !== current.preset) {
    throw new ModelUpdateError('A component style preset cannot be changed after creation.');
  }
  const incompatibleReference = project.pages
    .flatMap((page) => page.components)
    .find(
      (component) => component.styleId === styleId && component.type !== parsedStyle.componentType,
    );
  if (incompatibleReference !== undefined) {
    throw new ModelUpdateError(
      `Component style "${parsedStyle.name}" targets ${parsedStyle.componentType}, not ${incompatibleReference.type}.`,
    );
  }
  return parseProject({
    ...project,
    styles: project.styles.map((style) => (style.id === styleId ? parsedStyle : style)),
  });
}

export type ComponentStylePropertyPatch = Partial<
  Readonly<Record<ComponentStylePropertyName, StylePropertyValue | null>>
>;

/** Updates one visual state. A null value removes that property from the state. */
export function updateComponentStyleState(
  projectInput: WebRadProject,
  styleId: string,
  stateName: ComponentStyleStateName,
  patch: ComponentStylePropertyPatch,
): WebRadProject {
  const style = getComponentStyle(projectInput, styleId);
  const properties: Record<string, StylePropertyValue> = { ...style.states[stateName] };
  for (const [propertyName, value] of Object.entries(patch)) {
    if (value === null) delete properties[propertyName];
    else if (value !== undefined) properties[propertyName] = value;
  }
  return updateComponentStyle(projectInput, styleId, {
    states: {
      ...style.states,
      [stateName]: properties,
    },
  });
}

export function setComponentStyleProperty(
  projectInput: WebRadProject,
  styleId: string,
  stateName: ComponentStyleStateName,
  propertyName: ComponentStylePropertyName,
  value: StylePropertyValue | null,
): WebRadProject {
  return updateComponentStyleState(projectInput, styleId, stateName, {
    [propertyName]: value,
  });
}

function withoutComponentStyle(component: ComponentNode): ComponentNode {
  const unbound = { ...component };
  delete unbound.styleId;
  return unbound;
}

/** Removes a style and atomically clears every reference across project documents. */
export function removeComponentStyle(projectInput: WebRadProject, styleId: string): WebRadProject {
  const project = parseProject(projectInput);
  const style = getComponentStyle(project, styleId);
  if (style.preset === 'default') {
    throw new ModelUpdateError(
      'Default component styles cannot be removed. Customize them instead.',
    );
  }
  return parseProject({
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      components: page.components.map((component) =>
        component.styleId === styleId ? withoutComponentStyle(component) : component,
      ),
    })),
    reusableElements: project.reusableElements.map((reusableElement) => ({
      ...reusableElement,
      components: reusableElement.components.map((component) =>
        component.styleId === styleId ? withoutComponentStyle(component) : component,
      ),
    })),
    styles: project.styles.filter((style) => style.id !== styleId),
  });
}

/** Assigns one compatible project style, or clears the assignment with `null`. */
export function setComponentStyle(
  projectInput: WebRadProject,
  pageId: string,
  componentId: string,
  styleId: string | null,
): WebRadProject {
  const project = parseProject(projectInput);
  const page = findPage(project, pageId);
  const reusableElement = page === undefined ? findReusableElement(project, pageId) : undefined;
  const document = page ?? reusableElement ?? getPage(project, pageId);
  const component = getComponent(document, componentId);

  if (styleId !== null) {
    const style = getComponentStyle(project, styleId);
    if (style.componentType !== component.type) {
      throw new ModelUpdateError(
        `Component style "${style.name}" targets ${style.componentType}, not ${component.type}.`,
      );
    }
  }

  const updatedDocument = updateComponent(document, componentId, (current) =>
    styleId === null ? withoutComponentStyle(current) : { ...current, styleId },
  );
  return page !== undefined
    ? updatePage(project, pageId, () => updatedDocument)
    : updateReusableElement(project, pageId, () => updatedDocument);
}

export type PagePatch = Partial<Omit<PageModel, 'id'>> & { readonly id?: string };
export type PageUpdater = PagePatch | ((page: PageModel) => PageModel);

export function updatePage(
  projectInput: WebRadProject,
  pageId: string,
  updater: PageUpdater,
): WebRadProject {
  const project = parseProject(projectInput);
  const current = getPage(project, pageId);
  const updated =
    typeof updater === 'function'
      ? updater(current)
      : ({ ...current, ...updater, id: current.id } satisfies PageModel);

  if (
    updated.id !== current.id ||
    (typeof updater !== 'function' && updater.id !== undefined && updater.id !== current.id)
  ) {
    throw new ModelUpdateError('Page IDs are immutable and cannot be changed by an update.');
  }

  if (current.name === '404' && updated.name !== '404') {
    throw new ModelUpdateError('The mandatory not-found page must be named 404.');
  }
  const parsedPage = parsePage(updated);
  return parseProject({
    ...project,
    pages: project.pages.map((page) => (page.id === pageId ? parsedPage : page)),
  });
}

export function addPage(
  projectInput: WebRadProject,
  pageInput: PageModel,
  setAsEntry = false,
): WebRadProject {
  const project = parseProject(projectInput);
  const page = parsePage(pageInput);
  if (setAsEntry) {
    throw new ModelUpdateError('The mandatory index page is the project entry page.');
  }
  const styledPage = updateComponent(page, page.rootComponentId, (root) =>
    applyDefaultComponentStyle(root, project.styles),
  );
  return parseProject({
    ...project,
    entryPage: setAsEntry ? styledPage.id : project.entryPage,
    pages: [...project.pages, styledPage],
  });
}

export type ReusableElementPatch = Partial<Omit<ReusableElementModel, 'id'>> & {
  readonly id?: string;
};
export type ReusableElementUpdater =
  ReusableElementPatch | ((reusableElement: ReusableElementModel) => ReusableElementModel);

export function updateReusableElement(
  projectInput: WebRadProject,
  reusableElementId: string,
  updater: ReusableElementUpdater,
): WebRadProject {
  const project = parseProject(projectInput);
  const current = getReusableElement(project, reusableElementId);
  const updated =
    typeof updater === 'function'
      ? updater(current)
      : ({ ...current, ...updater, id: current.id } satisfies ReusableElementModel);
  if (
    updated.id !== current.id ||
    (typeof updater !== 'function' && updater.id !== undefined && updater.id !== current.id)
  ) {
    throw new ModelUpdateError('Reusable component IDs are immutable and cannot be changed.');
  }
  const parsedReusableElement = parseReusableElement(updated);
  return parseProject({
    ...project,
    reusableElements: project.reusableElements.map((reusableElement) =>
      reusableElement.id === reusableElementId ? parsedReusableElement : reusableElement,
    ),
  });
}

export function addReusableElement(
  projectInput: WebRadProject,
  reusableElementInput: ReusableElementModel,
): WebRadProject {
  const project = parseProject(projectInput);
  const reusableElement = parseReusableElement(reusableElementInput);
  const root = getComponent(reusableElement, reusableElement.rootComponentId);
  if (root.type !== 'WebPanel') {
    throw new ModelUpdateError('A reusable component must have a WebPanel root.');
  }
  return parseProject({
    ...project,
    reusableElements: [...project.reusableElements, reusableElement],
  });
}

function reusableReferenceCount(project: WebRadProject, reusableElementId: string): number {
  return [...project.pages, ...project.reusableElements].reduce(
    (count, document) =>
      count +
      document.components.filter(
        (component) =>
          component.type === 'WebReusableElement' &&
          component.props.reusableElementId === reusableElementId,
      ).length,
    0,
  );
}

export function removeReusableElement(
  projectInput: WebRadProject,
  reusableElementId: string,
): WebRadProject {
  const project = parseProject(projectInput);
  getReusableElement(project, reusableElementId);
  const references = reusableReferenceCount(project, reusableElementId);
  if (references > 0) {
    throw new ModelUpdateError(
      `Reusable component is still used by ${String(references)} instance${references === 1 ? '' : 's'}.`,
    );
  }
  return parseProject({
    ...project,
    reusableElements: project.reusableElements.filter(
      (reusableElement) => reusableElement.id !== reusableElementId,
    ),
  });
}

export function renameReusableElement(
  projectInput: WebRadProject,
  reusableElementId: string,
  name: string,
): WebRadProject {
  assertValidPageName(name);
  const project = parseProject(projectInput);
  const reusableElement = getReusableElement(project, reusableElementId);
  const nameKey = portableFileNameKey(name);
  if (
    project.pages.some((page) => portableFileNameKey(page.name) === nameKey) ||
    project.reusableElements.some(
      (candidate) =>
        candidate.id !== reusableElementId && portableFileNameKey(candidate.name) === nameKey,
    )
  ) {
    throw new ModelUpdateError(`Reusable component name "${name}" already exists in this project.`);
  }
  const components = reusableElement.components.map((component) =>
    component.id === reusableElement.rootComponentId ? { ...component, name } : component,
  );
  return updateReusableElement(project, reusableElementId, { name, components });
}

export function removePage(projectInput: WebRadProject, pageId: string): WebRadProject {
  const project = parseProject(projectInput);
  getPage(project, pageId);
  if (pageId === project.entryPage || getPage(project, pageId).name === '404') {
    throw new ModelUpdateError('Mandatory pages cannot be deleted.');
  }
  if (project.pages.length === 1) {
    throw new ModelUpdateError('A project must contain at least one page.');
  }
  const pages = project.pages.filter((page) => page.id !== pageId);
  return parseProject({
    ...project,
    entryPage: project.entryPage === pageId ? pages[0]?.id : project.entryPage,
    pages,
  });
}

export function renamePage(
  projectInput: WebRadProject,
  pageId: string,
  name: string,
): WebRadProject {
  assertValidPageName(name);
  const project = parseProject(projectInput);
  const page = getPage(project, pageId);
  if (page.name === '404' && name !== '404') {
    throw new ModelUpdateError('The mandatory not-found page must be named 404.');
  }
  if (pageId === project.entryPage && name !== 'index') {
    throw new ModelUpdateError('The mandatory entry page must be named index.');
  }
  const nameKey = portableFileNameKey(name);
  if (page.name !== name && portableFileNameKey(page.name) === nameKey) {
    throw new ModelUpdateError('A page rename must differ by more than case or normalization.');
  }
  if (
    project.pages.some(
      (candidate) => candidate.id !== pageId && portableFileNameKey(candidate.name) === nameKey,
    ) ||
    project.reusableElements.some((candidate) => portableFileNameKey(candidate.name) === nameKey)
  ) {
    throw new ModelUpdateError(`Page name "${name}" already exists in this project.`);
  }
  const components = page.components.map((component) =>
    component.id === page.rootComponentId ? { ...component, name } : component,
  );
  return updatePage(project, pageId, { name, components });
}

export function setEntryPage(projectInput: WebRadProject, pageId: string): WebRadProject {
  const project = parseProject(projectInput);
  getPage(project, pageId);
  if (pageId !== project.entryPage) {
    throw new ModelUpdateError('The mandatory index page is the project entry page.');
  }
  return project;
}

export function updateProjectSettings(
  projectInput: WebRadProject,
  patch: Partial<ProjectSettings>,
): WebRadProject {
  const project = parseProject(projectInput);
  const settings = { ...project.settings, ...patch };
  const removed = new Map(
    project.settings.colorPalette
      .filter((color) => !settings.colorPalette.some((entry) => entry.id === color.id))
      .map((entry) => [entry.id, entry.color]),
  );
  if (removed.size === 0) return parseProject({ ...project, settings });
  return parseProject({
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      components: page.components.map((node) => ({
        ...node,
        props: detachPaletteColors(node.props, removed),
      })),
    })),
    reusableElements: project.reusableElements.map((page) => ({
      ...page,
      components: page.components.map((node) => ({
        ...node,
        props: detachPaletteColors(node.props, removed),
      })),
    })),
    styles: project.styles.map((style) => ({
      ...style,
      states: detachPaletteColors(style.states, removed),
    })),
    settings: { ...settings, scrollbar: detachPaletteColors(settings.scrollbar, removed) },
  });
}

export const setComponentProps = updateComponentProps;
export const setComponentBounds = updateComponentBounds;
export const setComponentEvent = bindComponentEvent;
