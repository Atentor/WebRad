import type { ComponentNode, FormModel } from '@webrad/project-model';

import type { Command } from './command-history.js';
import { DesignerModelError, findDesignerComponent, replaceComponentNodes } from './model-utils.js';

export type ZOrderDirection = 'front' | 'back';

function reorderedChildren(
  children: readonly string[],
  selectedIds: ReadonlySet<string>,
  direction: ZOrderDirection,
): string[] {
  const selected = children.filter((id) => selectedIds.has(id));
  const unselected = children.filter((id) => !selectedIds.has(id));
  return direction === 'front' ? [...unselected, ...selected] : [...selected, ...unselected];
}

function replaceParentOrders(
  form: FormModel,
  orders: ReadonlyMap<string, readonly string[]>,
): FormModel {
  const replacements = new Map<string, ComponentNode>();
  for (const [parentId, children] of orders) {
    const parent = findDesignerComponent(form, parentId);
    replacements.set(parentId, { ...parent, children: [...children] });
  }
  return replaceComponentNodes(form, replacements);
}

export function changeZOrder(
  form: FormModel,
  componentIds: Iterable<string>,
  direction: ZOrderDirection,
): FormModel {
  const selectedIds = new Set(componentIds);
  if (selectedIds.size === 0) {
    return form;
  }
  if (selectedIds.has(form.rootComponentId)) {
    throw new DesignerModelError('The form root component has no sibling Z-order.');
  }

  const byParent = new Map<string, Set<string>>();
  for (const id of selectedIds) {
    const component = findDesignerComponent(form, id);
    if (component.parentId === null) {
      throw new DesignerModelError(`Component "${id}" has no parent Z-order.`);
    }
    const group = byParent.get(component.parentId) ?? new Set<string>();
    group.add(id);
    byParent.set(component.parentId, group);
  }

  const orders = new Map<string, readonly string[]>();
  for (const [parentId, ids] of byParent) {
    const parent = findDesignerComponent(form, parentId);
    for (const id of ids) {
      if (!parent.children.includes(id)) {
        throw new DesignerModelError(`Parent "${parentId}" does not reference child "${id}".`);
      }
    }
    orders.set(parentId, reorderedChildren(parent.children, ids, direction));
  }
  return replaceParentOrders(form, orders);
}

export function bringToFront(form: FormModel, componentIds: Iterable<string>): FormModel {
  return changeZOrder(form, componentIds, 'front');
}

export function sendToBack(form: FormModel, componentIds: Iterable<string>): FormModel {
  return changeZOrder(form, componentIds, 'back');
}

export class ChangeZOrderCommand implements Command<FormModel> {
  public readonly label: string;
  readonly #componentIds: readonly string[];
  readonly #direction: ZOrderDirection;
  #before: ReadonlyMap<string, readonly string[]> | null = null;
  #after: ReadonlyMap<string, readonly string[]> | null = null;

  public constructor(componentIds: string | readonly string[], direction: ZOrderDirection) {
    this.#componentIds = [
      ...new Set(typeof componentIds === 'string' ? [componentIds] : componentIds),
    ];
    if (this.#componentIds.length === 0) {
      throw new RangeError('At least one component ID is required.');
    }
    this.#direction = direction;
    this.label = direction === 'front' ? 'Bring to front' : 'Send to back';
  }

  public execute(form: FormModel): FormModel {
    if (this.#after === null) {
      const parentIds = new Set(
        this.#componentIds.map((id) => {
          const parentId = findDesignerComponent(form, id).parentId;
          if (parentId === null) {
            throw new DesignerModelError(`Component "${id}" has no parent Z-order.`);
          }
          return parentId;
        }),
      );
      this.#before = new Map(
        [...parentIds].map((parentId) => [
          parentId,
          [...findDesignerComponent(form, parentId).children],
        ]),
      );
      const changed = changeZOrder(form, this.#componentIds, this.#direction);
      this.#after = new Map(
        [...parentIds].map((parentId) => [
          parentId,
          [...findDesignerComponent(changed, parentId).children],
        ]),
      );
    }
    return replaceParentOrders(form, this.#after);
  }

  public undo(form: FormModel): FormModel {
    if (this.#before === null) {
      throw new Error('Cannot undo a ChangeZOrderCommand before it has executed.');
    }
    return replaceParentOrders(form, this.#before);
  }
}

export class BringToFrontCommand extends ChangeZOrderCommand {
  public constructor(componentIds: string | readonly string[]) {
    super(componentIds, 'front');
  }
}

export class SendToBackCommand extends ChangeZOrderCommand {
  public constructor(componentIds: string | readonly string[]) {
    super(componentIds, 'back');
  }
}
