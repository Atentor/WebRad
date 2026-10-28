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
export type RuntimeLayoutAlignSelf = 'auto' | RuntimeLayoutAlignItems;

export const WEB_ASPECT_RATIOS = ['none', '1:1', '4:3', '3:4', '16:9', '9:16'] as const;
export type WebAspectRatio = (typeof WEB_ASPECT_RATIOS)[number];

export function normalizeWebAspectRatio(value: unknown): WebAspectRatio {
  return WEB_ASPECT_RATIOS.find((ratio) => ratio === value) ?? 'none';
}

function aspectRatioNumber(ratio: Exclude<WebAspectRatio, 'none'>): number {
  const [width = 1, height = 1] = ratio.split(':').map(Number);
  return width / height;
}

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
  readonly alignSelf?: RuntimeLayoutAlignSelf;
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
  readonly props?: Readonly<Record<string, unknown>>;
  /** Optional only to preserve mounting of pre-responsive generated models. */
  readonly layout?: RuntimeComponentLayout;
  readonly reusableInstanceId?: string;
  readonly menuEmbedded?: boolean;
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
  /** A reusable definition root fills its placement instance. */
  readonly isReusableRoot?: boolean;
  /** Fit axes of the placement that owns a reusable definition root. */
  readonly reusableRootFitContent?: {
    readonly width: boolean;
    readonly height: boolean;
    /** An explicit placement maximum takes precedence over an intrinsic floor. */
    readonly hasMaxWidth: boolean;
    /** An explicit placement maximum takes precedence over an intrinsic floor. */
    readonly hasMaxHeight: boolean;
  };
}

/** The measured dimensions needed for one or both fit-content axes. */
export interface RuntimeFitContentSize {
  readonly width?: number;
  readonly height?: number;
}

/**
 * Describes the coordinate space used by DOM measurements. The browser runtime
 * uses CSS pixels; design tools can provide their visual zoom factor when the
 * measured subtree is transformed.
 */
export interface RuntimeFitContentMeasurementOptions {
  readonly scale?: number;
  /** Filters direct DOM children that participate in the parent's layout. */
  readonly isLayoutChild?: (child: HTMLElement) => boolean;
}

/** Releases browser observers used to keep a fit-content container in sync. */
export interface RuntimeFitContentBinding {
  /** Recomputes the container immediately after application code changes its content. */
  refresh(): void;
  /** Stops all observers associated with this layout projection. */
  dispose(): void;
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
  alignSelf: 'auto',
  horizontalAnchor: 'start',
  verticalAnchor: 'start',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
});

const LAYOUT_PROPERTIES = [
  'aspect-ratio',
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
  'z-index',
] as const;

// CSS `fit-content` is allowed to resolve against the available space, which
// can compress a nested control before its container gets a chance to grow.
// `max-content` keeps the intrinsic, Bubble-like "grow around the children"
// behavior; explicit min/max constraints still apply below.
const INTRINSIC_CONTENT_SIZE = 'max-content';

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
    node.type === 'WebGroup' ||
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

function axisMinMaxStyles(
  axis: 'horizontal' | 'vertical',
  minimum: number,
  maximum: number | null,
): Readonly<Record<string, string>> {
  const minProperty = axis === 'horizontal' ? 'min-width' : 'min-height';
  const maxProperty = axis === 'horizontal' ? 'max-width' : 'max-height';
  const max = optionalPixels(maximum);
  return {
    [minProperty]: pixels(minimum),
    ...(max === undefined ? {} : { [maxProperty]: max }),
  };
}

/**
 * Projects one axis inside a fixed container. Fixed is kept as the legacy
 * geometry fallback, while stretch and fit-content remain meaningful for a
 * responsive instance without requiring its parent to become a flex layout.
 */
