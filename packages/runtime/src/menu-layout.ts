import type { RuntimeLayoutNode } from './layout.js';
import type { WebMenuConfiguration } from './menu-model.js';

type MenuLayoutConfiguration = Pick<
  WebMenuConfiguration,
  'orientation' | 'collapsed' | 'mobileBreakpoint' | 'appearance'
>;

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}
/** Snapshot inline margins before creating immutable runtime layout projections. */
export function readWebMenuMargins(
  element: HTMLElement,
): Partial<Record<'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft', number>> {
  const margins: Partial<
    Record<'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft', number>
  > = {};
  for (const name of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const) {
    const value = Number.parseFloat(element.style[name]);
    if (Number.isFinite(value)) margins[name] = value;
  }
  return margins;
}

/** Transient footprint; saved dimensions and responsive rules remain unchanged. */
export function projectWebMenuLayout<T extends RuntimeLayoutNode>(
  node: T,
  viewportWidth: number,
  configuration?: MenuLayoutConfiguration,
  embedded = node.menuEmbedded === true,
  viewportHeight = Number.POSITIVE_INFINITY,
): T {
  if (!node.layout) return node;
  const config = configuration ?? record(node.props?.configuration);
  const mobile = viewportWidth < 768;
  const vertical = config.orientation !== 'horizontal';
  const collapsed = vertical && !mobile && config.collapsed === true;
  const appearance = record(config.appearance);
  const collapsedWidth =
    typeof appearance.collapsedWidth === 'number' ? appearance.collapsedWidth : 72;
  const preferredHeight =
    node.bounds.height === 640 && node.layout.item.height !== 'fixed' ? 80 : node.bounds.height;
  const savedMargin = node.props?.margin;
  const margin = embedded
    ? 0
    : typeof savedMargin === 'number' && Number.isFinite(savedMargin)
      ? savedMargin
      : 0;
  const sideMargin = (name: string): number => {
    const value = node.props?.[name];
    return embedded ? 0 : typeof value === 'number' && Number.isFinite(value) ? value : margin;
  };
  const marginTop = sideMargin('marginTop'),
    marginRight = sideMargin('marginRight'),
    marginBottom = sideMargin('marginBottom'),
    marginLeft = sideMargin('marginLeft');
  const availableWidth = Math.max(0, viewportWidth - marginLeft - marginRight);
  const availableHeight = Math.max(0, viewportHeight - marginTop - marginBottom);
  return {
    ...node,
    bounds: {
      ...node.bounds,
      x: 0,
      y: 0,
      width: collapsed ? collapsedWidth : node.bounds.width,
      height: mobile ? 48 : vertical ? node.bounds.height : preferredHeight,
    },
    props: {
      ...node.props,
      placement: embedded ? 'in-flow' : 'floating',
      floatingHorizontalAnchor:
        node.props?.floatingHorizontalAnchor === 'right' ||
        node.props?.floatingHorizontalAnchor === 'center'
          ? node.props.floatingHorizontalAnchor
          : 'left',
      floatingVerticalAnchor:
        node.props?.floatingVerticalAnchor === 'bottom' ||
        node.props?.floatingVerticalAnchor === 'center'
          ? node.props.floatingVerticalAnchor
          : 'top',
      margin: margin,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
      floatingZIndex: 1000,
    },
    layout: {
      ...node.layout,
      item: {
        ...node.layout.item,
        width: embedded ? 'stretch' : vertical && !mobile ? 'fixed' : 'stretch',
        height: mobile ? 'fixed' : embedded ? 'stretch' : vertical ? 'stretch' : 'fixed',
        minWidth: collapsed ? 0 : Math.min(node.layout.item.minWidth ?? 0, availableWidth),
        maxWidth: Number.isFinite(availableWidth)
          ? Math.min(
              collapsed ? availableWidth : (node.layout.item.maxWidth ?? availableWidth),
              availableWidth,
            )
          : collapsed
            ? null
            : node.layout.item.maxWidth,
        minHeight: mobile ? 0 : Math.min(node.layout.item.minHeight ?? 0, availableHeight),
        maxHeight: Number.isFinite(availableHeight)
          ? Math.min(
              mobile ? availableHeight : (node.layout.item.maxHeight ?? availableHeight),
              availableHeight,
            )
          : mobile
            ? null
            : node.layout.item.maxHeight,
        grow: embedded && !mobile ? 1 : 0,
        shrink: false,
        horizontalAnchor: 'start',
        verticalAnchor: 'start',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
    },
  };
}

export interface RuntimeReusableMenuDefinition {
  readonly rootComponentId: string;
  readonly components: readonly (RuntimeLayoutNode & { readonly id: string })[];
}
/** A full-height sidebar becomes an intrinsic trigger rather than an invisible full-height hit area on mobile. */
export function projectReusableMenuLayout<T extends RuntimeLayoutNode>(
  placement: T,
  definition: RuntimeReusableMenuDefinition | undefined,
  viewportWidth: number,
  configuration?: MenuLayoutConfiguration,
  viewportHeight = Number.POSITIVE_INFINITY,
): T {
  const menu = reusableMenuNode(definition);
  if (!menu) return placement;
  return projectWebMenuLayout(
    placement,
    viewportWidth,
    configuration ?? (record(menu.props?.configuration) as unknown as MenuLayoutConfiguration),
    false,
    viewportHeight,
  );
}

export function reusableMenuNode(
  definition: RuntimeReusableMenuDefinition | undefined,
): (RuntimeLayoutNode & { readonly id: string }) | undefined {
  if (!definition || !Array.isArray(definition.components)) return undefined;
  const root = definition.components.find(
    (node) => node !== null && typeof node === 'object' && node.id === definition.rootComponentId,
  );
  if (root?.type !== 'WebPanel' || !Array.isArray(root.children) || root.children.length !== 1)
    return undefined;
  const menu = definition.components.find(
    (node) => node !== null && typeof node === 'object' && node.id === root.children?.[0],
  );
  return menu?.type === 'WebMenu' ? menu : undefined;
}
