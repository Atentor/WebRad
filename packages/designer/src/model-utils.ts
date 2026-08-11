import type { Bounds, ComponentNode, FormModel } from '@webrad/project-model';

export class DesignerModelError extends Error {
  public override readonly name = 'DesignerModelError';
}

export function findDesignerComponent(form: FormModel, componentId: string): ComponentNode {
  const component = form.components.find(({ id }) => id === componentId);
  if (component === undefined) {
    throw new DesignerModelError(`Component "${componentId}" does not exist in form "${form.id}".`);
  }
  return component;
}

export function assertUniqueComponentIds(form: FormModel): void {
  const ids = new Set<string>();
  for (const component of form.components) {
    if (ids.has(component.id)) {
      throw new DesignerModelError(
        `Form "${form.id}" contains duplicate component ID "${component.id}".`,
      );
    }
    ids.add(component.id);
  }
}

export function cloneComponentNode(component: ComponentNode): ComponentNode {
  return {
    ...component,
    bounds: { ...component.bounds },
    props: { ...component.props },
    events: { ...component.events },
    children: [...component.children],
  };
}

export function replaceComponentNodes(
  form: FormModel,
  replacements: ReadonlyMap<string, ComponentNode>,
): FormModel {
  if (replacements.size === 0) {
    return form;
  }
  let changed = false;
  const components = form.components.map((component) => {
    const replacement = replacements.get(component.id);
    if (replacement === undefined) {
      return component;
    }
    changed ||= replacement !== component;
    return replacement;
  });
  return changed ? { ...form, components } : form;
}

export function replaceComponentBounds(
  form: FormModel,
  replacements: ReadonlyMap<string, Bounds>,
): FormModel {
  const nodes = new Map<string, ComponentNode>();
  for (const [id, bounds] of replacements) {
    const component = findDesignerComponent(form, id);
    nodes.set(id, { ...component, bounds: { ...bounds } });
  }
  return replaceComponentNodes(form, nodes);
}

export function getParentContentBounds(form: FormModel, parentId: string): Bounds {
  if (parentId === form.rootComponentId) {
    return { x: 0, y: 0, width: form.width, height: form.height };
  }
  const parent = findDesignerComponent(form, parentId);
  return { x: 0, y: 0, width: parent.bounds.width, height: parent.bounds.height };
}

export function collectSubtreeIds(form: FormModel, rootIds: readonly string[]): Set<string> {
  const byId = new Map(form.components.map((component) => [component.id, component]));
  const result = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string): void => {
    if (result.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      throw new DesignerModelError(`Component tree contains a cycle at "${id}".`);
    }
    const node = byId.get(id);
    if (node === undefined) {
      throw new DesignerModelError(`Component "${id}" does not exist in form "${form.id}".`);
    }
    visiting.add(id);
    for (const childId of node.children) {
      visit(childId);
    }
    visiting.delete(id);
    result.add(id);
  };

  for (const rootId of rootIds) {
    visit(rootId);
  }
  return result;
}

export function normalizeTopLevelIds(form: FormModel, ids: Iterable<string>): string[] {
  const uniqueIds = [...new Set(ids)];
  const selected = new Set(uniqueIds);
  const byId = new Map(form.components.map((component) => [component.id, component]));

  for (const id of uniqueIds) {
    if (!byId.has(id)) {
      throw new DesignerModelError(`Component "${id}" does not exist in form "${form.id}".`);
    }
  }

  return uniqueIds.filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null;
    const visited = new Set<string>();
    while (parentId !== null) {
      if (selected.has(parentId)) {
        return false;
      }
      if (visited.has(parentId)) {
        throw new DesignerModelError(`Component parent chain contains a cycle at "${parentId}".`);
      }
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}