function fixedAxisStyles(
  axis: 'horizontal' | 'vertical',
  sizing: RuntimeLayoutItemSizingMode,
  leadingOffset: number,
  trailingInset: number,
  fixedSize: number,
): Readonly<Record<string, string>> {
  const start = axis === 'horizontal' ? 'left' : 'top';
  const end = axis === 'horizontal' ? 'right' : 'bottom';
  const dimension = axis === 'horizontal' ? 'width' : 'height';

  switch (sizing) {
    case 'stretch':
      return {
        [start]: coordinatePixels(leadingOffset),
        [end]: coordinatePixels(trailingInset),
      };
    case 'fit-content':
      return {
        [start]: coordinatePixels(leadingOffset),
        [dimension]: INTRINSIC_CONTENT_SIZE,
      };
    case 'fixed':
      return {
        [start]: coordinatePixels(leadingOffset),
        [dimension]: pixels(fixedSize),
      };
  }
}

function fixedItemStyles(
  node: RuntimeLayoutNode,
  item: RuntimeLayoutItem,
): Readonly<Record<string, string>> {
  return {
    position: 'absolute',
    ...fixedAxisStyles('horizontal', item.width, node.bounds.x, item.right, node.bounds.width),
    ...fixedAxisStyles('vertical', item.height, node.bounds.y, item.bottom, node.bounds.height),
    ...minMaxStyles(item),
  };
}

function floatingAnchor(
  value: unknown,
  fallback: 'left' | 'center' | 'right',
): 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right' ? value : fallback;
}

function floatingVerticalAnchor(
  value: unknown,
  fallback: 'top' | 'center' | 'bottom',
): 'top' | 'center' | 'bottom' {
  return value === 'top' || value === 'center' || value === 'bottom' ? value : fallback;
}

export function isFloatingLayoutNode(node: RuntimeLayoutNode): boolean {
  return node.type === 'WebMenu'
    ? node.menuEmbedded !== true && node.props?.placement !== 'in-flow'
    : (node.type === 'WebReusableElement' || node.type === 'WebPanel') &&
        node.props?.placement === 'floating';
}

export type WebPanelFloatingAlignment = 'none' | 'top' | 'bottom' | 'left' | 'right' | 'client';

export function getFloatingPanelAlignment(
  node: Pick<RuntimeLayoutNode, 'type' | 'props'>,
): WebPanelFloatingAlignment {
  if (node.type !== 'WebPanel') return 'none';
  const value = node.props?.floatingAlignment;
  return value === 'top' ||
    value === 'bottom' ||
    value === 'left' ||
    value === 'right' ||
    value === 'client'
    ? value
    : 'none';
}

interface FloatingPanelAxis {
  readonly anchor: 'start' | 'center' | 'end';
  readonly sizing: RuntimeLayoutItemSizingMode;
  readonly before: number;
  readonly after: number;
  readonly marginBefore: number;
  readonly marginAfter: number;
  readonly centerOffset: number;
  readonly fixedSize: number;
  readonly minimum: number;
  readonly maximum: number | null;
}

function floatingPanelAxis(node: RuntimeLayoutNode, horizontal: boolean): FloatingPanelAxis {
  const item = normalizeItem(node.layout);
  const alignment = getFloatingPanelAlignment(node);
  const freeAnchor = horizontal
    ? floatingAnchor(node.props?.floatingHorizontalAnchor, 'left')
    : floatingVerticalAnchor(node.props?.floatingVerticalAnchor, 'top');
  const edge = horizontal
    ? alignment === 'left' || alignment === 'right'
      ? alignment
      : undefined
    : alignment === 'top' || alignment === 'bottom'
      ? alignment
      : undefined;
  const anchor = edge ?? (alignment === 'client' ? (horizontal ? 'left' : 'top') : freeAnchor);
  const atEnd = anchor === 'right' || anchor === 'bottom';
  const before = horizontal ? item.left : item.top;
  const after = horizontal ? item.right : item.bottom;
  const offset = horizontal ? node.bounds.x : node.bounds.y;
  const margin = finite(node.props?.margin, 0);
  return {
    anchor: anchor === 'center' ? 'center' : atEnd ? 'end' : 'start',
    sizing: horizontal ? item.width : item.height,
    before: alignment === 'none' && anchor !== 'center' && !atEnd ? offset : before,
    after: alignment === 'none' && atEnd ? offset : after,
    centerOffset: alignment === 'none' && anchor === 'center' ? offset : 0,
    marginBefore: finite(node.props?.[horizontal ? 'marginLeft' : 'marginTop'], margin),
    marginAfter: finite(node.props?.[horizontal ? 'marginRight' : 'marginBottom'], margin),
    fixedSize: horizontal ? node.bounds.width : node.bounds.height,
    minimum: horizontal ? item.minWidth : item.minHeight,
    maximum: horizontal ? item.maxWidth : item.maxHeight,
  };
}

