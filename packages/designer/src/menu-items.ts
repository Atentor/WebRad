import type { WebMenuItem } from '@webrad/runtime';

export interface MenuItemLocation {
  readonly item: WebMenuItem;
  readonly parentId: string | null;
  readonly index: number;
  readonly depth: number;
}

export function flattenMenuItems(
  items: readonly WebMenuItem[],
  parentId: string | null = null,
  depth = 0,
): readonly MenuItemLocation[] {
  return items.flatMap((item, index) => [
    { item, parentId, index, depth },
    ...flattenMenuItems(item.children ?? [], item.id, depth + 1),
  ]);
}

export function editMenuItem(
  items: readonly WebMenuItem[],
  id: string,
  update: (item: WebMenuItem) => WebMenuItem | null,
): readonly WebMenuItem[] {
  return items.flatMap((item) => {
    if (item.id === id) {
      const next = update(item);
      return next ? [next] : [];
    }
    return [
      { ...item, ...(item.children ? { children: editMenuItem(item.children, id, update) } : {}) },
    ];
  });
}

export function insertMenuItem(
  items: readonly WebMenuItem[],
  parentId: string | null,
  item: WebMenuItem,
): readonly WebMenuItem[] {
  return parentId === null
    ? [...items, item]
    : editMenuItem(items, parentId, (parent) => ({
        ...parent,
        children: [...(parent.children ?? []), item],
        expanded: true,
      }));
}

export function moveMenuItem(
  items: readonly WebMenuItem[],
  id: string,
  direction: 'up' | 'down' | 'indent' | 'outdent',
): readonly WebMenuItem[] {
  const flat = flattenMenuItems(items);
  const current = flat.find((entry) => entry.item.id === id);
  if (!current) return items;
  const siblings =
    current.parentId === null
      ? items
      : (flat.find((entry) => entry.item.id === current.parentId)?.item.children ?? []);
  if (direction === 'indent') {
    const parent = siblings[current.index - 1];
    if (!parent || (parent.kind && parent.kind !== 'item')) return items;
    return insertMenuItem(
      editMenuItem(items, id, () => null),
      parent.id,
      current.item,
    );
  }
  if (direction === 'outdent') {
    const parent = flat.find((entry) => entry.item.id === current.parentId);
    if (!parent) return items;
    const without = editMenuItem(items, id, () => null);
    const insert = (list: readonly WebMenuItem[]): readonly WebMenuItem[] =>
      list.flatMap((item) => (item.id === parent.item.id ? [item, current.item] : [item]));
    if (parent.parentId === null) return insert(without);
    return editMenuItem(without, parent.parentId, (grandparent) => ({
      ...grandparent,
      children: insert(grandparent.children ?? []),
    }));
  }
  const index = current.index + (direction === 'up' ? -1 : 1);
  if (index < 0 || index >= siblings.length) return items;
  const reordered = [...siblings];
  const other = reordered[index];
  if (!other) return items;
  reordered[index] = current.item;
  reordered[current.index] = other;
  return current.parentId === null
    ? reordered
    : editMenuItem(items, current.parentId, (parent) => ({ ...parent, children: reordered }));
}
