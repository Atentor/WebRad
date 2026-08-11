import { ModelUpdateError } from './errors.js';
import {
  assertValidFormName,
  assertValidTypeScriptIdentifier,
  portableFileNameKey,
  validateComponentName,
} from './naming.js';
import { parseComponentNode, parseForm, parseProject } from './schemas.js';
import type { Bounds, ComponentNode, FormModel, ProjectSettings, WebRadProject } from './types.js';

export function findComponent(form: FormModel, componentId: string): ComponentNode | undefined {
  return form.components.find((component) => component.id === componentId);
}

export function getComponent(form: FormModel, componentId: string): ComponentNode {
  const component = findComponent(form, componentId);
  if (component === undefined) {
    throw new ModelUpdateError(
      `Component ID "${componentId}" does not exist in form "${form.name}".`,
    );
  }
  return component;
}

export type ComponentPatch = Partial<Omit<ComponentNode, 'id'>> & { readonly id?: string };
export type ComponentUpdater = ComponentPatch | ((component: ComponentNode) => ComponentNode);

export function updateComponent(
  formInput: FormModel,
  componentId: string,
  updater: ComponentUpdater,
): FormModel {
  const form = parseForm(formInput);
  const current = getComponent(form, componentId);
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
  const components = form.components.map((component) =>
    component.id === componentId ? parsedComponent : component,
  );
  return parseForm({ ...form, components });
}

export function renameComponent(form: FormModel, componentId: string, name: string): FormModel {
  const validation = validateComponentName(name, form, componentId);
  if (!validation.valid) {
    throw new ModelUpdateError(validation.reason ?? `Invalid component name "${name}".`);
  }
  return updateComponent(form, componentId, { name });
}

export function updateComponentBounds(
  form: FormModel,
  componentId: string,
  patch: Partial<Bounds>,
): FormModel {
  const current = getComponent(form, componentId);
  return updateComponent(form, componentId, {
    bounds: { ...current.bounds, ...patch },
  });
}

export function updateComponentProps(
  form: FormModel,
  componentId: string,
  patch: Readonly<Record<string, unknown>>,
): FormModel {
  const current = getComponent(form, componentId);
  return updateComponent(form, componentId, { props: { ...current.props, ...patch } });
}

export function removeComponentProperty(
  form: FormModel,
  componentId: string,
  propertyName: string,
): FormModel {
  const current = getComponent(form, componentId);
  const props: Record<string, unknown> = { ...current.props };
  delete props[propertyName];
  return updateComponent(form, componentId, { props });
}

export function bindComponentEvent(
  form: FormModel,
  componentId: string,
  eventName: string,
  handlerName: string | null,
): FormModel {
  if (handlerName !== null) {
    assertValidTypeScriptIdentifier(handlerName);
  }
  const current = getComponent(form, componentId);
  return updateComponent(form, componentId, {
    events: { ...current.events, [eventName]: handlerName },
  });
}

export function addComponent(
  formInput: FormModel,
  nodeInput: ComponentNode,
  parentId: string | null = nodeInput.parentId,
): FormModel {
  const form = parseForm(formInput);
  const node = parseComponentNode({ ...nodeInput, parentId });

  if (findComponent(form, node.id) !== undefined) {
    throw new ModelUpdateError(`Component ID "${node.id}" already exists.`);
  }
  if (node.children.length > 0) {
    throw new ModelUpdateError('A newly added component cannot already own child IDs.');
  }

  let components = [...form.components];
  if (parentId !== null) {
    const parent = getComponent(form, parentId);
    components = components.map((component) =>
      component.id === parentId
        ? { ...parent, children: [...parent.children, node.id] }
        : component,
    );
  }
  components.push(node);
  return parseForm({ ...form, components });
}

function collectDescendantIds(form: FormModel, componentId: string, output: Set<string>): void {
  if (output.has(componentId)) return;
  output.add(componentId);
  const component = getComponent(form, componentId);
  component.children.forEach((childId) => collectDescendantIds(form, childId, output));
}

export function removeComponent(formInput: FormModel, componentId: string): FormModel {
  const form = parseForm(formInput);
  if (componentId === form.rootComponentId) {
    throw new ModelUpdateError('The root WebForm component cannot be removed.');
  }
  getComponent(form, componentId);

  const removedIds = new Set<string>();
  collectDescendantIds(form, componentId, removedIds);
  const components = form.components
    .filter((component) => !removedIds.has(component.id))
    .map((component) => ({
      ...component,
      children: component.children.filter((childId) => !removedIds.has(childId)),
    }));

  return parseForm({ ...form, components });
}