function floatingPanelAxisStyles(
  axis: FloatingPanelAxis,
  horizontal: boolean,
): Readonly<Record<string, string>> {
  const start = horizontal ? 'left' : 'top';
  const end = horizontal ? 'right' : 'bottom';
  const dimension = horizontal ? 'width' : 'height';
  const insets = axis.before + axis.after + axis.marginBefore + axis.marginAfter;
  const size =
    axis.sizing === 'fixed'
      ? pixels(axis.fixedSize)
      : axis.sizing === 'fit-content'
        ? INTRINSIC_CONTENT_SIZE
        : `max(0px, calc(100% - ${coordinatePixels(insets)}))`;
  return {
    [dimension]: size,
    ...(axis.anchor === 'end'
      ? { [end]: coordinatePixels(axis.after) }
      : axis.anchor === 'center'
        ? {
            [start]: `calc(50% + ${coordinatePixels(axis.centerOffset + (axis.before - axis.after - axis.marginBefore - axis.marginAfter) / 2)})`,
          }
        : { [start]: coordinatePixels(axis.before) }),
  };
}

function floatingPanelAxisBounds(
  axis: FloatingPanelAxis,
  available: number,
): { position: number; size: number } {
  const remaining = Math.max(
    0,
    available - axis.before - axis.after - axis.marginBefore - axis.marginAfter,
  );
  const size = Math.max(
    axis.minimum,
    Math.min(axis.sizing === 'stretch' ? remaining : axis.fixedSize, axis.maximum ?? Infinity),
  );
  const position =
    axis.anchor === 'end'
      ? available - axis.after - axis.marginAfter - size
      : axis.anchor === 'center'
        ? (available + axis.before - axis.after + axis.marginBefore - axis.marginAfter - size) / 2 +
          axis.centerOffset
        : axis.before + axis.marginBefore;
  return { position, size };
}

/** Fallback geometry; callers can supply measured fit-content dimensions in bounds. */
export function projectFloatingPanelBounds(
  node: RuntimeLayoutNode,
  pageSize: Pick<RuntimeLayoutBounds, 'width' | 'height'>,
): RuntimeLayoutBounds | undefined {
  if (!isFloatingLayoutNode(node)) return undefined;
  const horizontal = floatingPanelAxisBounds(floatingPanelAxis(node, true), pageSize.width);
  const ratio = normalizeWebAspectRatio(node.props?.aspectRatio);
  const verticalAxis = floatingPanelAxis(node, false);
  const vertical = floatingPanelAxisBounds(
    ratio === 'none'
      ? verticalAxis
      : {
          ...verticalAxis,
          sizing: 'fixed',
          fixedSize: horizontal.size / aspectRatioNumber(ratio),
          minimum: 0,
          maximum: null,
        },
    pageSize.height,
  );
  return {
    x: horizontal.position,
    y: vertical.position,
    width: horizontal.size,
    height: vertical.size,
  };
}

/**
 * Floating Panels belong to the scrollable page; reusable placements belong
 * to the viewport. Bounds preserve saved dimensions and anchor offsets.
 */
