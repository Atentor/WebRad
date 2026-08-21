import type { ComponentNode, PageModel } from '@webrad/project-model';

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
  page: PageModel,
  orders: ReadonlyMap<string, readonly string[]>,
): PageModel {
  const replacements = new Map<string, ComponentNode>();
  for (const [parentId, children] of orders) {
    const parent = findDesignerComponent(page, parentId);
    replacements.set(parentId, { ...parent, children: [...children] });
  }
  return replaceComponentNodes(page, replacements);
}

export function changeZOrder(
  page: PageModel,
  componentIds: Iterable<string>,
  direction: ZOrderDirection,
): PageModel {
  const selectedIds = new Set(componentIds);
  if (selectedIds.size === 0) {
    return page;
  }
  if (selectedIds.has(page.rootComponentId)) {
    throw new DesignerModelError('The page root component has no sibling Z-order.');
  }

  const byParent = new Map<string, Set<string>>();
  for (const id of selectedIds) {
    const component = findDesignerComponent(page, id);
    if (component.parentId === null) {
      throw new DesignerModelError(`Component "${id}" has no parent Z-order.`);
    }
    const group = byParent.get(component.parentId) ?? new Set<string>();
    group.add(id);
    byParent.set(component.parentId, group);
  }

  const orders = new Map<string, readonly string[]>();
  for (const [parentId, ids] of byParent) {
    const parent = findDesignerComponent(page, parentId);
    for (const id of ids) {
      if (!parent.children.includes(id)) {
        throw new DesignerModelError(`Parent "${parentId}" does not reference child "${id}".`);
      }
    }
    orders.set(parentId, reorderedChildren(parent.children, ids, direction));
  }
  return replaceParentOrders(page, orders);
}

export function bringToFront(page: PageModel, componentIds: Iterable<string>): PageModel {
  return changeZOrder(page, componentIds, 'front');
}

export function sendToBack(page: PageModel, componentIds: Iterable<string>): PageModel {
  return changeZOrder(page, componentIds, 'back');
}

export class ChangeZOrderCommand implements Command<PageModel> {
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

  public execute(page: PageModel): PageModel {
    if (this.#after === null) {
      const parentIds = new Set(
        this.#componentIds.map((id) => {
          const parentId = findDesignerComponent(page, id).parentId;
          if (parentId === null) {
            throw new DesignerModelError(`Component "${id}" has no parent Z-order.`);
          }
          return parentId;
        }),
      );
      this.#before = new Map(
        [...parentIds].map((parentId) => [
          parentId,
          [...findDesignerComponent(page, parentId).children],
        ]),
      );
      const changed = changeZOrder(page, this.#componentIds, this.#direction);
      this.#after = new Map(
        [...parentIds].map((parentId) => [
          parentId,
          [...findDesignerComponent(changed, parentId).children],
        ]),
      );
    }
    return replaceParentOrders(page, this.#after);
  }

  public undo(page: PageModel): PageModel {
    if (this.#before === null) {
      throw new Error('Cannot undo a ChangeZOrderCommand before it has executed.');
    }
    return replaceParentOrders(page, this.#before);
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
