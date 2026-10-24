type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function item(node: RecordValue): RecordValue | undefined {
  return record(node.layout) && record(node.layout.item) ? node.layout.item : undefined;
}

function unconstrainedHeight(value: RecordValue): boolean {
  return (value.minHeight ?? 0) === 0 && (value.maxHeight ?? null) === null;
}

/** Repair only the original two-node sidebar template and its copied fit-height placements. */
export function materializeResponsiveMenuLayouts(input: unknown): unknown {
  if (!record(input) || !Array.isArray(input.reusableElements)) return input;
  const migrated = new Set<unknown>();
  const definitions = input.reusableElements.map((document: unknown) => {
    if (
      !record(document) ||
      !Array.isArray(document.components) ||
      document.components.length !== 2
    )
      return document;
    const components: unknown[] = document.components;
    const root = components.find((node) => record(node) && node.id === document.rootComponentId);
    if (
      !record(root) ||
      root.type !== 'WebPanel' ||
      root.parentId !== null ||
      !record(root.props) ||
      root.props.borderColor !== 'transparent' ||
      !record(root.bounds) ||
      root.bounds.width !== 288 ||
      root.bounds.height !== 640 ||
      !record(root.layout) ||
      !record(root.layout.container) ||
      root.layout.container.mode !== 'column' ||
      !Array.isArray(root.children) ||
      root.children.length !== 1
    )
      return document;
    const menuId = root.children[0];
    const menu = components.find((node) => record(node) && node.id === menuId);
    if (
      !record(menu) ||
      menu.type !== 'WebMenu' ||
      menu.parentId !== root.id ||
      !record(menu.bounds) ||
      menu.bounds.height !== 640 ||
      menu.bounds.width !== 288 ||
      menu.bounds.x !== 0 ||
      menu.bounds.y !== 0 ||
      !record(menu.props)
    )
      return document;
    if (record(menu.props.configuration) && menu.props.configuration.orientation === 'horizontal')
      return document;
    const rootItem = item(root);
    const menuItem = item(menu);
    if (
      !rootItem ||
      !menuItem ||
      rootItem.width !== 'fit-content' ||
      !['fit-content', 'stretch'].includes(String(rootItem.height)) ||
      !unconstrainedHeight(rootItem) ||
      menuItem.height !== 'fixed' ||
      !unconstrainedHeight(menuItem) ||
      (menuItem.grow ?? 0) !== 0 ||
      menuItem.shrink === false
    )
      return document;
    migrated.add(document.id);
    return {
      ...document,
      components: components.map((node) =>
        node === root
          ? {
              ...root,
              layout: { ...(root.layout as RecordValue), item: { ...rootItem, height: 'stretch' } },
            }
          : node === menu
            ? {
                ...menu,
                layout: {
                  ...(menu.layout as RecordValue),
                  item: { ...menuItem, height: 'stretch', grow: 1, shrink: false },
                },
              }
            : node,
      ),
    };
  });
  if (migrated.size === 0) return input;
  const updatePlacements = (document: unknown): unknown => {
    if (!record(document) || !Array.isArray(document.components)) return document;
    return {
      ...document,
      components: document.components.map((node: unknown) => {
        if (
          !record(node) ||
          node.type !== 'WebReusableElement' ||
          !record(node.props) ||
          !migrated.has(node.props.reusableElementId) ||
          !record(node.bounds) ||
          node.bounds.height !== 640
        )
          return node;
        const sizing = item(node);
        if (!sizing || sizing.height !== 'fit-content' || !unconstrainedHeight(sizing)) return node;
        return {
          ...node,
          layout: { ...(node.layout as RecordValue), item: { ...sizing, height: 'stretch' } },
        };
      }),
    };
  };
  return {
    ...input,
    reusableElements: definitions.map(updatePlacements),
    ...(Array.isArray(input.pages) ? { pages: input.pages.map(updatePlacements) } : {}),
  };
}