function floatingItemStyles(
  node: RuntimeLayoutNode,
  item: RuntimeLayoutItem,
): Readonly<Record<string, string>> {
  const horizontalAxis = floatingPanelAxis(node, true);
  const verticalAxis = floatingPanelAxis(node, false);
  return {
    position: node.type === 'WebPanel' ? 'absolute' : 'fixed',
    ...floatingPanelAxisStyles(horizontalAxis, true),
    ...floatingPanelAxisStyles(verticalAxis, false),
    ...(horizontalAxis.anchor === 'center' || verticalAxis.anchor === 'center'
      ? {
          translate: `${horizontalAxis.anchor === 'center' ? '-50%' : '0'} ${verticalAxis.anchor === 'center' ? '-50%' : '0'}`,
        }
      : {}),
    ...minMaxStyles(item),
    'z-index': String(Math.trunc(finite(node.props?.floatingZIndex, 100))),
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
    size === 'fixed' ? { [dimension]: pixels(fixedSize) } : { [dimension]: INTRINSIC_CONTENT_SIZE };
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
        : { [mainDimension]: INTRINSIC_CONTENT_SIZE, 'flex-basis': INTRINSIC_CONTENT_SIZE };
  const crossStyles: Readonly<Record<string, string>> =
    crossSize === 'fixed'
      ? { [crossDimension]: pixels(crossBounds) }
      : crossSize === 'stretch'
        ? { [crossDimension]: 'auto', 'align-self': 'stretch' }
        : { [crossDimension]: INTRINSIC_CONTENT_SIZE };

  return {
    position: 'relative',
    'flex-grow': String(mainGrow),
    // A fit-content item owns its intrinsic size. It must not yield that
    // space to its parent, otherwise inner controls are squeezed instead of
    // the container expanding around them.
    'flex-shrink': mainSize === 'fit-content' || !item.shrink ? '0' : '1',
    ...mainStyles,
    ...crossStyles,
    ...(item.alignSelf !== undefined && item.alignSelf !== 'auto'
      ? { 'align-self': flexAlignment(item.alignSelf) }
      : {}),
    ...minMaxStyles(item),
  };
}

function projectItem(
  node: RuntimeLayoutNode,
  parent: RuntimeContainerLayout | undefined,
): Readonly<Record<string, string>> {
  const item = normalizeItem(node.layout);
  if (isFloatingLayoutNode(node)) return floatingItemStyles(node, item);
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
    item: projectAspectRatio(node, parentContainer, projectItem(node, parentContainer)),
  };
}

function projectAspectRatio(
  node: RuntimeLayoutNode,
  parent: RuntimeContainerLayout | undefined,
  styles: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const ratio = normalizeWebAspectRatio(node.props?.aspectRatio);
  if (ratio === 'none') return styles;
  const item = normalizeItem(node.layout);
  const mode = parent?.mode ?? 'fixed';
  const floating = isFloatingLayoutNode(node);
  const floatingAxis = floating ? floatingPanelAxis(node, false) : undefined;
  const flow = !floating && (mode === 'row' || mode === 'column');
  const end = floatingAxis
    ? floatingAxis.anchor === 'end'
    : mode === 'align-to-parent' && item.verticalAnchor === 'end' && item.height !== 'stretch';
  const center = floatingAxis
    ? floatingAxis.anchor === 'center'
    : mode === 'align-to-parent' && item.verticalAnchor === 'center' && item.height !== 'stretch';
  const stretchedRow =
    flow &&
    mode === 'row' &&
    (styles['align-self'] === 'stretch' ||
      (styles['align-self'] === undefined && parent?.alignItems === 'stretch'));
  return {
    ...styles,
    'aspect-ratio': ratio.replace(':', ' / '),
    height: 'auto',
    'min-height': '0px',
    'max-height': 'none',
    ...(flow
      ? {}
      : {
          bottom: end ? (styles.bottom ?? pixels(item.bottom)) : 'auto',
          ...(end ? { top: 'auto' } : {}),
        }),
    ...(center
      ? {
          top: floatingAxis
            ? (styles.top ?? '50%')
            : `calc(50% + ${coordinatePixels(item.top)})`,
          translate: `${styles.translate?.split(' ')[0] ?? '0'} -50%`,
        }
      : {}),
    ...(flow && mode === 'column'
      ? { 'flex-basis': 'auto', 'flex-grow': '0', 'flex-shrink': '0' }
      : {}),
    ...(stretchedRow ? { 'align-self': 'flex-start' } : {}),
  };
}

interface RuntimeLayoutBinding {
  readonly node: RuntimeLayoutNode;
  readonly parent?: RuntimeContainerLayout;
  readonly options: ApplyRuntimeLayoutOptions;
}
const layoutBindings = new WeakMap<HTMLElement, RuntimeLayoutBinding>();

