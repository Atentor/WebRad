/**
 * Browser-safe structural layout projection shared by the generated runtime
 * and any design-time projection. It intentionally accepts a structural
 * version of the Project Model instead of importing it, so the browser
 * runtime remains independently bundleable.
 */

export type RuntimeContainerLayoutMode = 'fixed' | 'align-to-parent' | 'row' | 'column';
export type RuntimeLayoutItemSizingMode = 'fixed' | 'stretch' | 'fit-content';
export type RuntimeLayoutAnchor = 'start' | 'center' | 'end' | 'stretch';
export type RuntimeLayoutJustifyContent =
  'start' | 'center' | 'end' | 'space-between' | 'space-around';
export type RuntimeLayoutAlignItems = 'start' | 'center' | 'end' | 'stretch';

export interface RuntimeContainerLayout {
  readonly mode: RuntimeContainerLayoutMode;
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
  readonly gap: number;
  readonly wrap: boolean;
  readonly justifyContent: RuntimeLayoutJustifyContent;
  readonly alignItems: RuntimeLayoutAlignItems;
}

export interface RuntimeLayoutItem {
  readonly width: RuntimeLayoutItemSizingMode;
  readonly height: RuntimeLayoutItemSizingMode;
  readonly minWidth: number;
  readonly maxWidth: number | null;
  readonly minHeight: number;
  readonly maxHeight: number | null;
  readonly grow: number;
  readonly shrink: boolean;
  readonly horizontalAnchor: RuntimeLayoutAnchor;
  readonly verticalAnchor: RuntimeLayoutAnchor;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface RuntimeComponentLayout {
  readonly container: RuntimeContainerLayout;
  readonly item: RuntimeLayoutItem;
}

export interface RuntimeLayoutBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The structural subset of a component node consumed by the layout runtime. */
export interface RuntimeLayoutNode {
  readonly type?: string;
  readonly bounds: RuntimeLayoutBounds;
  readonly children?: readonly string[];
  /** Optional only to preserve mounting of pre-responsive generated models. */
  readonly layout?: RuntimeComponentLayout;
}

export interface RuntimeLayoutProjection {
  /** CSS declarations for the component as a container for its direct children. */
  readonly container: Readonly<Record<string, string>>;
  /** CSS declarations for the component as an item in its parent container. */
  readonly item: Readonly<Record<string, string>>;
}

export interface ApplyRuntimeLayoutOptions {
  /** The root owns the viewport instead of taking its legacy bounds. */
  readonly isPageRoot?: boolean;
}

const DEFAULT_CONTAINER_LAYOUT: RuntimeContainerLayout = Object.freeze({
  mode: 'fixed',
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  gap: 0,
  wrap: false,
  justifyContent: 'start',
  alignItems: 'start',
});

const DEFAULT_LAYOUT_ITEM: RuntimeLayoutItem = Object.freeze({
  width: 'fixed',
  height: 'fixed',
  minWidth: 0,
  maxWidth: null,
  minHeight: 0,
  maxHeight: null,
  grow: 0,
  shrink: true,
  horizontalAnchor: 'start',
  verticalAnchor: 'start',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

const LAYOUT_PROPERTIES = [
  'align-self',
  'bottom',
  'display',
  'flex-basis',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'gap',
  'height',
  'justify-content',
  'left',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'position',
  'right',
  'top',
  'translate',
  'width',
] as const;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback: number): number {
  return Math.max(0, finite(value, fallback));
}

function pixels(value: unknown, fallback = 0): string {
  return `${String(nonNegative(value, fallback))}px`;
}

function coordinatePixels(value: unknown, fallback = 0): string {
  return `${String(finite(value, fallback))}px`;
}

function optionalPixels(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${String(value)}px`
    : undefined;
}

/** Resolves an absent legacy layout to the fixed-layout compatibility contract. */
export function resolveRuntimeContainerLayout(
  layout: RuntimeComponentLayout | undefined,
): RuntimeContainerLayout {
  return { ...DEFAULT_CONTAINER_LAYOUT, ...layout?.container };
}

function normalizeItem(layout: RuntimeComponentLayout | undefined): RuntimeLayoutItem {
  return { ...DEFAULT_LAYOUT_ITEM, ...layout?.item };
}

function flexAlignment(value: RuntimeLayoutAlignItems | RuntimeLayoutJustifyContent): string {
  switch (value) {
    case 'start':
      return 'flex-start';
    case 'end':
      return 'flex-end';
    default:
      return value;
  }
}

function hasContainerSemantics(
  node: RuntimeLayoutNode,
  container: RuntimeContainerLayout,
): boolean {
  return (
    node.type === 'WebPage' ||
    node.type === 'WebPanel' ||
    (node.children?.length ?? 0) > 0 ||
    container.mode !== 'fixed' ||
    container.paddingTop !== 0 ||
    container.paddingRight !== 0 ||
    container.paddingBottom !== 0 ||
    container.paddingLeft !== 0 ||
    container.gap !== 0
  );
}

function projectContainer(
  node: RuntimeLayoutNode,
  container: RuntimeContainerLayout,
): Readonly<Record<string, string>> {
  if (!hasContainerSemantics(node, container)) return {};

  const padding = {
    'padding-top': pixels(container.paddingTop),
    'padding-right': pixels(container.paddingRight),
    'padding-bottom': pixels(container.paddingBottom),
    'padding-left': pixels(container.paddingLeft),
  };

  switch (container.mode) {
    case 'row':
      return {
        position: 'relative',
        display: 'flex',
        'flex-direction': 'row',
        'flex-wrap': container.wrap ? 'wrap' : 'nowrap',
        'justify-content': flexAlignment(container.justifyContent),
        'align-items': flexAlignment(container.alignItems),
        gap: pixels(container.gap),
        ...padding,
      };
    case 'column':
      return {
        position: 'relative',
        display: 'flex',
        'flex-direction': 'column',
        'flex-wrap': container.wrap ? 'wrap' : 'nowrap',
        'justify-content': flexAlignment(container.justifyContent),
        'align-items': flexAlignment(container.alignItems),
        gap: pixels(container.gap),
        ...padding,
      };
    case 'align-to-parent':
      return { position: 'relative', ...padding };
    case 'fixed':
      // Fixed containers preserve their component's native paint styles. Padding
      // has no layout effect on their absolutely positioned children.
      return { position: 'relative' };
  }
}

function minMaxStyles(item: RuntimeLayoutItem): Readonly<Record<string, string>> {
  const maxWidth = optionalPixels(item.maxWidth);
  const maxHeight = optionalPixels(item.maxHeight);
  return {
    'min-width': pixels(item.minWidth),
    'min-height': pixels(item.minHeight),
    ...(maxWidth === undefined ? {} : { 'max-width': maxWidth }),
    ...(maxHeight === undefined ? {} : { 'max-height': maxHeight }),
  };
}

function fixedItemStyles(
  node: RuntimeLayoutNode,
  item: RuntimeLayoutItem,
): Readonly<Record<string, string>> {
  return {
    position: 'absolute',
    left: coordinatePixels(node.bounds.x),
    top: coordinatePixels(node.bounds.y),
    width: pixels(node.bounds.width),
    height: pixels(node.bounds.height),
    ...minMaxStyles(item),
  };
}

interface AxisProjection {
  readonly styles: Readonly<Record<string, string>>;
  readonly centeredFitContent: boolean;
}

function alignAxis(
  axis: 'horizontal' | 'vertical',
  size: RuntimeLayoutItemSizingMode,
  anchor: RuntimeLayoutAnchor,
  before: number,
  after: number,
  fixedSize: number,
): AxisProjection {
  const start = axis === 'horizontal' ? 'left' : 'top';
  const end = axis === 'horizontal' ? 'right' : 'bottom';
  const dimension = axis === 'horizontal' ? 'width' : 'height';
  const shouldStretch = size === 'stretch' || anchor === 'stretch';

  if (shouldStretch) {
    return {
      styles: { [start]: coordinatePixels(before), [end]: coordinatePixels(after) },
      centeredFitContent: false,
    };
  }

  const dimensionStyle =
    size === 'fixed' ? { [dimension]: pixels(fixedSize) } : { [dimension]: 'fit-content' };
  switch (anchor) {
    case 'end':
      return {
        styles: { [end]: coordinatePixels(after), ...dimensionStyle },
        centeredFitContent: false,
      };
    case 'center':
      if (size === 'fixed') {
        return {
          styles: {
            [start]: `calc(50% + ${coordinatePixels(before)} - ${pixels(fixedSize / 2)})`,
            ...dimensionStyle,
          },
          centeredFitContent: false,
        };
      }
      return {
        styles: { [start]: `calc(50% + ${coordinatePixels(before)})`, ...dimensionStyle },
        centeredFitContent: true,
      };
    case 'start':
      return {
        styles: { [start]: coordinatePixels(before), ...dimensionStyle },
        centeredFitContent: false,
      };
  }
}

function alignedItemStyles(
  node: RuntimeLayoutNode,
  item: RuntimeLayoutItem,
): Readonly<Record<string, string>> {
  const horizontal = alignAxis(
    'horizontal',
    item.width,
    item.horizontalAnchor,
    item.left,
    item.right,
    node.bounds.width,
  );
  const vertical = alignAxis(
    'vertical',
    item.height,
    item.verticalAnchor,
    item.top,
    item.bottom,
    node.bounds.height,
  );
  return {
    position: 'absolute',
    ...horizontal.styles,
    ...vertical.styles,
    ...(horizontal.centeredFitContent || vertical.centeredFitContent
      ? {
          translate: `${horizontal.centeredFitContent ? '-50%' : '0'} ${
            vertical.centeredFitContent ? '-50%' : '0'
          }`,
        }
      : {}),
    ...minMaxStyles(item),
  };
}

function flowItemStyles(
  node: RuntimeLayoutNode,
  parentMode: 'row' | 'column',
  item: RuntimeLayoutItem,
): Readonly<Record<string, string>> {
  const isRow = parentMode === 'row';
  const mainSize = isRow ? item.width : item.height;
  const crossSize = isRow ? item.height : item.width;
  const mainDimension = isRow ? 'width' : 'height';
  const crossDimension = isRow ? 'height' : 'width';
  const mainBounds = isRow ? node.bounds.width : node.bounds.height;
  const crossBounds = isRow ? node.bounds.height : node.bounds.width;
  const mainGrow =
    mainSize === 'stretch' ? Math.max(1, nonNegative(item.grow, 0)) : nonNegative(item.grow, 0);

  const mainStyles: Readonly<Record<string, string>> =
    mainSize === 'fixed'
      ? { [mainDimension]: pixels(mainBounds), 'flex-basis': pixels(mainBounds) }
      : mainSize === 'stretch'
        ? { [mainDimension]: 'auto', 'flex-basis': '0px' }
        : { [mainDimension]: 'fit-content', 'flex-basis': 'fit-content' };
  const crossStyles: Readonly<Record<string, string>> =
    crossSize === 'fixed'
      ? { [crossDimension]: pixels(crossBounds) }
      : crossSize === 'stretch'
        ? { [crossDimension]: 'auto', 'align-self': 'stretch' }
        : { [crossDimension]: 'fit-content' };

  return {
    position: 'relative',
    'flex-grow': String(mainGrow),
    'flex-shrink': item.shrink ? '1' : '0',
    ...mainStyles,
    ...crossStyles,
    ...minMaxStyles(item),
  };
}

function projectItem(
  node: RuntimeLayoutNode,
  parent: RuntimeContainerLayout | undefined,
): Readonly<Record<string, string>> {
  const item = normalizeItem(node.layout);
  const mode = parent?.mode ?? 'fixed';
  switch (mode) {
    case 'align-to-parent':
      return alignedItemStyles(node, item);
    case 'row':
    case 'column':
      return flowItemStyles(node, mode, item);
    case 'fixed':
      return fixedItemStyles(node, item);
  }
}

/**
 * Converts persisted layout rules to browser CSS. The result is pure and can
 * also be used by a design-time renderer to mirror generated-runtime layout.
 */
export function projectRuntimeLayout(
  node: RuntimeLayoutNode,
  parentContainer?: RuntimeContainerLayout,
): RuntimeLayoutProjection {
  const container = resolveRuntimeContainerLayout(node.layout);
  return {
    container: projectContainer(node, container),
    item: projectItem(node, parentContainer),
  };
}

function setImportantStyles(element: HTMLElement, styles: Readonly<Record<string, string>>): void {
  for (const property of LAYOUT_PROPERTIES) element.style.removeProperty(property);
  const display = styles.display;
  if (display === undefined) delete element.dataset.webradLayoutDisplay;
  else element.dataset.webradLayoutDisplay = display;
  for (const [property, value] of Object.entries(styles)) {
    // `hidden` is part of the public component API. Keep the structural
    // display value in data for show(), but never let it reveal a hidden node.
    if (property === 'display' && element.hidden) continue;
    element.style.setProperty(property, value, 'important');
  }
  if (element.hidden) element.style.setProperty('display', 'none', 'important');
}

/**
 * Applies structural layout declarations with inline `!important` precedence.
 * Reusable visual styles are intentionally unable to move or resize an
 * instance; the Project Model's instance layout remains authoritative.
 */
export function applyRuntimeLayout(
  element: HTMLElement,
  node: RuntimeLayoutNode,
  parentContainer?: RuntimeContainerLayout,
  options: ApplyRuntimeLayoutOptions = {},
): RuntimeLayoutProjection {
  const projection = projectRuntimeLayout(node, parentContainer);
  const rootStyles = options.isPageRoot
    ? {
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        'min-height': '100dvh',
      }
    : projection.item;
  setImportantStyles(element, { ...projection.container, ...rootStyles });
  return projection;
}