export function reparentComponent(
  formInput: FormModel,
  componentId: string,
  newParentId: string | null,
  childIndex?: number,
): FormModel {
  const form = parseForm(formInput);
  const component = getComponent(form, componentId);
  if (componentId === form.rootComponentId) {
    throw new ModelUpdateError('The root WebForm component cannot be reparented.');
  }
  if (newParentId === componentId) {
    throw new ModelUpdateError('A component cannot be its own parent.');
  }
  if (newParentId !== null) getComponent(form, newParentId);

  const components = form.components.map((candidate) => {
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

  return parseForm({ ...form, components });
}

export function reorderChildren(
  formInput: FormModel,
  parentId: string,
  orderedChildIds: readonly string[],
): FormModel {
  const form = parseForm(formInput);
  const parent = getComponent(form, parentId);
  if (
    parent.children.length !== orderedChildIds.length ||
    parent.children.some((id) => !orderedChildIds.includes(id)) ||
    new Set(orderedChildIds).size !== orderedChildIds.length
  ) {
    throw new ModelUpdateError(
      'A reordered child list must be an exact permutation of existing children.',
    );
  }
  return updateComponent(form, parentId, { children: [...orderedChildIds] });
}

export function findForm(project: WebRadProject, formId: string): FormModel | undefined {
  return project.forms.find((form) => form.id === formId);
}

export function getForm(project: WebRadProject, formId: string): FormModel {
  const form = findForm(project, formId);
  if (form === undefined) {
    throw new ModelUpdateError(`Form ID "${formId}" does not exist in project "${project.name}".`);
  }
  return form;
}

export type FormPatch = Partial<Omit<FormModel, 'id'>> & { readonly id?: string };
export type FormUpdater = FormPatch | ((form: FormModel) => FormModel);

export function updateForm(
  projectInput: WebRadProject,
  formId: string,
  updater: FormUpdater,
): WebRadProject {
  const project = parseProject(projectInput);
  const current = getForm(project, formId);
  const updated =
    typeof updater === 'function'
      ? updater(current)
      : ({ ...current, ...updater, id: current.id } satisfies FormModel);

  if (
    updated.id !== current.id ||
    (typeof updater !== 'function' && updater.id !== undefined && updater.id !== current.id)
  ) {
    throw new ModelUpdateError('Form IDs are immutable and cannot be changed by an update.');
  }

  const parsedForm = parseForm(updated);
  return parseProject({
    ...project,
    forms: project.forms.map((form) => (form.id === formId ? parsedForm : form)),
  });
}

export function addForm(
  projectInput: WebRadProject,
  formInput: FormModel,
  setAsEntry = false,
): WebRadProject {
  const project = parseProject(projectInput);
  const form = parseForm(formInput);
  return parseProject({
    ...project,
    entryForm: setAsEntry ? form.id : project.entryForm,
    forms: [...project.forms, form],
  });
}

export function removeForm(projectInput: WebRadProject, formId: string): WebRadProject {
  const project = parseProject(projectInput);
  getForm(project, formId);
  if (project.forms.length === 1) {
    throw new ModelUpdateError('A project must contain at least one form.');
  }
  const forms = project.forms.filter((form) => form.id !== formId);
  return parseProject({
    ...project,
    entryForm: project.entryForm === formId ? forms[0]?.id : project.entryForm,
    forms,
  });
}

export function renameForm(
  projectInput: WebRadProject,
  formId: string,
  name: string,
): WebRadProject {
  assertValidFormName(name);
  const project = parseProject(projectInput);
  const form = getForm(project, formId);
  const nameKey = portableFileNameKey(name);
  if (form.name !== name && portableFileNameKey(form.name) === nameKey) {
    throw new ModelUpdateError('A form rename must differ by more than case or normalization.');
  }
  if (
    project.forms.some(
      (candidate) => candidate.id !== formId && portableFileNameKey(candidate.name) === nameKey,
    )
  ) {
    throw new ModelUpdateError(`Form name "${name}" already exists in this project.`);
  }
  const components = form.components.map((component) =>
    component.id === form.rootComponentId ? { ...component, name } : component,
  );
  return updateForm(project, formId, { name, components });
}

export function setEntryForm(projectInput: WebRadProject, formId: string): WebRadProject {
  const project = parseProject(projectInput);
  getForm(project, formId);
  return parseProject({ ...project, entryForm: formId });
}

export function updateProjectSettings(
  projectInput: WebRadProject,
  patch: Partial<ProjectSettings>,
): WebRadProject {
  const project = parseProject(projectInput);
  return parseProject({ ...project, settings: { ...project.settings, ...patch } });
}

export const setComponentProps = updateComponentProps;
export const setComponentBounds = updateComponentBounds;
export const setComponentEvent = bindComponentEvent;