/** Per-instance state projects through the same layout as the saved model. */
export type RuntimeLayoutNodeProjector = (node: RuntimeLayoutNode) => RuntimeLayoutNode;
const layoutProjectors = new WeakMap<HTMLElement, RuntimeLayoutNodeProjector>();
export function setRuntimeLayoutProjection(
  element: HTMLElement,
  projector: RuntimeLayoutNodeProjector | null,
): boolean {
  const previous = layoutProjectors.get(element);
  if (projector === null) layoutProjectors.delete(element);
  else layoutProjectors.set(element, projector);
  const binding = layoutBindings.get(element);
  if (!binding) return false;
  if (binding.options.isPageRoot || binding.options.isReusableRoot) {
    applyRuntimeLayout(element, binding.node, binding.parent, binding.options);
    return true;
  }
  const styles = (
    project: RuntimeLayoutNodeProjector | undefined,
  ): Readonly<Record<string, string>> => {
    let node = project?.(binding.node) ?? binding.node;
    const ratio = aspectRatioOverrides.get(element);
    if (ratio !== undefined) node = { ...node, props: { ...node.props, aspectRatio: ratio } };
    const layout = projectRuntimeLayout(node, binding.parent);
    return { ...layout.container, ...layout.item };
  };
  const before = styles(previous);
  const after = styles(projector ?? undefined);
  // Content updates must not reset instance-owned position or other dimensions.
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[name] === after[name]) continue;
    const value = after[name];
    if (value === undefined) element.style.removeProperty(name);
    else if (name === 'display' && element.hidden)
      element.style.setProperty(name, 'none', 'important');
    else element.style.setProperty(name, value, 'important');
  }
  return true;
}

const aspectRatioOverrides = new WeakMap<HTMLElement, WebAspectRatio>();
const standaloneRatioStyles = new WeakMap<HTMLElement, readonly [string, string, string][]>();

export function getRuntimeLayoutAspectRatio(element: HTMLElement): WebAspectRatio {
  return (
    aspectRatioOverrides.get(element) ??
    normalizeWebAspectRatio(layoutBindings.get(element)?.node.props?.aspectRatio)
  );
}

/** Updates the same structural projection used by the Designer without changing saved rules. */
export function setRuntimeLayoutAspectRatio(
  element: HTMLElement,
  ratio: WebAspectRatio,
): void {
  if (!WEB_ASPECT_RATIOS.includes(ratio)) throw new TypeError('Invalid aspectRatio.');
  const previousRatio = aspectRatioOverrides.get(element);
  aspectRatioOverrides.set(element, ratio);
  const binding = layoutBindings.get(element);
  if (binding !== undefined) {
    const projectRatio = (value: WebAspectRatio | undefined) =>
      projectRuntimeLayout(
        layoutProjectors.get(element)?.(
          value === undefined
            ? binding.node
            : { ...binding.node, props: { ...binding.node.props, aspectRatio: value } },
        ) ??
          (value === undefined
            ? binding.node
            : { ...binding.node, props: { ...binding.node.props, aspectRatio: value } }),
        binding.parent,
      ).item;
    const before = projectRatio(previousRatio);
    const after = projectRatio(ratio);
    // Only update declarations affected by the ratio. Application changes to
    // width, position or unrelated layout properties remain instance-owned.
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[name] === after[name]) continue;
      const value = after[name];
      if (value === undefined) element.style.removeProperty(name);
      else element.style.setProperty(name, value, 'important');
    }
    return;
  }
  // A directly constructed component can precede mounting. Preserve its original
  // dimensions until the model-owned layout becomes available.
  if (!standaloneRatioStyles.has(element)) {
    standaloneRatioStyles.set(
      element,
      ['height', 'aspect-ratio', 'min-height', 'max-height'].map((name) => [
        name,
        element.style.getPropertyValue(name),
        element.style.getPropertyPriority(name),
      ]),
    );
  }
  if (ratio === 'none') {
    for (const [name, value, priority] of standaloneRatioStyles.get(element)!)
      element.style.setProperty(name, value, priority);
    standaloneRatioStyles.delete(element);
  } else {
    element.style.setProperty('height', 'auto', 'important');
    element.style.setProperty('aspect-ratio', ratio.replace(':', ' / '), 'important');
    element.style.setProperty('min-height', '0px', 'important');
    element.style.setProperty('max-height', 'none', 'important');
  }
}

function parsedCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function renderedBorderPixels(style: string, width: string): number {
  return style.length === 0 || style === 'none' || style === 'hidden' ? 0 : parsedCssPixels(width);
}

interface AxisBoxInsets {
  readonly leading: number;
  readonly trailing: number;
}

function boxInsets(element: HTMLElement, axis: 'horizontal' | 'vertical'): AxisBoxInsets {
  const view = element.ownerDocument.defaultView;
  if (view === null) return { leading: 0, trailing: 0 };
  const computed = view.getComputedStyle(element);
  return axis === 'horizontal'
    ? {
        leading:
          parsedCssPixels(computed.paddingLeft) +
          renderedBorderPixels(computed.borderLeftStyle, computed.borderLeftWidth),
        trailing:
          parsedCssPixels(computed.paddingRight) +
          renderedBorderPixels(computed.borderRightStyle, computed.borderRightWidth),
      }
    : {
        leading:
          parsedCssPixels(computed.paddingTop) +
          renderedBorderPixels(computed.borderTopStyle, computed.borderTopWidth),
        trailing:
          parsedCssPixels(computed.paddingBottom) +
          renderedBorderPixels(computed.borderBottomStyle, computed.borderBottomWidth),
      };
}

function boxInsetsToTarget(
  target: HTMLElement,
  contentHost: HTMLElement,
  axis: 'horizontal' | 'vertical',
): AxisBoxInsets {
  let current: HTMLElement | null = contentHost;
  let leading = 0;
  let trailing = 0;
  while (current !== null) {
    const inset = boxInsets(current, axis);
    leading += inset.leading;
    trailing += inset.trailing;
    if (current === target) return { leading, trailing };
    current = current.parentElement;
  }
  // A custom component host can be rendered outside the target subtree. Its
  // own box inset is still meaningful, but do not invent a relation to a
  // target that cannot be proven from the DOM.
  return boxInsets(contentHost, axis);
}

function directElementChildren(element: HTMLElement): readonly HTMLElement[] {
  return Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

function measurementScale(options: RuntimeFitContentMeasurementOptions | undefined): number {
  const scale = finite(options?.scale, 1);
  return scale > 0 ? scale : 1;
}

function contentExtent(
  target: HTMLElement,
  contentHost: HTMLElement,
  axis: 'horizontal' | 'vertical',
  scale: number,
  isLayoutChild: ((child: HTMLElement) => boolean) | undefined,
): number | undefined {
  const targetRect = target.getBoundingClientRect();
  const targetStart = axis === 'horizontal' ? targetRect.left : targetRect.top;
  if (!Number.isFinite(targetStart)) return undefined;

  let nearestEdge = Number.POSITIVE_INFINITY;
  let farthestEdge = Number.NEGATIVE_INFINITY;
  for (const child of directElementChildren(contentHost)) {
    if (isLayoutChild !== undefined && !isLayoutChild(child)) continue;
    const rect = child.getBoundingClientRect();
    const length = axis === 'horizontal' ? rect.width : rect.height;
    const otherLength = axis === 'horizontal' ? rect.height : rect.width;
    // `display: none` descendants produce an all-zero rectangle and must not
    // reserve space. A zero-width divider can still contribute its x offset,
    // so retain elements that have a size on either axis.
    if (length === 0 && otherLength === 0) continue;
    const computed = child.ownerDocument.defaultView?.getComputedStyle(child);
    const leadingMargin = finite(
      Number.parseFloat((axis === 'horizontal' ? computed?.marginLeft : computed?.marginTop) ?? ''),
      0,
    );
    const trailingMargin = finite(
      Number.parseFloat(
        (axis === 'horizontal' ? computed?.marginRight : computed?.marginBottom) ?? '',
      ),
      0,
    );
    const start = (axis === 'horizontal' ? rect.left : rect.top) - leadingMargin * scale;
    const edge = (axis === 'horizontal' ? rect.right : rect.bottom) + trailingMargin * scale;
    if (Number.isFinite(start)) nearestEdge = Math.min(nearestEdge, start);
    if (Number.isFinite(edge)) farthestEdge = Math.max(farthestEdge, edge);
  }
  // An empty (or fully hidden) container has no child extent of its own. Its
  // own box chrome still needs space, so return the accumulated padding and
  // borders rather than falling back to stale design-time bounds.
  const insets = boxInsetsToTarget(target, contentHost, axis);
  if (!Number.isFinite(farthestEdge)) return insets.leading + insets.trailing;
  const envelopeStart = Math.min(targetStart, nearestEdge);
  return (
    Math.max(0, (farthestEdge - envelopeStart) / scale) +
    (nearestEdge < targetStart ? insets.leading : 0) +
    insets.trailing
  );
}

function constrainFitContentSize(value: number, minimum: number, maximum: number | null): number {
  const min = nonNegative(minimum, 0);
  const max =
    maximum === null ? Number.POSITIVE_INFINITY : Math.max(min, nonNegative(maximum, min));
  return Math.ceil(Math.min(max, Math.max(min, value)));
}

/**
 * Measures the direct rendered children of a container for its fit-content
 * axes. This is deliberately DOM-only: the Project Model remains unchanged,
 * while dynamic text, visibility and nested content can still grow the
 * browser projection after it has mounted.
 */
export function measureRuntimeFitContentSize(
  target: HTMLElement,
  contentHost: HTMLElement,
  layout: RuntimeComponentLayout | undefined,
  options?: RuntimeFitContentMeasurementOptions,
): RuntimeFitContentSize {
  // A closed dialog (or any display:none ancestor) has no measurable layout.
  // Writing its zero child envelope back as an explicit size traps nested flex
  // controls at their minimum widths when the popup subsequently opens.
  // Preserve the intrinsic/last measured dimensions until it can be measured.
  const view = target.ownerDocument.defaultView;
  for (
    let ancestor: HTMLElement | null = target;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    if (view?.getComputedStyle(ancestor).display === 'none') return {};
  }
  const item = normalizeItem(layout);
  const scale = measurementScale(options);
  const inlineRatio = target.style.getPropertyValue('aspect-ratio');
  const fixedRatio =
    getRuntimeLayoutAspectRatio(target) !== 'none' ||
    (inlineRatio !== '' && inlineRatio !== 'auto');
  const width =
    item.width === 'fit-content'
      ? contentExtent(target, contentHost, 'horizontal', scale, options?.isLayoutChild)
      : undefined;
  const height =
    item.height === 'fit-content' && !fixedRatio
      ? contentExtent(target, contentHost, 'vertical', scale, options?.isLayoutChild)
      : undefined;
  return {
    ...(width === undefined
      ? {}
      : { width: constrainFitContentSize(width, item.minWidth, item.maxWidth) }),
    ...(height === undefined
      ? {}
      : { height: constrainFitContentSize(height, item.minHeight, item.maxHeight) }),
  };
}

function setFitContentDimension(
  element: HTMLElement,
  dimension: 'width' | 'height',
  value: number | undefined,
): void {
  if (value === undefined) return;
  const next = `${String(value)}px`;
  if (
    element.style.getPropertyValue(dimension) === next &&
    element.style.getPropertyPriority(dimension) === 'important'
  ) {
    return;
  }
  element.style.setProperty(dimension, next, 'important');
}

/**
 * Keeps a mounted fit-content container sized to its direct rendered children.
 * Absolute and anchored children do not participate in native CSS intrinsic
 * sizing, so this observer closes that gap without persisting derived pixels
 * back into the Project Model.
 */
export function bindRuntimeFitContent(
  target: HTMLElement,
  contentHost: HTMLElement,
  layout: RuntimeComponentLayout | undefined,
  options?: RuntimeFitContentMeasurementOptions,
): RuntimeFitContentBinding {
  const item = normalizeItem(layout);
  if (
    item.width !== 'fit-content' &&
    item.height !== 'fit-content' &&
    !layoutProjectors.has(target)
  ) {
    return { refresh: () => undefined, dispose: () => undefined };
  }

  let disposed = false;
  let scheduled = false;
  const refresh = (): void => {
    if (disposed) return;
    const binding = layoutBindings.get(target);
    const effectiveLayout = binding
      ? (layoutProjectors.get(target)?.(binding.node) ?? binding.node).layout
      : layout;
    const size = measureRuntimeFitContentSize(target, contentHost, effectiveLayout, options);
    setFitContentDimension(target, 'width', size.width);
    setFitContentDimension(target, 'height', size.height);
  };
  const scheduleRefresh = (): void => {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refresh();
    });
  };

  const view = target.ownerDocument.defaultView;
  const ResizeObserverConstructor = view?.ResizeObserver;
  const resizeObserver =
    ResizeObserverConstructor === undefined
      ? undefined
      : new ResizeObserverConstructor(scheduleRefresh);
  let observedElements = new Set<HTMLElement>();
  const observeChildren = (): void => {
    if (resizeObserver === undefined) return;
    const next = new Set<HTMLElement>([
      target,
      contentHost,
      ...directElementChildren(contentHost).filter(
        (child) => options?.isLayoutChild?.(child) ?? true,
      ),
    ]);
    for (const element of observedElements) {
      if (!next.has(element)) resizeObserver.unobserve(element);
    }
    for (const element of next) {
      if (!observedElements.has(element)) resizeObserver.observe(element);
    }
    observedElements = next;
  };
  observeChildren();

  const MutationObserverConstructor = view?.MutationObserver;
  const mutationObserver =
    MutationObserverConstructor === undefined
      ? undefined
      : new MutationObserverConstructor(() => {
          observeChildren();
          scheduleRefresh();
        });
  mutationObserver?.observe(contentHost, {
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style'],
    childList: true,
    characterData: true,
    subtree: true,
  });
  refresh();

  return {
    refresh,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    },
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
 * Applies only the container half of a node's structural layout. Composite
 * controls use this for an internal child surface while retaining ownership
 * of their outer browser element and positioning behavior.
 */
export function applyRuntimeContainerLayout(
  element: HTMLElement,
  node: RuntimeLayoutNode,
): RuntimeLayoutProjection {
  const projection = projectRuntimeLayout(node);
  setImportantStyles(element, projection.container);
  return projection;
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
  layoutBindings.set(element, { node, parent: parentContainer, options });
  node = layoutProjectors.get(element)?.(node) ?? node;
  standaloneRatioStyles.delete(element);
  const ratio = aspectRatioOverrides.get(element);
  const projection = projectRuntimeLayout(
    ratio === undefined ? node : { ...node, props: { ...node.props, aspectRatio: ratio } },
    parentContainer,
  );
  const item = normalizeItem(node.layout);
  const rootStyles = options.isPageRoot
    ? {
        position: 'relative',
        ...(item.width === 'fit-content'
          ? {
              width: INTRINSIC_CONTENT_SIZE,
              ...axisMinMaxStyles('horizontal', item.minWidth, item.maxWidth),
            }
          : // Percentages use the available body width, excluding classic scrollbars.
            { width: '100%' }),
        ...(item.height === 'fit-content'
          ? {
              height: INTRINSIC_CONTENT_SIZE,
              ...axisMinMaxStyles('vertical', item.minHeight, item.maxHeight),
            }
          : {
              height: '100dvh',
              'min-height': '100dvh',
            }),
      }
    : options.isReusableRoot
      ? {
          position: 'relative',
          width: '100%',
          height: '100%',
          // An unconstrained fit placement needs an intrinsic floor until the
          // outer instance can measure its out-of-flow descendants. A
          // placement maximum is an explicit authoring bound, however, so it
          // must win over that floor rather than allowing the definition root
          // to overflow its measured wrapper.
          'min-width':
            options.reusableRootFitContent?.width && !options.reusableRootFitContent.hasMaxWidth
              ? INTRINSIC_CONTENT_SIZE
              : '0px',
          'min-height':
            options.reusableRootFitContent?.height && !options.reusableRootFitContent.hasMaxHeight
              ? INTRINSIC_CONTENT_SIZE
              : '0px',
          ...(options.reusableRootFitContent?.hasMaxWidth ? { 'max-width': '100%' } : {}),
          ...(options.reusableRootFitContent?.hasMaxHeight ? { 'max-height': '100%' } : {}),
        }
      : projection.item;
  setImportantStyles(element, { ...projection.container, ...rootStyles });
  return projection;
}
