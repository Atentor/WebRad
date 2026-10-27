import {
  DESIGNER_VIEWPORTS as VIEWPORTS,
  type DesignerViewportName as ViewportName,
} from '@webrad/designer';
import { ComponentView, SharedComponentStyles } from '@webrad/components';
import {
  componentRegistry,
  resolveComponentDesignerPresentation,
} from '@webrad/component-registry';
import {
  RESIZE_HANDLES,
  constrainMovementDelta,
  getParentContentBounds,
  getBoundsResizeHandles,
  intersectsBounds,
  normalizeBounds,
  normalizeTopLevelIds,
  resizeBounds,
  projectInsertionBounds,
  collectSubtreeIds,
  unionBounds,
  type Point,
  type MovementConstraint,
  type ResizeHandle,
} from '@webrad/designer';
import type {
  Bounds,
  ComponentNode,
  PageModel,
  ProjectSettings,
  ReusableElementModel,
} from '@webrad/project-model';
import type { ComponentStyleModel } from '@webrad/project-model';
import { projectThemeCss, type ResolvedThemeMode } from '@webrad/project-model';
import {
  projectRuntimeLayout,
  getFloatingPanelAlignment,
  projectFloatingPanelBounds,
  type RuntimeContainerLayout,
  type RuntimeFitContentSize,
} from '@webrad/runtime';
import { projectComponentVisual, resolveComponentStyleClassName } from '@webrad/runtime/visual';
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { WEBRAD_COMPONENT_DRAG_TYPE, WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';
import { getDesignerDragPayload, type DesignerDragPayload } from './designer-drag-data';
import { useDesignerDropFeedback } from './useDesignerDropFeedback';
import {
  DesignerInsertionFeedback,
  type DesignerInsertionPreview,
} from './DesignerInsertionFeedback';
import { designerInsertionBounds } from './designer-insertion-bounds';
import { useDesignerAvailableWidth } from './useDesignerAvailableWidth';
import { useDesignerPointerInteraction } from './useDesignerPointerInteraction';
import { measureDesignerChildrenHost, measureDesignerNodeMargins } from './designer-host-geometry';
import { measureDesignerFitContentSize } from './designer-fit-content';

interface DesignerSurfaceProps {
  previewTheme?: ResolvedThemeMode;
  viewportName?: ViewportName;
  onViewportChange?: (viewport: ViewportName) => void;
  showToolbar?: boolean;

  page: PageModel;
  reusableElements?: readonly ReusableElementModel[];
  settings: ProjectSettings;
  styles?: readonly ComponentStyleModel[];
  compiledStylesCss?: string;
  selectedIds: readonly string[];
  selectedPaletteType: string | null;
  onCancelInsertion?: () => void;
  zoom: number;
  onSelect: (ids: readonly string[], primaryId?: string) => void;
  onAddComponent: (
    type: string,
    point: Point,
    parentId: string,
    beforeComponentId?: string | null,
  ) => void;
  onAddReusableElement?: (
    reusableElementId: string,
    point: Point,
    parentId: string,
    beforeComponentId?: string | null,
  ) => void;
  onMoveComponents: (ids: readonly string[], delta: Point) => void;
  /**
   * The host owns the structural command. `beforeComponentId` is null when the
   * selection should be appended to the parent's visual children.
   */
  onReorderComponents?: (
    parentId: string,
    componentIds: readonly string[],
    beforeComponentId: string | null,
  ) => void;
  /** Enables cross-container dragging when the host can persist the structural change. */
  onReparentComponents?: (
    componentIds: readonly string[],
    parentId: string,
    bounds: ReadonlyMap<string, Bounds>,
    beforeComponentId: string | null,
  ) => void;
  onResizeComponent: (id: string, bounds: Bounds) => void;
  onDeleteSelection: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onZoomChange: (zoom: number) => void;
  /** Activates a component-specific Designer action, such as its default event or editor. */
  onComponentActivate?: (componentId: string) => void;
  /** Opens the source definition instead of editing reusable children in-place. */
  onOpenReusableElement?: (reusableElementId: string) => void;
}

type ContainerLayoutMode = ComponentNode['layout']['container']['mode'];

interface LayoutNode {
  node: ComponentNode;
  absoluteBounds: Bounds;
  order: number;
  depth: number;
}

type DesignViewport = Pick<Bounds, 'width' | 'height'> & { readonly responsiveWidth?: number };

interface FloatingContainerEditor {
  readonly rootId: string;
  readonly bounds: Bounds;
}

interface ReorderTarget {
  parentId: string;
  beforeComponentId: string | null;
  indicatorBounds: Bounds;
}

interface ReparentTarget {
  parentId: string;
  bounds: ReadonlyMap<string, Bounds>;
  beforeComponentId: string | null;
  preview: DesignerInsertionPreview;
}

interface DragInteraction {
  kind: 'drag';
  mode: 'move' | 'reorder';
  pointerId: number;
  start: Point;
  ids: readonly string[];
  originalBounds: ReadonlyMap<string, Bounds>;
  originalAbsoluteBounds: ReadonlyMap<string, Bounds>;
  selectionBounds: Bounds;
  constraints: readonly MovementConstraint[];
  delta: Point;
  activated: boolean;
  reorderTarget?: ReorderTarget;
  reparentTarget?: ReparentTarget;
}

interface ResizeInteraction {
  kind: 'resize';
  pointerId: number;
  start: Point;
  id: string;
  handle: ResizeHandle;
  originalBounds: Bounds;
  originalVisualBounds?: Bounds;
  currentBounds: Bounds;
  containerBounds: Bounds;
  activated: boolean;
}

interface MarqueeInteraction {
  kind: 'marquee';
  pointerId: number;
  start: Point;
  current: Point;
  additive: boolean;
}

type Interaction = DragInteraction | ResizeInteraction | MarqueeInteraction;

function pointInside(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width &&
    point.y <= bounds.y + bounds.height
  );
}

function sameBounds(left: Bounds, right: Bounds): boolean {
  const tolerance = 0.05;
  return (
    Math.abs(left.x - right.x) < tolerance &&
    Math.abs(left.y - right.y) < tolerance &&
    Math.abs(left.width - right.width) < tolerance &&
    Math.abs(left.height - right.height) < tolerance
  );
}

function sameBoundsMap(
  left: ReadonlyMap<string, Bounds>,
  right: ReadonlyMap<string, Bounds>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, bounds] of left) {
    const next = right.get(id);
    if (next === undefined || !sameBounds(bounds, next)) return false;
  }
  return true;
}

function sameFitContentSize(
  left: RuntimeFitContentSize | undefined,
  right: RuntimeFitContentSize | undefined,
): boolean {
  return left?.width === right?.width && left?.height === right?.height;
}

function sameFitContentSizeMap(
  left: ReadonlyMap<string, RuntimeFitContentSize>,
  right: ReadonlyMap<string, RuntimeFitContentSize>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [id, size] of left) {
    if (!sameFitContentSize(size, right.get(id))) return false;
  }
  return true;
}

function isFloatingComponent(node: ComponentNode): boolean {
  const definition = componentRegistry.get(node.type);
  return (
    definition?.supportsFloatingPlacement === true &&
    (node.props.placement ?? definition.defaults.placement) === 'floating'
  );
}

function usesResponsiveFloatingSize(node: ComponentNode): boolean {
  return (
    isFloatingComponent(node) && componentRegistry.get(node.type)?.floatingSizing === 'responsive'
  );
}

function appearsOnDesignerCanvas(type: string): boolean {
  const definition = componentRegistry.get(type);
  return definition !== undefined && resolveComponentDesignerPresentation(definition) === 'canvas';
}

function appearsInDesignerTray(type: string): boolean {
  const definition = componentRegistry.get(type);
  return definition !== undefined && resolveComponentDesignerPresentation(definition) === 'tray';
}

/**
 * A visual container can be authored from the tray when it represents a
 * floating runtime surface. The registry, rather than a component-type
 * conditional, defines that behavior for the Designer.
 */
function isDesignerFloatingContainer(node: ComponentNode): boolean {
  const definition = componentRegistry.get(node.type);
  return (
    definition !== undefined &&
    definition.visual &&
    definition.canHaveChildren &&
    resolveComponentDesignerPresentation(definition) === 'tray'
  );
}

function floatingContainerEditorRootId(
  selectedIds: readonly string[],
  byId: ReadonlyMap<string, ComponentNode>,
): string | undefined {
  for (const selectedId of [...selectedIds].reverse()) {
    const seen = new Set<string>();
    let current = byId.get(selectedId);
    while (current !== undefined && !seen.has(current.id)) {
      if (isDesignerFloatingContainer(current)) return current.id;
      seen.add(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
  }
  return undefined;
}

function centeredFloatingContainerBounds(
  node: ComponentNode,
  designViewport: DesignViewport,
): Bounds {
  return {
    ...node.bounds,
    x: Math.round((designViewport.width - node.bounds.width) / 2),
    y: Math.round((designViewport.height - node.bounds.height) / 2),
  };
}

function floatingHorizontalAnchor(node: ComponentNode): 'left' | 'center' | 'right' {
  const value = node.props.floatingHorizontalAnchor;
  return value === 'center' || value === 'right' ? value : 'left';
}

function floatingVerticalAnchor(node: ComponentNode): 'top' | 'center' | 'bottom' {
  const value = node.props.floatingVerticalAnchor;
  return value === 'center' || value === 'bottom' ? value : 'top';
}

function floatingLayer(node: ComponentNode): number {
  const value = node.props.floatingZIndex;
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 100;
}

/** Converts a visual drag to the stored edge-offset axes of a floating item. */
function movementDeltaForNode(node: ComponentNode, delta: Point): Point {
  if (!isFloatingComponent(node)) return delta;
  if (getFloatingPanelAlignment(node) !== 'none') return { x: 0, y: 0 };
  return {
    x: floatingHorizontalAnchor(node) === 'right' ? -delta.x : delta.x,
    y: floatingVerticalAnchor(node) === 'bottom' ? -delta.y : delta.y,
  };
}

function movementSignature(node: ComponentNode): string {
  const delta = movementDeltaForNode(node, { x: 1, y: 1 });
  return `${isFloatingComponent(node) ? 'floating' : 'in-flow'}:${String(delta.x)}:${String(delta.y)}`;
}

function boundsResizeHandles(
  node: ComponentNode,
  parentMode: ContainerLayoutMode,
  automatic = false,
): readonly ResizeHandle[] {
  if (automatic) return [];
  if (usesResponsiveFloatingSize(node)) {
    const handles = getBoundsResizeHandles(node.layout.item, 'fixed');
    switch (getFloatingPanelAlignment(node)) {
      case 'top':
        return handles.filter((handle) => !handle.includes('n'));
      case 'bottom':
        return handles.filter((handle) => !handle.includes('s'));
      case 'left':
        return handles.filter((handle) => !handle.includes('w'));
      case 'right':
        return handles.filter((handle) => !handle.includes('e'));
      case 'client':
        return handles.filter((handle) => !handle.includes('n') && !handle.includes('w'));
      case 'none':
        return handles;
    }
  }
  if (isFloatingComponent(node)) {
    switch (getFloatingPanelAlignment(node)) {
      case 'top':
        return ['s'];
      case 'bottom':
        return ['n'];
      case 'left':
        return ['e'];
      case 'right':
        return ['w'];
      case 'client':
        return [];
    }
  }
  // Floating surfaces own their dimensions independently of item sizing and
  // the parent flow. The ordinary layout contract governs every other item.
  return isDesignerFloatingContainer(node) || isFloatingComponent(node)
    ? RESIZE_HANDLES
    : getBoundsResizeHandles(node.layout.item, parentMode);
}

function movementConstraintsForIds(
  page: PageModel,
  byId: ReadonlyMap<string, ComponentNode>,
  ids: readonly string[],
  surface: HTMLElement | null,
  scale: number,
  layoutById: ReadonlyMap<string, LayoutNode>,
): readonly MovementConstraint[] {
  const groups = new Map<string, ComponentNode[]>();
  for (const id of ids) {
    const selected = byId.get(id);
    if (selected?.parentId == null || isFloatingComponent(selected)) continue;
    const group = groups.get(selected.parentId) ?? [];
    group.push(selected);
    groups.set(selected.parentId, group);
  }
  return [...groups].map(([parentId, nodes]) => {
    const host = measureDesignerChildrenHost(surface, parentId, scale);
    return {
      bounds: unionBounds(
        nodes.map((node) => {
          const visual = layoutById.get(node.id)?.absoluteBounds;
          const margins = measureDesignerNodeMargins(surface, node.id);
          return host === undefined || visual === undefined
            ? node.bounds
            : {
                x: visual.x - host.origin.x - margins.left,
                y: visual.y - host.origin.y - margins.top,
                width: visual.width + margins.left + margins.right,
                height: visual.height + margins.top + margins.bottom,
              };
        }),
      ),
      containerBounds: host?.bounds ?? getParentContentBounds(page, parentId),
    };
  });
}

function localBoundsWithPreview(node: ComponentNode, interaction: Interaction | null): Bounds {
  if (
    interaction?.kind === 'drag' &&
    interaction.mode === 'move' &&
    interaction.ids.includes(node.id)
  ) {
    const original = interaction.originalBounds.get(node.id) ?? node.bounds;
    const delta = movementDeltaForNode(node, interaction.delta);
    return {
      ...original,
      x: original.x + delta.x,
      y: original.y + delta.y,
    };
  }
  if (interaction?.kind === 'resize' && interaction.id === node.id) {
    return interaction.currentBounds;
  }
  return node.bounds;
}

function buildLayout(
  page: PageModel,
  byId: ReadonlyMap<string, ComponentNode>,
  measuredBounds: ReadonlyMap<string, Bounds>,
  floatingContainerEditor?: FloatingContainerEditor,
): readonly LayoutNode[] {
  const output: LayoutNode[] = [];
  let order = 0;
  const visitChildren = (parentId: string, origin: Point, depth: number): void => {
    const parent = byId.get(parentId);
    if (!parent) return;
    for (const childId of parent.children) {
      const child = byId.get(childId);
      const editorBounds =
        floatingContainerEditor !== undefined && child?.id === floatingContainerEditor.rootId
          ? floatingContainerEditor.bounds
          : undefined;
      if (!child || (!appearsOnDesignerCanvas(child.type) && editorBounds === undefined)) continue;
      const fallback = editorBounds ?? {
        ...child.bounds,
        x: origin.x + child.bounds.x,
        y: origin.y + child.bounds.y,
      };
      // A floating editor deliberately uses its projected centered bounds.
      // Its children still use measured browser geometry just like canvas nodes.
      const absoluteBounds = editorBounds ?? measuredBounds.get(child.id) ?? fallback;
      output.push({ node: child, absoluteBounds, order, depth });
      order += 1;
      visitChildren(child.id, { x: absoluteBounds.x, y: absoluteBounds.y }, depth + 1);
    }
  };
  visitChildren(page.rootComponentId, { x: 0, y: 0 }, 0);
  return output;
}

function reactStyle(
  declarations: Readonly<Record<string, string>>,
  additional: CSSProperties = {},
): CSSProperties {
  const converted: Record<string, string> = {};
  for (const [property, value] of Object.entries(declarations)) {
    const reactProperty = property.replace(/-([a-z])/gu, (_match, character: string) =>
      character.toUpperCase(),
    );
    converted[reactProperty] = value;
  }
  return { ...additional, ...converted } as CSSProperties;
}

function projectItemStyle(
  node: ComponentNode,
  parentContainer: RuntimeContainerLayout | undefined,
  interaction: Interaction | null,
  designViewport: DesignViewport,
  fitContentSize?: RuntimeFitContentSize,
): CSSProperties {
  const bounds = localBoundsWithPreview(node, interaction);
  node = { ...node, bounds };
  const item = projectRuntimeLayout(node, parentContainer).item;
  const supportsDynamicFitMeasurement =
    !isFloatingComponent(node) || usesResponsiveFloatingSize(node);
  const measuredFitContent =
    interaction?.kind === 'resize' && interaction.id === node.id ? undefined : fitContentSize;
  const useMeasuredWidth =
    supportsDynamicFitMeasurement &&
    node.layout.item.width === 'fit-content' &&
    measuredFitContent?.width !== undefined;
  const useMeasuredHeight =
    supportsDynamicFitMeasurement &&
    node.layout.item.height === 'fit-content' &&
    measuredFitContent?.height !== undefined;
  const fitContentStyles = {
    ...(useMeasuredWidth ? { width: `${String(measuredFitContent.width)}px` } : {}),
    ...(useMeasuredHeight ? { height: `${String(measuredFitContent.height)}px` } : {}),
  };
  if (!isFloatingComponent(node) || usesResponsiveFloatingSize(node)) {
    return reactStyle(
      {
        ...item,
        ...fitContentStyles,
        ...(isFloatingComponent(node) ? { position: 'absolute' } : {}),
      },
      {
        boxSizing: 'border-box',
      },
    );
  }

  const visualBounds = floatingVisualBounds(node, bounds, designViewport);
  const structuralStyles = Object.fromEntries(
    Object.entries(item).filter(
      ([property]) => !['position', 'left', 'right', 'top', 'bottom'].includes(property),
    ),
  );
  return reactStyle(
    {
      ...structuralStyles,
      position: 'absolute',
      left: `${String(visualBounds.x)}px`,
      top: `${String(visualBounds.y)}px`,
      width: `${String(visualBounds.width)}px`,
      height: `${String(visualBounds.height)}px`,
      ...fitContentStyles,
    },
    {
      boxSizing: 'border-box',
    },
  );
}

function projectDesignerItemStyle(
  node: ComponentNode,
  parentContainer: RuntimeContainerLayout | undefined,
  interaction: Interaction | null,
  designViewport: DesignViewport,
  floatingEditorBounds?: Bounds,
  forceVisible = false,
  fitContentSize?: RuntimeFitContentSize,
): CSSProperties {
  const visual = projectComponentVisual(node, 'fill');
  const margins = Object.fromEntries(
    (['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const)
      .filter((name) => (visual.style[name] ?? visual.style.margin) !== undefined)
      .map((name) => [name, visual.style[name] ?? visual.style.margin]),
  );
  if (floatingEditorBounds !== undefined) {
    const bounds =
      interaction?.kind === 'resize' && interaction.id === node.id
        ? interaction.currentBounds
        : floatingEditorBounds;
    return {
      position: 'absolute',
      // Selection feedback measures this structural wrapper. Making it a flex
      // host prevents inline controls from being baseline-aligned inside a
      // different visual rectangle.
      display: 'flex',
      left: `${String(bounds.x)}px`,
      top: `${String(bounds.y)}px`,
      width: `${String(bounds.width)}px`,
      height: `${String(bounds.height)}px`,
      boxSizing: 'border-box',
      ...margins,
    };
  }
  const style = projectItemStyle(
    node,
    parentContainer,
    interaction,
    designViewport,
    fitContentSize,
  );
  const itemStyle = {
    ...style,
    ...margins,
  };
  return !forceVisible && !visual.visible && visual.collapseWhenHidden
    ? { ...itemStyle, display: 'none' }
    : { ...itemStyle, display: 'flex' };
}

/** Projects persisted floating offsets to the simulated design viewport. */
function floatingVisualBounds(
  node: ComponentNode,
  bounds: Bounds,
  designViewport: DesignViewport,
): Bounds {
  const dockedBounds = projectFloatingPanelBounds({ ...node, bounds }, designViewport);
  if (dockedBounds !== undefined) return dockedBounds;
  const x =
    floatingHorizontalAnchor(node) === 'right'
      ? designViewport.width - bounds.x - bounds.width
      : floatingHorizontalAnchor(node) === 'center'
        ? designViewport.width / 2 + bounds.x - bounds.width / 2
        : bounds.x;
  const y =
    floatingVerticalAnchor(node) === 'bottom'
      ? designViewport.height - bounds.y - bounds.height
      : floatingVerticalAnchor(node) === 'center'
        ? designViewport.height / 2 + bounds.y - bounds.height / 2
        : bounds.y;
  return { ...bounds, x, y };
}

/** Converts an interactive viewport resize back to the persisted anchor offsets. */
function floatingPersistedBounds(
  node: ComponentNode,
  visualBounds: Bounds,
  designViewport: DesignViewport,
  originalVisualBounds?: Bounds,
): Bounds {
  if (usesResponsiveFloatingSize(node)) {
    const original =
      originalVisualBounds ?? projectFloatingPanelBounds(node, designViewport) ?? node.bounds;
    const free = getFloatingPanelAlignment(node) === 'none';
    return {
      ...node.bounds,
      ...(node.layout.item.width === 'fixed'
        ? {
            width: visualBounds.width,
            ...(free
              ? {
                  x:
                    node.bounds.x +
                    (floatingHorizontalAnchor(node) === 'right'
                      ? original.x + original.width - visualBounds.x - visualBounds.width
                      : floatingHorizontalAnchor(node) === 'center'
                        ? visualBounds.x + visualBounds.width / 2 - original.x - original.width / 2
                        : visualBounds.x - original.x),
                }
              : {}),
          }
        : {}),
      ...(node.layout.item.height === 'fixed'
        ? {
            height: visualBounds.height,
            ...(free
              ? {
                  y:
                    node.bounds.y +
                    (floatingVerticalAnchor(node) === 'bottom'
                      ? original.y + original.height - visualBounds.y - visualBounds.height
                      : floatingVerticalAnchor(node) === 'center'
                        ? visualBounds.y +
                          visualBounds.height / 2 -
                          original.y -
                          original.height / 2
                        : visualBounds.y - original.y),
                }
              : {}),
          }
        : {}),
    };
  }
  switch (getFloatingPanelAlignment(node)) {
    case 'top':
    case 'bottom':
      return { ...node.bounds, height: visualBounds.height };
    case 'left':
    case 'right':
      return { ...node.bounds, width: visualBounds.width };
    case 'client':
      return node.bounds;
  }
  const x =
    floatingHorizontalAnchor(node) === 'right'
      ? designViewport.width - visualBounds.x - visualBounds.width
      : floatingHorizontalAnchor(node) === 'center'
        ? visualBounds.x - designViewport.width / 2 + visualBounds.width / 2
        : visualBounds.x;
  const y =
    floatingVerticalAnchor(node) === 'bottom'
      ? designViewport.height - visualBounds.y - visualBounds.height
      : floatingVerticalAnchor(node) === 'center'
        ? visualBounds.y - designViewport.height / 2 + visualBounds.height / 2
        : visualBounds.y;
  return { ...visualBounds, x, y };
}

function designHitZIndex(node: ComponentNode, order: number): number {
  return isFloatingComponent(node) ? 10_000 + floatingLayer(node) : order + 1;
}

function projectChildrenStyle(node: ComponentNode): CSSProperties {
  const item = node.layout.item;
  return reactStyle(projectRuntimeLayout(node).container, {
    boxSizing: 'border-box',
    // A fit-content container must let this host establish its own intrinsic
    // extent. Forcing 100% here gives a small parent an artificial available
    // size, which in turn flex-shrinks its children before the outer surface
    // can grow around them.
    width: item.width === 'fit-content' ? 'max-content' : '100%',
    height: item.height === 'fit-content' ? 'max-content' : '100%',
    minWidth: 0,
    minHeight: 0,
  });
}

function directElementChildren(element: HTMLElement): readonly HTMLElement[] {
  return Array.from(element.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

function directChildrenLayoutHost(component: HTMLElement, type: string): HTMLElement | undefined {
  const directHost = directElementChildren(component).find((child) =>
    child.classList.contains('wr-runtime-children'),
  );
  if (directHost !== undefined) return directHost;
  const registeredHost = component.querySelector<HTMLElement>(
    '[data-webrad-child-host] > .wr-runtime-children',
  );
  if (registeredHost?.closest('[data-component-id]') === component) return registeredHost;
  if (type !== 'WebPopup') return undefined;
  const popupChildrenHost = directElementChildren(component).find(
    (child) => child.dataset.webradPopupChildren === '',
  );
  return popupChildrenHost === undefined
    ? undefined
    : directElementChildren(popupChildrenHost).find((child) =>
        child.classList.contains('wr-runtime-children'),
      );
}

function fitContentHost(component: HTMLElement, node: ComponentNode): HTMLElement {
  if (node.type !== 'WebReusableElement') {
    return directChildrenLayoutHost(component, node.type) ?? component;
  }

  const reusableDefinition = directElementChildren(component).find((child) =>
    child.classList.contains('wr-reusable-definition-root'),
  );
  const reusableRoot =
    reusableDefinition === undefined
      ? undefined
      : directElementChildren(reusableDefinition).find(
          (child) => child.dataset.componentId !== undefined,
        );
  return reusableRoot === undefined
    ? component
    : (directChildrenLayoutHost(reusableRoot, reusableRoot.dataset.componentType ?? '') ??
        reusableRoot);
}

function shouldMeasureDesignerFitContent(node: ComponentNode, isRoot = false): boolean {
  return (
    (!isFloatingComponent(node) || usesResponsiveFloatingSize(node)) &&
    (isRoot || node.type === 'WebReusableElement' || node.children.length > 0) &&
    (node.layout.item.width === 'fit-content' || node.layout.item.height === 'fit-content')
  );
}

/**
 * A reusable definition is physically rendered once per placement, so its
 * template IDs cannot be used in DesignerSurface's page-level measurement
 * map. Each mounted definition owns this local map instead. Filtering by the
 * closest definition root also keeps a nested placement in its own instance
 * scope while its parent observes the placement wrapper as one child.
 */
function useReusableDefinitionFitContentSizes(
  definitionRootRef: RefObject<HTMLDivElement | null>,
  byId: ReadonlyMap<string, ComponentNode>,
  scale: number,
  designViewport: DesignViewport,
  reusableElementsById: ReadonlyMap<string, ReusableElementModel>,
): ReadonlyMap<string, RuntimeFitContentSize> {
  const [fitContentSizes, setFitContentSizes] = useState<
    ReadonlyMap<string, RuntimeFitContentSize>
  >(() => new Map());
  const measure = useCallback((): void => {
    const definitionRoot = definitionRootRef.current;
    if (definitionRoot === null) return;
    const next = new Map<string, RuntimeFitContentSize>();
    for (const wrapper of definitionRoot.querySelectorAll<HTMLElement>(
      '[data-designer-definition-node-id]',
    )) {
      if (wrapper.closest('[data-reusable-element-id]') !== definitionRoot) continue;
      const nodeId = wrapper.dataset.designerDefinitionNodeId;
      const node = nodeId === undefined ? undefined : byId.get(nodeId);
      if (node === undefined) continue;
      const projected =
        componentRegistry.require(node.type).projectLayout?.(node, designViewport, {
          reusableElements: [...reusableElementsById.values()],
        }) ?? node;
      if (!shouldMeasureDesignerFitContent(projected)) continue;
      const component = directElementChildren(wrapper).find(
        (child) => child.dataset.componentId === node.id,
      );
      if (component === undefined) continue;
      const size = measureDesignerFitContentSize(
        component,
        fitContentHost(component, projected),
        projected,
        {
          scale,
          isLayoutChild: (child) => {
            const childNodeId = child.dataset.designerDefinitionNodeId;
            const childNode = childNodeId === undefined ? undefined : byId.get(childNodeId);
            return childNode === undefined || !isDesignerFloatingContainer(childNode);
          },
        },
      );
      if (size.width !== undefined || size.height !== undefined) next.set(node.id, size);
    }
    setFitContentSizes((current) => (sameFitContentSizeMap(current, next) ? current : next));
  }, [byId, definitionRootRef, scale, designViewport, reusableElementsById]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    const definitionRoot = definitionRootRef.current;
    if (definitionRoot === null) return undefined;
    let scheduled = false;
    const scheduleMeasure = (): void => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        measure();
      });
    };
    const view = definitionRoot.ownerDocument.defaultView;
    const ResizeObserverConstructor = view?.ResizeObserver;
    const resizeObserver =
      ResizeObserverConstructor === undefined
        ? undefined
        : new ResizeObserverConstructor(scheduleMeasure);
    resizeObserver?.observe(definitionRoot);
    for (const wrapper of definitionRoot.querySelectorAll<HTMLElement>(
      '[data-designer-definition-node-id]',
    )) {
      if (wrapper.closest('[data-reusable-element-id]') === definitionRoot) {
        resizeObserver?.observe(wrapper);
      }
    }
    const MutationObserverConstructor = view?.MutationObserver;
    const mutationObserver =
      MutationObserverConstructor === undefined
        ? undefined
        : new MutationObserverConstructor(scheduleMeasure);
    mutationObserver?.observe(definitionRoot, {
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [definitionRootRef, measure]);

  return fitContentSizes;
}

function isFlowMode(mode: ContainerLayoutMode): boolean {
  return mode === 'row' || mode === 'column';
}

function parentModeOf(
  node: ComponentNode,
  byId: ReadonlyMap<string, ComponentNode>,
): ContainerLayoutMode {
  if (isFloatingComponent(node) || isDesignerFloatingContainer(node)) return 'fixed';
  return node.parentId === null
    ? 'fixed'
    : (byId.get(node.parentId)?.layout.container.mode ?? 'fixed');
}

function reusableElementId(node: ComponentNode): string | undefined {
  const value = node.props.reusableElementId;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface RuntimeNodeProps {
  node: ComponentNode;
  byId: ReadonlyMap<string, ComponentNode>;
  reusableElementsById: ReadonlyMap<string, ReusableElementModel>;
  styleClassNames: ReadonlyMap<string, string>;
  fitContentSizes: ReadonlyMap<string, RuntimeFitContentSize>;
  parentContainer: RuntimeContainerLayout;
  interaction: Interaction | null;
  designViewport: DesignViewport;
  scale: number;
  floatingHost: HTMLElement | null;
  /** Centered bounds for a tray-authored visual container being edited. */
  floatingEditorBounds?: Bounds;
}

interface ReusableDefinitionNodeProps {
  readonly node: ComponentNode;
  readonly byId: ReadonlyMap<string, ComponentNode>;
  readonly reusableElementsById: ReadonlyMap<string, ReusableElementModel>;
  readonly styleClassNames: ReadonlyMap<string, string>;
  readonly fitContentSizes: ReadonlyMap<string, RuntimeFitContentSize>;
  readonly parentContainer: RuntimeContainerLayout;
  readonly interaction: Interaction | null;
  readonly ancestry: readonly string[];
  readonly designViewport: DesignViewport;
  readonly scale: number;
  readonly floatingHost: HTMLElement | null;
}

function renderDesignerNode(
  node: ComponentNode,
  floatingHost: HTMLElement | null,
  element: ReactElement,
  useFloatingHost = false,
): ReactElement {
  return (isFloatingComponent(node) || useFloatingHost) && floatingHost !== null
    ? createPortal(element, floatingHost)
    : element;
}

function reusableVisualChildren(
  node: ComponentNode,
  byId: ReadonlyMap<string, ComponentNode>,
): readonly ComponentNode[] {
  return node.children
    .map((childId) => byId.get(childId))
    .filter(
      (child): child is ComponentNode => child !== undefined && appearsOnDesignerCanvas(child.type),
    );
}

function ReusableDefinitionContent({
  instance,
  reusableElement,
  reusableElementsById,
  styleClassNames,
  interaction,
  ancestry,
  designViewport,
  scale,
  floatingHost,
}: {
  readonly instance: ComponentNode;
  readonly reusableElement: ReusableElementModel;
  readonly reusableElementsById: ReadonlyMap<string, ReusableElementModel>;
  readonly styleClassNames: ReadonlyMap<string, string>;
  readonly interaction: Interaction | null;
  readonly ancestry: readonly string[];
  readonly designViewport: DesignViewport;
  readonly scale: number;
  readonly floatingHost: HTMLElement | null;
}): ReactElement | null {
  const definitionRootRef = useRef<HTMLDivElement | null>(null);
  const byId = useMemo(
    () => new Map(reusableElement.components.map((component) => [component.id, component])),
    [reusableElement.components],
  );
  const fitContentSizes = useReusableDefinitionFitContentSizes(
    definitionRootRef,
    byId,
    scale,
    designViewport,
    reusableElementsById,
  );
  if (ancestry.includes(reusableElement.id)) return null;
  const root = byId.get(reusableElement.rootComponentId);
  if (root === undefined) return null;
  const children = reusableVisualChildren(root, byId);
  return (
    <div
      ref={definitionRootRef}
      className={`wr-reusable-definition-root${
        instance.layout.item.width === 'fit-content' && instance.layout.item.maxWidth === null
          ? ' wr-reusable-definition-fit-width'
          : ''
      }${
        instance.layout.item.height === 'fit-content' && instance.layout.item.maxHeight === null
          ? ' wr-reusable-definition-fit-height'
          : ''
      }${
        instance.layout.item.width === 'fit-content' && instance.layout.item.maxWidth !== null
          ? ' wr-reusable-definition-constrained-fit-width'
          : ''
      }${
        instance.layout.item.height === 'fit-content' && instance.layout.item.maxHeight !== null
          ? ' wr-reusable-definition-constrained-fit-height'
          : ''
      }`}
      data-reusable-element-id={reusableElement.id}
    >
      <ComponentView
        node={root}
        designTime
        styleClassName={
          root.styleId === undefined ? undefined : (styleClassNames.get(root.styleId) ?? '')
        }
      >
        {children.length > 0 && (
          <div
            className={`wr-runtime-children wr-runtime-children-${root.layout.container.mode}`}
            style={projectChildrenStyle(root)}
          >
            {children.map((child) => (
              <ReusableDefinitionNode
                key={`${instance.id}:${child.id}`}
                node={child}
                byId={byId}
                reusableElementsById={reusableElementsById}
                styleClassNames={styleClassNames}
                fitContentSizes={fitContentSizes}
                parentContainer={root.layout.container}
                interaction={interaction}
                ancestry={[...ancestry, reusableElement.id]}
                designViewport={designViewport}
                scale={scale}
                floatingHost={floatingHost}
              />
            ))}
          </div>
        )}
      </ComponentView>
    </div>
  );
}

function ReusableDefinitionNode({
  node: savedNode,
  byId,
  reusableElementsById,
  styleClassNames,
  fitContentSizes,
  parentContainer,
  interaction,
  ancestry,
  designViewport,
  scale,
  floatingHost,
}: ReusableDefinitionNodeProps): ReactElement {
  const node =
    componentRegistry.require(savedNode.type).projectLayout?.(savedNode, designViewport, {
      reusableElements: [...reusableElementsById.values()],
    }) ?? savedNode;
  const children = reusableVisualChildren(node, byId);
  const referencedReusableElementId = reusableElementId(node);
  const reusableElement =
    node.type === 'WebReusableElement' && referencedReusableElementId !== undefined
      ? reusableElementsById.get(referencedReusableElementId)
      : undefined;
  const isContainer = children.length > 0 || reusableElement !== undefined;
  const element = (
    <div
      className={`wr-runtime-node wr-runtime-item-${parentContainer.mode}${
        isContainer ? ' wr-runtime-container' : ''
      }`}
      data-designer-definition-node-id={node.id}
      style={projectDesignerItemStyle(
        node,
        parentContainer,
        interaction,
        designViewport,
        undefined,
        false,
        fitContentSizes.get(node.id),
      )}
    >
      <ComponentView
        node={node}
        designTime
        templateChildrenBounds={children.map((child) => child.bounds)}
        styleClassName={
          node.styleId === undefined ? undefined : (styleClassNames.get(node.styleId) ?? '')
        }
      >
        {reusableElement !== undefined ? (
          <ReusableDefinitionContent
            instance={node}
            reusableElement={reusableElement}
            reusableElementsById={reusableElementsById}
            styleClassNames={styleClassNames}
            interaction={interaction}
            ancestry={ancestry}
            designViewport={designViewport}
            scale={scale}
            floatingHost={floatingHost}
          />
        ) : (
          children.length > 0 && (
            <div
              className={`wr-runtime-children wr-runtime-children-${node.layout.container.mode}`}
              style={projectChildrenStyle(node)}
            >
              {children.map((child) => (
                <ReusableDefinitionNode
                  key={child.id}
                  node={child}
                  byId={byId}
                  reusableElementsById={reusableElementsById}
                  styleClassNames={styleClassNames}
                  fitContentSizes={fitContentSizes}
                  parentContainer={node.layout.container}
                  interaction={interaction}
                  ancestry={ancestry}
                  designViewport={designViewport}
                  scale={scale}
                  floatingHost={floatingHost}
                />
              ))}
            </div>
          )
        )}
      </ComponentView>
    </div>
  );
  return renderDesignerNode(node, floatingHost, element);
}

const RuntimeNode = memo(function RuntimeNode({
  node: savedNode,
  byId,
  reusableElementsById,
  styleClassNames,
  fitContentSizes,
  parentContainer,
  interaction,
  designViewport,
  scale,
  floatingHost,
  floatingEditorBounds,
}: RuntimeNodeProps): ReactElement {
  const node =
    componentRegistry.require(savedNode.type).projectLayout?.(savedNode, designViewport, {
      reusableElements: [...reusableElementsById.values()],
    }) ?? savedNode;
  const children = reusableVisualChildren(node, byId);
  const referencedReusableElementId = reusableElementId(node);
  const reusableElement =
    node.type === 'WebReusableElement' && referencedReusableElementId !== undefined
      ? reusableElementsById.get(referencedReusableElementId)
      : undefined;
  const supportsChildren = componentRegistry.get(node.type)?.canHaveChildren === true;
  const isContainer = supportsChildren || reusableElement !== undefined;
  const isFloatingContainerEditor = floatingEditorBounds !== undefined;
  const element = (
    <div
      className={`wr-runtime-node wr-runtime-item-${parentContainer.mode}${
        isContainer ? ' wr-runtime-container' : ''
      }${isFloatingContainerEditor ? ' wr-popup-designer-editor' : ''}`}
      data-designer-node-id={node.id}
      style={projectDesignerItemStyle(
        node,
        parentContainer,
        interaction,
        designViewport,
        floatingEditorBounds,
        isFloatingContainerEditor,
        fitContentSizes.get(node.id),
      )}
    >
      <ComponentView
        node={node}
        designTime
        templateChildrenBounds={children.map((child) => child.bounds)}
        forceVisible={isFloatingContainerEditor}
        styleClassName={
          node.styleId === undefined ? undefined : (styleClassNames.get(node.styleId) ?? '')
        }
      >
        {reusableElement !== undefined ? (
          <ReusableDefinitionContent
            instance={node}
            reusableElement={reusableElement}
            reusableElementsById={reusableElementsById}
            styleClassNames={styleClassNames}
            interaction={interaction}
            ancestry={[]}
            designViewport={designViewport}
            scale={scale}
            floatingHost={floatingHost}
          />
        ) : (
          supportsChildren && (
            <div
              className={`wr-runtime-children wr-runtime-children-${node.layout.container.mode}`}
              data-designer-parent-id={node.id}
              style={projectChildrenStyle(node)}
            >
              {children.map((child) => (
                <RuntimeNode
                  key={child.id}
                  node={child}
                  byId={byId}
                  reusableElementsById={reusableElementsById}
                  styleClassNames={styleClassNames}
                  fitContentSizes={fitContentSizes}
                  parentContainer={node.layout.container}
                  interaction={interaction}
                  designViewport={designViewport}
                  scale={scale}
                  floatingHost={floatingHost}
                />
              ))}
            </div>
          )
        )}
      </ComponentView>
    </div>
  );
  return renderDesignerNode(node, floatingHost, element, isFloatingContainerEditor);
});

function reorderTargetForPoint(
  parent: ComponentNode,
  draggedIds: readonly string[],
  point: Point,
  layoutById: ReadonlyMap<string, LayoutNode>,
): ReorderTarget | undefined {
  if (!isFlowMode(parent.layout.container.mode)) return undefined;
  const dragged = new Set(draggedIds);
  const siblings = parent.children
    .map((id) => layoutById.get(id))
    .filter((item): item is LayoutNode => item !== undefined && !dragged.has(item.node.id));
  if (siblings.length === 0) return undefined;

  const row = parent.layout.container.mode === 'row';
  const ordered = [...siblings].sort((left, right) => {
    const leftCross = row ? left.absoluteBounds.y : left.absoluteBounds.x;
    const rightCross = row ? right.absoluteBounds.y : right.absoluteBounds.x;
    if (leftCross !== rightCross) return leftCross - rightCross;
    const leftMain = row ? left.absoluteBounds.x : left.absoluteBounds.y;
    const rightMain = row ? right.absoluteBounds.x : right.absoluteBounds.y;
    return leftMain - rightMain;
  });

  let before: LayoutNode | undefined;
  if (!row) {
    before = ordered.find(
      (item) => point.y < item.absoluteBounds.y + item.absoluteBounds.height / 2,
    );
  } else {
    const rows: LayoutNode[][] = [];
    for (const item of ordered) {
      const currentRow = rows.at(-1);
      const reference = currentRow?.[0];
      const sameRow =
        reference !== undefined &&
        Math.abs(item.absoluteBounds.y - reference.absoluteBounds.y) <=
          Math.max(4, Math.min(item.absoluteBounds.height, reference.absoluteBounds.height) / 2);
      if (!sameRow || currentRow === undefined) rows.push([item]);
      else currentRow.push(item);
    }
    const firstRow = rows[0];
    const lastRow = rows.at(-1);
    if (firstRow !== undefined && lastRow !== undefined) {
      const firstBounds = firstRow[0]?.absoluteBounds;
      const lastBounds = lastRow.at(-1)?.absoluteBounds;
      if (firstBounds !== undefined && point.y < firstBounds.y) {
        before = firstRow[0];
      } else if (lastBounds !== undefined && point.y <= lastBounds.y + lastBounds.height) {
        const targetRow = rows.reduce((closest, candidate) => {
          const closestBounds = closest[0]?.absoluteBounds;
          const candidateBounds = candidate[0]?.absoluteBounds;
          if (closestBounds === undefined || candidateBounds === undefined) return closest;
          const closestDistance = Math.abs(point.y - (closestBounds.y + closestBounds.height / 2));
          const candidateDistance = Math.abs(
            point.y - (candidateBounds.y + candidateBounds.height / 2),
          );
          return candidateDistance < closestDistance ? candidate : closest;
        }, firstRow);
        before = targetRow.find(
          (item) => point.x < item.absoluteBounds.x + item.absoluteBounds.width / 2,
        );
        if (before === undefined) {
          const rowIndex = rows.indexOf(targetRow);
          before = rowIndex < rows.length - 1 ? rows[rowIndex + 1]?.[0] : undefined;
        }
      }
    }
  }
  if (before !== undefined) {
    const bounds = before.absoluteBounds;
    return {
      parentId: parent.id,
      beforeComponentId: before.node.id,
      indicatorBounds: row
        ? { x: bounds.x - 2, y: bounds.y, width: 4, height: bounds.height }
        : { x: bounds.x, y: bounds.y - 2, width: bounds.width, height: 4 },
    };
  }

  const last = ordered.at(-1);
  if (last === undefined) return undefined;
  const bounds = last.absoluteBounds;
  return {
    parentId: parent.id,
    beforeComponentId: null,
    indicatorBounds: row
      ? { x: bounds.x + bounds.width - 2, y: bounds.y, width: 4, height: bounds.height }
      : { x: bounds.x, y: bounds.y + bounds.height - 2, width: bounds.width, height: 4 },
  };
}

function hasReorderChanged(
  parent: ComponentNode,
  componentIds: readonly string[],
  beforeComponentId: string | null,
): boolean {
  if (componentIds.length !== 1) return true;
  const componentId = componentIds[0];
  if (componentId === undefined) return false;
  const originalIndex = parent.children.indexOf(componentId);
  if (originalIndex < 0) return false;
  const nextSibling =
    parent.children.slice(originalIndex + 1).find((id) => id !== componentId) ?? null;
  return beforeComponentId !== nextSibling;
}

export function DesignerSurface({
  previewTheme = 'light',
  viewportName: controlledViewportName,
  onViewportChange,
  showToolbar = true,

  page,
  reusableElements = [],
  settings,
  styles = [],
  compiledStylesCss = '',
  selectedIds,
  selectedPaletteType,
  onCancelInsertion,
  zoom,
  onSelect,
  onAddComponent,
  onAddReusableElement,
  onMoveComponents,
  onReorderComponents,
  onReparentComponents,
  onResizeComponent,
  onDeleteSelection,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onBringToFront,
  onSendToBack,
  onZoomChange,
  onComponentActivate,
  onOpenReusableElement,
}: DesignerSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const availableWidth = useDesignerAvailableWidth(scrollRef);
  const [floatingHost, setFloatingHost] = useState<HTMLElement | null>(null);
  const [localViewportName, setLocalViewportName] = useState<ViewportName>('desktop');
  const viewportName = controlledViewportName ?? localViewportName;
  const interactionContext = useMemo(
    () => ({ page, zoom, viewportName, availableWidth, settings, selectedPaletteType }),
    [page, zoom, viewportName, availableWidth, settings, selectedPaletteType],
  );
  const pointerInteraction = useDesignerPointerInteraction<Interaction>(interactionContext);
  const dropFeedback = useDesignerDropFeedback<DesignerInsertionPreview>(
    interactionContext,
    onCancelInsertion,
  );
  const { interaction } = pointerInteraction;
  const setViewportName = (value: ViewportName): void => {
    setLocalViewportName(value);
    onViewportChange?.(value);
  };
  const [measuredBounds, setMeasuredBounds] = useState<ReadonlyMap<string, Bounds>>(
    () => new Map(),
  );
  const [fitContentSizes, setFitContentSizes] = useState<
    ReadonlyMap<string, RuntimeFitContentSize>
  >(() => new Map());
  const scale = zoom / 100;
  const viewport = VIEWPORTS[viewportName];
  const byId = useMemo(() => new Map(page.components.map((node) => [node.id, node])), [page]);
  const root = byId.get(page.rootComponentId);
  const responsiveWidth =
    viewport.width ?? (availableWidth === undefined ? page.width : availableWidth / scale);
  const rootSurface =
    root === undefined
      ? undefined
      : componentRegistry
          .get(root.type)
          ?.designSurface?.(root, { document: page, reusableElements });
  const previewWidth = Number(viewport.width ?? rootSurface?.width ?? responsiveWidth);

  const rootFitContentSize = root === undefined ? undefined : fitContentSizes.get(root.id);
  const viewportWidth = Number(
    root?.layout.item.width === 'fit-content' && rootFitContentSize?.width !== undefined
      ? rootFitContentSize.width
      : previewWidth,
  );
  const viewportHeight = Number(
    root?.layout.item.height === 'fit-content' && rootFitContentSize?.height !== undefined
      ? rootFitContentSize.height
      : (rootSurface?.height ?? page.height),
  );
  const reusableElementsById = useMemo(
    () => new Map(reusableElements.map((reusableElement) => [reusableElement.id, reusableElement])),
    [reusableElements],
  );
  const styleClassNames = useMemo(
    () => new Map(styles.map((style) => [style.id, resolveComponentStyleClassName(style)])),
    [styles],
  );
  const floatingContainerEditorNodeId = useMemo(
    () => floatingContainerEditorRootId(selectedIds, byId),
    [byId, selectedIds],
  );
  const floatingContainerEditorNode =
    floatingContainerEditorNodeId === undefined
      ? undefined
      : byId.get(floatingContainerEditorNodeId);
  const floatingContainerEditor = useMemo<FloatingContainerEditor | undefined>(() => {
    if (floatingContainerEditorNode === undefined) return undefined;
    const currentRoot = page.components.find((node) => node.id === page.rootComponentId);
    const currentRootFitContentSize =
      currentRoot === undefined ? undefined : fitContentSizes.get(currentRoot.id);
    const currentViewportWidth =
      currentRoot?.layout.item.width === 'fit-content' &&
      currentRootFitContentSize?.width !== undefined
        ? currentRootFitContentSize.width
        : previewWidth;
    const currentViewportHeight =
      currentRoot?.layout.item.height === 'fit-content' &&
      currentRootFitContentSize?.height !== undefined
        ? currentRootFitContentSize.height
        : page.height;
    const centeredBounds = centeredFloatingContainerBounds(floatingContainerEditorNode, {
      width: currentViewportWidth,
      height: currentViewportHeight,
    });
    return {
      rootId: floatingContainerEditorNode.id,
      bounds:
        interaction?.kind === 'resize' && interaction.id === floatingContainerEditorNode.id
          ? interaction.currentBounds
          : centeredBounds,
    };
  }, [fitContentSizes, floatingContainerEditorNode, interaction, page, previewWidth]);
  const layout = useMemo(
    () => buildLayout(page, byId, measuredBounds, floatingContainerEditor),
    [byId, floatingContainerEditor, measuredBounds, page],
  );
  const layoutById = useMemo(() => new Map(layout.map((item) => [item.node.id, item])), [layout]);
  const rootStyleClassName =
    root?.styleId === undefined ? undefined : (styleClassNames.get(root.styleId) ?? '');
  const nonvisualComponents = useMemo(
    () =>
      page.components.filter(
        (node) => node.id !== page.rootComponentId && appearsInDesignerTray(node.type),
      ),
    [page],
  );
  const automaticLayout = useCallback(
    (node: ComponentNode) =>
      componentRegistry
        .get(node.type)
        ?.automaticLayout?.(node, { document: page, reusableElements }) === true,
    [page, reusableElements],
  );
  const selectedVisualIds = useMemo(
    () =>
      selectedIds.filter(
        (id) =>
          id !== page.rootComponentId &&
          (appearsOnDesignerCanvas(byId.get(id)?.type ?? '') ||
            id === floatingContainerEditorNodeId),
      ),
    [byId, floatingContainerEditorNodeId, page.rootComponentId, selectedIds],
  );
  const positionMovableSelectedIds = useMemo(() => {
    const topLevelIds = normalizeTopLevelIds(page, selectedVisualIds);
    const allFixed = topLevelIds.every((id) => {
      const node = byId.get(id);
      return (
        node !== undefined &&
        !isDesignerFloatingContainer(node) &&
        parentModeOf(node, byId) === 'fixed' &&
        !automaticLayout(node)
      );
    });
    const first = topLevelIds[0] === undefined ? undefined : byId.get(topLevelIds[0]);
    const signature = first === undefined ? undefined : movementSignature(first);
    const matchingAxes =
      signature !== undefined &&
      topLevelIds.every((id) => {
        const node = byId.get(id);
        return node !== undefined && movementSignature(node) === signature;
      });
    return allFixed && matchingAxes ? topLevelIds : [];
  }, [byId, page, selectedVisualIds, automaticLayout]);

  const measureLayout = useCallback((): void => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const surfaceBounds = surface.getBoundingClientRect();
    if (surfaceBounds.width <= 0 || surfaceBounds.height <= 0) return;
    const horizontalScale =
      surface.clientWidth > 0 ? surface.clientWidth / surfaceBounds.width : 1 / scale;
    const verticalScale =
      surface.clientHeight > 0 ? surface.clientHeight / surfaceBounds.height : 1 / scale;
    const next = new Map<string, Bounds>();
    for (const element of surface.querySelectorAll<HTMLElement>('[data-designer-node-id]')) {
      const id = element.dataset.designerNodeId;
      if (id === undefined) continue;
      const bounds = element.getBoundingClientRect();
      next.set(id, {
        x: (bounds.left - surfaceBounds.left) * horizontalScale,
        y: (bounds.top - surfaceBounds.top) * verticalScale,
        width: bounds.width * horizontalScale,
        height: bounds.height * verticalScale,
      });
    }
    setMeasuredBounds((current) => (sameBoundsMap(current, next) ? current : next));
  }, [scale]);

  const measureFitContentSizes = useCallback((): void => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const next = new Map<string, RuntimeFitContentSize>();
    const nodesByDesignerId = new Map<string, HTMLElement>();
    for (const element of surface.querySelectorAll<HTMLElement>('[data-designer-node-id]')) {
      const nodeId = element.dataset.designerNodeId;
      if (nodeId !== undefined) nodesByDesignerId.set(nodeId, element);
    }
    const rootElement = Array.from(
      surface.querySelectorAll<HTMLElement>('[data-component-id]'),
    ).find((element) => element.dataset.componentId === page.rootComponentId);

    for (const savedNode of page.components) {
      const node =
        componentRegistry
          .require(savedNode.type)
          .projectLayout?.(
            savedNode,
            { width: viewportWidth, height: viewportHeight, responsiveWidth: responsiveWidth },
            { reusableElements },
          ) ?? savedNode;
      if (!shouldMeasureDesignerFitContent(node, node.id === page.rootComponentId)) {
        continue;
      }
      const target =
        node.id === page.rootComponentId ? rootElement : nodesByDesignerId.get(node.id);
      if (target === undefined) continue;
      const component =
        node.id === page.rootComponentId
          ? target
          : Array.from(target.children).find(
              (child): child is HTMLElement =>
                child instanceof HTMLElement && child.dataset.componentId === node.id,
            );
      if (component === undefined) continue;

      // The wrapper receives the computed item size, while the ComponentView
      // owns visual padding and borders. Measure its actual border box so the
      // fitted wrapper has room for both sides of that visual surface.
      const size = measureDesignerFitContentSize(component, fitContentHost(component, node), node, {
        scale,
        isLayoutChild: (child) => {
          const childNodeId = child.dataset.designerNodeId;
          const childNode = childNodeId === undefined ? undefined : byId.get(childNodeId);
          return childNode === undefined || !isDesignerFloatingContainer(childNode);
        },
      });
      if (size.width !== undefined || size.height !== undefined) next.set(node.id, size);
    }
    setFitContentSizes((current) => (sameFitContentSizeMap(current, next) ? current : next));
  }, [
    byId,
    page.components,
    page.rootComponentId,
    scale,
    reusableElements,
    viewportWidth,
    viewportHeight,
    responsiveWidth,
  ]);

  useLayoutEffect(() => {
    // A tray-authored visual container is mounted into the floating portal
    // only while it (or a descendant) is selected. Its DOM geometry can
    // therefore change without a project-model change; refresh it before the
    // overlay paints instead of reusing the previous opening's measurements.
    measureFitContentSizes();
    measureLayout();
  }, [
    fitContentSizes,
    floatingContainerEditorNodeId,
    floatingHost,
    interaction,
    measureFitContentSizes,
    measureLayout,
    page,
    viewportHeight,
    viewportWidth,
  ]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    // Scroll offsets change child client rectangles without changing their
    // size, so ResizeObserver alone cannot keep selection hit targets aligned
    // inside scrolling containers such as Popup.
    const refreshMeasurements = (): void => {
      measureFitContentSizes();
      measureLayout();
    };
    surface.addEventListener('scroll', refreshMeasurements, true);
    surface.addEventListener('transitionend', refreshMeasurements, true);
    return () => {
      surface.removeEventListener('scroll', refreshMeasurements, true);
      surface.removeEventListener('transitionend', refreshMeasurements, true);
    };
  }, [measureFitContentSizes, measureLayout]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') return undefined;
    let frame: number | undefined;
    const scheduleMeasure = (): void => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        measureFitContentSizes();
        measureLayout();
      });
    };
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(surface);
    for (const element of surface.querySelectorAll<HTMLElement>(
      '[data-designer-node-id], [data-designer-definition-node-id]',
    )) {
      observer.observe(element);
    }
    scheduleMeasure();
    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [
    floatingContainerEditorNodeId,
    floatingHost,
    measureFitContentSizes,
    measureLayout,
    page.components,
    viewportHeight,
    viewportWidth,
  ]);

  const eventPoint = (event: { clientX: number; clientY: number }): Point => {
    const rectangle = surfaceRef.current?.getBoundingClientRect();
    if (!rectangle) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rectangle.left) / scale,
      y: (event.clientY - rectangle.top) / scale,
    };
  };

  const insertionTarget = (
    point: Point,
    excludedIds: ReadonlySet<string> = new Set(),
    movingIds: readonly string[] = [],
  ): {
    parentId: string;
    point: Point;
    origin: Point;
    beforeComponentId?: string | null;
    indicatorBounds?: Bounds;
  } => {
    const candidates = [...layout]
      .reverse()
      .filter(
        (item) =>
          componentRegistry.get(item.node.type)?.canHaveChildren === true &&
          !excludedIds.has(item.node.id) &&
          pointInside(item.absoluteBounds, point),
      );
    const parent = candidates[0];
    const parentId = parent?.node.id ?? page.rootComponentId;
    const host = measureDesignerChildrenHost(surfaceRef.current, parentId, scale);
    const origin = host?.origin ?? {
      x: parent?.absoluteBounds.x ?? 0,
      y: parent?.absoluteBounds.y ?? 0,
    };
    const targetParent = byId.get(parentId);
    const reorder =
      targetParent === undefined
        ? undefined
        : reorderTargetForPoint(targetParent, movingIds, point, layoutById);
    const flow = targetParent !== undefined && isFlowMode(targetParent.layout.container.mode);
    const padding = targetParent?.layout.container;
    const emptyIndicator =
      !flow || targetParent === undefined
        ? undefined
        : {
            x: origin.x + (padding?.paddingLeft ?? 0),
            y: origin.y + (padding?.paddingTop ?? 0),
            width:
              padding?.mode === 'row'
                ? 4 / scale
                : Math.max(
                    24,
                    (host?.bounds.width ?? targetParent.bounds.width) -
                      (padding?.paddingLeft ?? 0) -
                      (padding?.paddingRight ?? 0),
                  ),
            height: padding?.mode === 'row' ? 32 : 4 / scale,
          };
    return {
      parentId,
      point: { x: Math.max(0, point.x - origin.x), y: Math.max(0, point.y - origin.y) },
      origin,
      ...(flow
        ? {
            beforeComponentId: reorder?.beforeComponentId ?? null,
            indicatorBounds: reorder?.indicatorBounds ?? emptyIndicator,
          }
        : {}),
    };
  };

  const reparentTargetForDrag = (
    ids: readonly string[],
    point: Point,
    delta: Point,
    originalAbsoluteBounds: ReadonlyMap<string, Bounds>,
  ): ReparentTarget | undefined => {
    // Without a structural command, keep both preview and commit on the normal
    // parent-constrained movement path instead of previewing an unsavable drop.
    if (onReparentComponents === undefined) return undefined;
    const nodes = ids
      .map((id) => byId.get(id))
      .filter((node): node is ComponentNode => node !== undefined);
    if (
      nodes.length !== ids.length ||
      nodes.some((node) => isFloatingComponent(node) || automaticLayout(node))
    )
      return undefined;
    const sourceParents = new Set(nodes.map((node) => node.parentId));
    const excludedIds = collectSubtreeIds(page, ids);
    const target = insertionTarget(point, excludedIds, ids);
    if (sourceParents.size === 1 && sourceParents.has(target.parentId)) return undefined;
    const parent = byId.get(target.parentId);
    if (parent === undefined || componentRegistry.get(parent.type)?.canHaveChildren !== true)
      return undefined;

    const host = measureDesignerChildrenHost(surfaceRef.current, parent.id, scale);
    const origin = host?.origin ?? layoutById.get(parent.id)?.absoluteBounds ?? { x: 0, y: 0 };
    const bounds = new Map<string, Bounds>(
      nodes.map((node) => {
        const visual =
          originalAbsoluteBounds.get(node.id) ??
          layoutById.get(node.id)?.absoluteBounds ??
          node.bounds;
        const margins = measureDesignerNodeMargins(surfaceRef.current, node.id);
        return [
          node.id,
          {
            ...node.bounds,
            x: visual.x + delta.x - origin.x - margins.left,
            y: visual.y + delta.y - origin.y - margins.top,
          },
        ] as const;
      }),
    );
    const path: string[] = [];
    let ancestor: ComponentNode | undefined = parent;
    const visited = new Set<string>();
    while (ancestor !== undefined && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      path.unshift(ancestor.name);
      ancestor = ancestor.parentId === null ? undefined : byId.get(ancestor.parentId);
    }
    const flow = isFlowMode(parent.layout.container.mode);
    const firstNode = nodes[0];
    const firstVisual =
      firstNode === undefined
        ? undefined
        : (originalAbsoluteBounds.get(firstNode.id) ??
          layoutById.get(firstNode.id)?.absoluteBounds ??
          firstNode.bounds);
    const rowHost =
      componentRegistry.get(parent.type)?.designerChildHost === 'repeating-row' ? host : undefined;
    return {
      parentId: parent.id,
      bounds,
      beforeComponentId: flow ? (target.beforeComponentId ?? null) : null,
      preview: {
        parentId: parent.id,
        parentBounds: rowHost
          ? { ...rowHost.bounds, x: rowHost.origin.x, y: rowHost.origin.y }
          : (layoutById.get(parent.id)?.absoluteBounds ?? {
              x: 0,
              y: 0,
              width: viewportWidth,
              height: viewportHeight,
            }),
        parentPath: path.join(' › '),
        componentLabel:
          nodes.length === 1 ? (nodes[0]?.name ?? 'Component') : `${nodes.length} components`,
        detail: flow
          ? `${parent.layout.container.mode === 'row' ? 'Row' : 'Column'} · ${
              target.beforeComponentId
                ? `Before ${byId.get(target.beforeComponentId)?.name ?? 'component'}`
                : 'At the end'
            }`
          : 'Move into this container',
        ...(!flow && firstVisual !== undefined
          ? {
              ghostBounds: {
                ...firstVisual,
                x: firstVisual.x + delta.x,
                y: firstVisual.y + delta.y,
              },
            }
          : {}),
        ...(flow && target.indicatorBounds !== undefined
          ? { indicatorBounds: target.indicatorBounds }
          : {}),
        tray: false,
        invalid: false,
      },
    };
  };

  const insertionPreview = (
    payload: DesignerDragPayload,
    point: Point,
  ): DesignerInsertionPreview | null => {
    const reusable = payload.kind === 'reusable' ? reusableElementsById.get(payload.id) : undefined;
    const definition = componentRegistry.get(
      payload.kind === 'component' ? payload.type : 'WebReusableElement',
    );
    if (
      definition === undefined ||
      definition.type === 'WebPage' ||
      (payload.kind === 'reusable' && reusable === undefined)
    )
      return null;
    const tray = resolveComponentDesignerPresentation(definition) === 'tray';
    const target: ReturnType<typeof insertionTarget> = tray
      ? { parentId: page.rootComponentId, point: { x: 0, y: 0 }, origin: { x: 0, y: 0 } }
      : insertionTarget(point);
    const parent = byId.get(target.parentId);
    if (parent === undefined) return null;
    const bounds = projectInsertionBounds(
      target.point,
      reusable ?? definition.defaultBounds,
      designerInsertionBounds(parent, page, surfaceRef.current, scale),
      settings.snapToGrid ? settings.gridSize : undefined,
    );
    const path: string[] = [];
    let ancestor: ComponentNode | undefined = parent;
    const visited = new Set<string>();
    while (ancestor !== undefined && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      path.unshift(ancestor.name);
      ancestor = ancestor.parentId === null ? undefined : byId.get(ancestor.parentId);
    }
    const invalid = payload.kind === 'reusable' && payload.id === page.id;
    const before = target.beforeComponentId ? byId.get(target.beforeComponentId) : undefined;
    const flow = !tray && isFlowMode(parent.layout.container.mode);
    const automatic =
      definition.automaticLayout?.(
        componentRegistry.createComponent(definition.type, {
          id: 'designer-insertion-preview',
          parentId: parent.id,
          ...(reusable ? { props: { reusableElementId: reusable.id } } : {}),
        }),
        { document: page, reusableElements },
      ) === true;
    const rowHost =
      componentRegistry.get(parent.type)?.designerChildHost === 'repeating-row'
        ? measureDesignerChildrenHost(surfaceRef.current, parent.id, scale)
        : undefined;
    const detail = invalid
      ? 'A reusable cannot contain itself'
      : tray
        ? 'Add to the nonvisual tray'
        : automatic
          ? 'Automatic placement'
          : flow
            ? `${parent.layout.container.mode === 'row' ? 'Row' : 'Column'} · ${before ? `Before ${before.name}` : 'At the end'}`
            : `X ${Math.round(bounds.x)} · Y ${Math.round(bounds.y)}${settings.snapToGrid ? ` · Grid ${settings.gridSize}` : ''}`;
    return {
      parentId: parent.id,
      parentBounds: rowHost
        ? { ...rowHost.bounds, x: rowHost.origin.x, y: rowHost.origin.y }
        : (layoutById.get(parent.id)?.absoluteBounds ?? {
            x: 0,
            y: 0,
            width: viewportWidth,
            height: viewportHeight,
          }),
      parentPath: tray ? 'Nonvisual Components' : path.join(' › '),
      componentLabel: reusable?.name ?? definition.displayName,
      detail,
      ...(!tray && !invalid && !flow && !automatic
        ? {
            ghostBounds: {
              ...bounds,
              x: bounds.x + target.origin.x,
              y: bounds.y + target.origin.y,
            },
          }
        : {}),
      ...(!tray && !invalid && flow ? { indicatorBounds: target.indicatorBounds } : {}),
      tray,
      invalid,
    };
  };

  const supportsDesignerDrag = (event: DragEvent<HTMLDivElement>): boolean =>
    Array.from(event.dataTransfer.types ?? []).some(
      (type) => type === WEBRAD_COMPONENT_DRAG_TYPE || type === WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE,
    );

  const dragPayload = (event: DragEvent<HTMLDivElement>): DesignerDragPayload | null => {
    const reusableId = event.dataTransfer.getData(WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE);
    if (reusableId) return { kind: 'reusable', id: reusableId };
    const type = event.dataTransfer.getData(WEBRAD_COMPONENT_DRAG_TYPE);
    if (type) return { kind: 'component', type };
    return supportsDesignerDrag(event) ? getDesignerDragPayload() : null;
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    const payload = dragPayload(event);
    // Chromium protects the values during native/cross-window dragover. Allow
    // supported MIME types through, then validate their real values on drop.
    if (payload === null && supportsDesignerDrag(event)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      dropFeedback.clear();
      return;
    }
    const preview = payload === null ? null : insertionPreview(payload, eventPoint(event));
    if (preview === null) {
      dropFeedback.clear();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = preview.invalid ? 'none' : 'copy';
    dropFeedback.show(preview);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
      return;
    const rectangle = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX > rectangle.left &&
      event.clientX < rectangle.right &&
      event.clientY > rectangle.top &&
      event.clientY < rectangle.bottom
    )
      return;
    dropFeedback.clear();
  };

  const insertAt = (type: string, point: Point): void => {
    dropFeedback.clear();
    if (appearsInDesignerTray(type)) {
      onAddComponent(type, { x: 0, y: 0 }, page.rootComponentId);
      return;
    }
    const target = insertionTarget(point);
    if (target.beforeComponentId !== undefined)
      onAddComponent(type, target.point, target.parentId, target.beforeComponentId);
    else onAddComponent(type, target.point, target.parentId);
  };

  const insertReusableElementAt = (reusableElementId: string, point: Point): void => {
    dropFeedback.clear();
    if (reusableElementId === page.id) return;
    const target = insertionTarget(point);
    if (target.beforeComponentId !== undefined)
      onAddReusableElement?.(
        reusableElementId,
        target.point,
        target.parentId,
        target.beforeComponentId,
      );
    else onAddReusableElement?.(reusableElementId, target.point, target.parentId);
  };

  const activateComponent = (componentId: string): void => {
    const component = byId.get(componentId);
    const referencedReusableElementId =
      component === undefined ? undefined : reusableElementId(component);
    if (referencedReusableElementId !== undefined && onOpenReusableElement !== undefined) {
      onOpenReusableElement(referencedReusableElementId);
      return;
    }
    if (onComponentActivate !== undefined) {
      onComponentActivate(componentId);
      return;
    }
  };

  const startComponentDrag = (event: PointerEvent<HTMLDivElement>, node: ComponentNode): void => {
    if (event.button !== 0 || pointerInteraction.get() !== null) return;
    event.stopPropagation();
    event.preventDefault();
    surfaceRef.current?.focus({ preventScroll: true });
    const point = eventPoint(event);
    if (selectedPaletteType) {
      insertAt(selectedPaletteType, point);
      return;
    }
    if (event.shiftKey) {
      const next = selectedIds.includes(node.id)
        ? selectedIds.filter((id) => id !== node.id)
        : [...selectedIds, node.id];
      onSelect(next, node.id);
      return;
    }
    const selection = selectedIds.includes(node.id) ? selectedIds : [node.id];
    onSelect(selection, node.id);
    const ids = normalizeTopLevelIds(page, selection).filter((id) => id !== page.rootComponentId);
    // Tray-authored visual containers are intentionally centered by their
    // editor/runtime host, so their page coordinates are never mutated.
    if (isDesignerFloatingContainer(node) || automaticLayout(node)) return;
    const parentMode = parentModeOf(node, byId);
    // Anchored components have no safe x/y mutation. Selection and resize are
    // retained; an anchor-aware command can be supplied later by the host.
    if (parentMode === 'align-to-parent') return;

    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    const canReorder =
      parent !== undefined &&
      isFlowMode(parentMode) &&
      ids.length === 1 &&
      ids.every((id) => byId.get(id)?.parentId === parent.id);
    const firstSelected = ids[0] === undefined ? undefined : byId.get(ids[0]);
    const selectedSignature =
      firstSelected === undefined ? undefined : movementSignature(firstSelected);
    const canMove =
      selectedSignature !== undefined &&
      ids.every((id) => {
        const selected = byId.get(id);
        return (
          selected !== undefined &&
          parentModeOf(selected, byId) === 'fixed' &&
          movementSignature(selected) === selectedSignature &&
          !automaticLayout(selected)
        );
      });
    // Flow items have no meaningful x/y to mutate. Block a mixed selection
    // rather than accidentally issuing a MoveCommand for invisible bounds.
    if (!canReorder && !canMove) return;
    const originalBounds = new Map<string, Bounds>();
    const originalAbsoluteBounds = new Map<string, Bounds>();
    const absolute = ids
      .map((id) => layoutById.get(id))
      .filter((item): item is LayoutNode => item !== undefined)
      .map((item) => {
        originalBounds.set(item.node.id, item.node.bounds);
        originalAbsoluteBounds.set(item.node.id, item.absoluteBounds);
        return item.absoluteBounds;
      });
    if (absolute.length === 0) return;
    pointerInteraction.begin(
      {
        kind: 'drag',
        mode: canReorder ? 'reorder' : 'move',
        pointerId: event.pointerId,
        start: point,
        ids,
        originalBounds,
        originalAbsoluteBounds,
        selectionBounds: unionBounds(absolute),
        constraints: movementConstraintsForIds(
          page,
          byId,
          ids,
          surfaceRef.current,
          scale,
          layoutById,
        ),
        delta: { x: 0, y: 0 },
        activated: false,
        ...(canReorder && parent !== undefined
          ? { reorderTarget: reorderTargetForPoint(parent, ids, point, layoutById) }
          : {}),
      },
      event.currentTarget,
    );
  };

  const startResize = (
    event: PointerEvent<HTMLDivElement>,
    node: ComponentNode,
    handle: ResizeHandle,
  ): void => {
    if (
      event.button !== 0 ||
      pointerInteraction.get() !== null ||
      !boundsResizeHandles(node, parentModeOf(node, byId), automaticLayout(node)).includes(handle)
    )
      return;
    event.stopPropagation();
    event.preventDefault();
    surfaceRef.current?.focus({ preventScroll: true });
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const parentHost =
      parent === undefined
        ? undefined
        : measureDesignerChildrenHost(surfaceRef.current, parent.id, scale);
    const measuredParent =
      parentHost?.bounds ??
      (parent === undefined ? undefined : layoutById.get(parent.id)?.absoluteBounds);
    const isFloatingContainerEditor =
      isDesignerFloatingContainer(node) && node.id === floatingContainerEditor?.rootId;
    const editorBounds = isFloatingContainerEditor
      ? (layoutById.get(node.id)?.absoluteBounds ?? floatingContainerEditor?.bounds ?? node.bounds)
      : node.bounds;
    const visualBounds = layoutById.get(node.id)?.absoluteBounds;
    const useParentHost =
      parentHost !== undefined &&
      visualBounds !== undefined &&
      !isFloatingComponent(node) &&
      !isFloatingContainerEditor;
    const margins = measureDesignerNodeMargins(surfaceRef.current, node.id);
    const viewportOwned = isFloatingComponent(node) || isFloatingContainerEditor;
    const containerBounds: Bounds = useParentHost
      ? {
          x: editorBounds.x - (visualBounds.x - parentHost.origin.x) + margins.left,
          y: editorBounds.y - (visualBounds.y - parentHost.origin.y) + margins.top,
          width: Math.max(0, parentHost.bounds.width - margins.left - margins.right),
          height: Math.max(0, parentHost.bounds.height - margins.top - margins.bottom),
        }
      : {
          x: 0,
          y: 0,
          width: viewportOwned
            ? viewportWidth
            : (measuredParent?.width ?? parent?.bounds.width ?? viewportWidth),
          height: viewportOwned
            ? viewportHeight
            : (measuredParent?.height ?? parent?.bounds.height ?? viewportHeight),
        };
    pointerInteraction.begin(
      {
        kind: 'resize',
        pointerId: event.pointerId,
        start: eventPoint(event),
        id: node.id,
        handle,
        originalBounds: editorBounds,
        originalVisualBounds: visualBounds,
        currentBounds: editorBounds,
        activated: false,
        containerBounds,
      },
      event.currentTarget,
    );
  };

  const startMarquee = (event: PointerEvent<HTMLDivElement>): void => {
    if (
      event.button !== 0 ||
      event.target !== event.currentTarget ||
      pointerInteraction.get() !== null
    )
      return;
    event.preventDefault();
    surfaceRef.current?.focus({ preventScroll: true });
    const point = eventPoint(event);
    if (selectedPaletteType) {
      insertAt(selectedPaletteType, point);
      return;
    }
    pointerInteraction.begin(
      {
        kind: 'marquee',
        pointerId: event.pointerId,
        start: point,
        current: point,
        additive: event.shiftKey,
      },
      event.currentTarget,
    );
  };

  const advanceInteraction = (
    active: Interaction,
    event: PointerEvent<HTMLDivElement>,
  ): Interaction => {
    const current = eventPoint(event);
    const requested = { x: current.x - active.start.x, y: current.y - active.start.y };
    if (
      active.kind !== 'marquee' &&
      !active.activated &&
      Math.hypot(requested.x, requested.y) * scale < 3
    ) {
      return active;
    }
    const interaction = active;
    if (interaction.kind === 'drag') {
      const requestedTarget = reparentTargetForDrag(
        interaction.ids,
        current,
        requested,
        interaction.originalAbsoluteBounds,
      );
      if (requestedTarget !== undefined) {
        const delta = constrainMovementDelta(interaction.selectionBounds, requested, {
          snapToGrid: settings.snapToGrid,
          gridSize: settings.gridSize,
          containerBounds: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
        });
        const target =
          reparentTargetForDrag(
            interaction.ids,
            current,
            delta,
            interaction.originalAbsoluteBounds,
          ) ?? requestedTarget;
        return {
          ...interaction,
          delta,
          activated: true,
          reparentTarget: target,
          reorderTarget: undefined,
        };
      }
      if (interaction.mode === 'reorder') {
        const firstId = interaction.ids[0];
        const dragged = firstId === undefined ? undefined : byId.get(firstId);
        const parent = dragged?.parentId === null ? undefined : byId.get(dragged?.parentId ?? '');
        return {
          ...interaction,
          activated: true,
          reparentTarget: undefined,
          reorderTarget:
            parent === undefined
              ? undefined
              : reorderTargetForPoint(parent, interaction.ids, current, layoutById),
        };
      }
      const delta = constrainMovementDelta(interaction.selectionBounds, requested, {
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize,
        containerBounds: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
        constraints: interaction.constraints,
      });
      return { ...interaction, delta, activated: true, reparentTarget: undefined };
    } else if (interaction.kind === 'resize') {
      const node = byId.get(interaction.id);
      const resizeOptions = {
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize,
        minWidth: 8,
        minHeight: 8,
        containerBounds: interaction.containerBounds,
      };
      const currentBounds =
        node !== undefined && isFloatingComponent(node)
          ? floatingPersistedBounds(
              node,
              resizeBounds(
                interaction.originalVisualBounds ??
                  floatingVisualBounds(node, interaction.originalBounds, {
                    width: viewportWidth,
                    height: viewportHeight,
                  }),
                interaction.handle,
                requested,
                resizeOptions,
              ),
              { width: viewportWidth, height: viewportHeight },
              interaction.originalVisualBounds,
            )
          : resizeBounds(interaction.originalBounds, interaction.handle, requested, resizeOptions);
      return {
        ...interaction,
        currentBounds,
        activated: true,
      };
    } else {
      return { ...interaction, current };
    }
  };

  const updateInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    const active = pointerInteraction.get();
    if (active?.pointerId !== event.pointerId) return;
    pointerInteraction.preview(advanceInteraction(active, event));
  };

  const finishInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    const active = pointerInteraction.get();
    if (active?.pointerId !== event.pointerId) return;
    // pointerup is authoritative even when the browser coalesced the last move
    // or the scheduled preview frame has not rendered yet.
    const interaction = advanceInteraction(active, event);
    pointerInteraction.end(event.pointerId);
    if (interaction.kind !== 'marquee' && !interaction.activated) return;
    if (interaction.kind === 'drag') {
      if (interaction.reparentTarget !== undefined) {
        onReparentComponents?.(
          interaction.ids,
          interaction.reparentTarget.parentId,
          interaction.reparentTarget.bounds,
          interaction.reparentTarget.beforeComponentId,
        );
      } else if (
        interaction.mode === 'move' &&
        (interaction.delta.x !== 0 || interaction.delta.y !== 0)
      ) {
        const first = interaction.ids[0] === undefined ? undefined : byId.get(interaction.ids[0]);
        onMoveComponents(
          interaction.ids,
          first === undefined ? interaction.delta : movementDeltaForNode(first, interaction.delta),
        );
      } else if (interaction.mode === 'reorder') {
        const firstId = interaction.ids[0];
        const dragged = firstId === undefined ? undefined : byId.get(firstId);
        const parent = dragged?.parentId === null ? undefined : byId.get(dragged?.parentId ?? '');
        const target =
          parent === undefined
            ? undefined
            : reorderTargetForPoint(parent, interaction.ids, eventPoint(event), layoutById);
        if (
          parent !== undefined &&
          target !== undefined &&
          hasReorderChanged(parent, interaction.ids, target.beforeComponentId)
        ) {
          onReorderComponents?.(target.parentId, interaction.ids, target.beforeComponentId);
        }
      }
    } else if (interaction.kind === 'resize') {
      const node = byId.get(interaction.id);
      const nextBounds =
        node !== undefined && isDesignerFloatingContainer(node)
          ? { ...interaction.currentBounds, x: 0, y: 0 }
          : interaction.currentBounds;
      if (node !== undefined && !sameBounds(node.bounds, nextBounds)) {
        onResizeComponent(interaction.id, nextBounds);
      }
    } else {
      const bounds = normalizeBounds({
        x: interaction.start.x,
        y: interaction.start.y,
        width: interaction.current.x - interaction.start.x,
        height: interaction.current.y - interaction.start.y,
      });
      if (bounds.width * scale < 3 && bounds.height * scale < 3) {
        if (!interaction.additive) onSelect([page.rootComponentId], page.rootComponentId);
        return;
      }
      const matched = layout
        .filter((item) => intersectsBounds(bounds, item.absoluteBounds))
        .map((item) => item.node.id);
      onSelect(interaction.additive ? [...new Set([...selectedIds, ...matched])] : matched);
    }
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLElement>): void => {
    if (pointerInteraction.get() !== null) return;
    if (event.key.startsWith('Arrow') && positionMovableSelectedIds.length > 0) {
      const distance = event.shiftKey ? 8 : 1;
      const deltas: Record<string, Point> = {
        ArrowLeft: { x: -distance, y: 0 },
        ArrowRight: { x: distance, y: 0 },
        ArrowUp: { x: 0, y: -distance },
        ArrowDown: { x: 0, y: distance },
      };
      const requested = deltas[event.key];
      if (requested) {
        event.preventDefault();
        const absolute = positionMovableSelectedIds
          .map((id) => layoutById.get(id)?.absoluteBounds)
          .filter((bounds): bounds is Bounds => bounds !== undefined);
        if (absolute.length === 0) return;
        const delta = constrainMovementDelta(unionBounds(absolute), requested, {
          containerBounds: { x: 0, y: 0, width: viewportWidth, height: viewportHeight },
          constraints: movementConstraintsForIds(
            page,
            byId,
            positionMovableSelectedIds,
            surfaceRef.current,
            scale,
            layoutById,
          ),
        });
        if (delta.x === 0 && delta.y === 0) return;
        const first =
          positionMovableSelectedIds[0] === undefined
            ? undefined
            : byId.get(positionMovableSelectedIds[0]);
        onMoveComponents(
          positionMovableSelectedIds,
          first === undefined ? delta : movementDeltaForNode(first, delta),
        );
      }
    } else if (event.key === 'Delete') {
      event.preventDefault();
      onDeleteSelection();
    } else if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLocaleLowerCase();
      if (key === 'c') onCopy();
      else if (key === 'v') onPaste();
      else if (key === 'x') {
        onCopy();
        onDeleteSelection();
      } else if (key === 'z' && event.shiftKey) onRedo();
      else if (key === 'z') onUndo();
      else if (key === 'y') onRedo();
      else return;
      event.preventDefault();
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    const payload = dragPayload(event);
    dropFeedback.clear();
    if (payload === null) return;
    const preview = insertionPreview(payload, eventPoint(event));
    if (preview === null || preview.invalid) return;
    event.preventDefault();
    const reusableElementId = event.dataTransfer.getData(WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE);
    if (reusableElementId.length > 0) {
      insertReusableElementAt(reusableElementId, eventPoint(event));
      return;
    }
    const type = event.dataTransfer.getData(WEBRAD_COMPONENT_DRAG_TYPE);
    if (type) insertAt(type, eventPoint(event));
  };

  const handleNonvisualDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dropFeedback.clear();
    const type = event.dataTransfer.getData(WEBRAD_COMPONENT_DRAG_TYPE);
    if (appearsInDesignerTray(type)) {
      onAddComponent(type, { x: 0, y: 0 }, page.rootComponentId);
    }
  };

  const marqueeBounds =
    interaction?.kind === 'marquee'
      ? normalizeBounds({
          x: interaction.start.x,
          y: interaction.start.y,
          width: interaction.current.x - interaction.start.x,
          height: interaction.current.y - interaction.start.y,
        })
      : null;
  const reorderIndicator =
    interaction?.kind === 'drag' && interaction.mode === 'reorder'
      ? interaction.reorderTarget?.indicatorBounds
      : undefined;

  return (
    <div className={`wr-designer-workspace${showToolbar ? '' : ' wr-designer-workspace-compact'}`}>
      {showToolbar && (
        <div className="wr-designer-toolbar">
          <button type="button" disabled={selectedVisualIds.length === 0} onClick={onBringToFront}>
            Bring to Front
          </button>
          <button type="button" disabled={selectedVisualIds.length === 0} onClick={onSendToBack}>
            Send to Back
          </button>
          <span />
          <label>
            Viewport
            <select
              value={viewportName}
              onChange={(event) => setViewportName(event.target.value as ViewportName)}
            >
              {Object.entries(VIEWPORTS).map(([name, option]) => (
                <option value={name} key={name}>
                  {option.label} ({option.width === null ? 'available width' : `${option.width}px`})
                </option>
              ))}
            </select>
          </label>
          <label>
            Zoom
            <select value={zoom} onChange={(event) => onZoomChange(Number(event.target.value))}>
              {[50, 75, 100, 125, 150].map((value) => (
                <option value={value} key={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div ref={scrollRef} className="wr-designer-scroll">
        <div
          className="wr-page-zoom-frame"
          style={{ width: viewportWidth * scale, height: viewportHeight * scale }}
        >
          <div
            ref={surfaceRef}
            className="wr-page-surface wr-project-surface"
            data-webrad-theme={previewTheme}
            data-viewport={viewportName}
            data-viewport-width={responsiveWidth}
            style={{
              width: viewportWidth,
              height: viewportHeight,
              transform: `scale(${scale})`,
            }}
            tabIndex={0}
            onKeyDown={handleKeyboard}
          >
            <style data-webrad-project-styles>{compiledStylesCss}</style>
            <style data-webrad-project-themes>
              {projectThemeCss(settings.themes, { layered: true })}
            </style>
            <SharedComponentStyles />
            {root !== undefined && (
              <ComponentView node={root} designTime styleClassName={rootStyleClassName}>
                {settings.showGrid && (
                  <div
                    className="wr-page-grid"
                    style={{ backgroundSize: `${settings.gridSize}px ${settings.gridSize}px` }}
                  />
                )}
                <div
                  className={`wr-runtime-children wr-runtime-children-${root.layout.container.mode}`}
                  data-designer-parent-id={root.id}
                  style={projectChildrenStyle(root)}
                >
                  {root.children.map((childId) => {
                    const child = byId.get(childId);
                    return child && appearsOnDesignerCanvas(child.type) ? (
                      <RuntimeNode
                        key={child.id}
                        node={child}
                        byId={byId}
                        reusableElementsById={reusableElementsById}
                        styleClassNames={styleClassNames}
                        fitContentSizes={fitContentSizes}
                        parentContainer={root.layout.container}
                        interaction={interaction}
                        designViewport={{
                          width: viewportWidth,
                          height: viewportHeight,
                          responsiveWidth: responsiveWidth,
                        }}
                        scale={scale}
                        floatingHost={floatingHost}
                      />
                    ) : null;
                  })}
                </div>
              </ComponentView>
            )}
            <div className="wr-designer-floating-layer" ref={setFloatingHost} />
            {root !== undefined &&
              floatingContainerEditorNode !== undefined &&
              floatingContainerEditor !== undefined && (
                <RuntimeNode
                  key={floatingContainerEditorNode.id}
                  node={floatingContainerEditorNode}
                  byId={byId}
                  reusableElementsById={reusableElementsById}
                  styleClassNames={styleClassNames}
                  fitContentSizes={fitContentSizes}
                  parentContainer={
                    floatingContainerEditorNode.parentId === null
                      ? root.layout.container
                      : (byId.get(floatingContainerEditorNode.parentId)?.layout.container ??
                        root.layout.container)
                  }
                  interaction={interaction}
                  designViewport={{
                    width: viewportWidth,
                    height: viewportHeight,
                    responsiveWidth: responsiveWidth,
                  }}
                  scale={scale}
                  floatingHost={floatingHost}
                  floatingEditorBounds={floatingContainerEditor.bounds}
                />
              )}
            <div
              className="wr-design-overlay"
              onPointerDown={startMarquee}
              onPointerMove={(event) => {
                updateInteraction(event);
                if (
                  pointerInteraction.get() === null &&
                  selectedPaletteType &&
                  event.buttons === 0
                ) {
                  const preview = insertionPreview(
                    { kind: 'component', type: selectedPaletteType },
                    eventPoint(event),
                  );
                  if (preview) dropFeedback.show(preview);
                }
              }}
              onPointerLeave={() => dropFeedback.clear()}
              onPointerUp={finishInteraction}
              onPointerCancel={(event) => pointerInteraction.cancelPointer(event.pointerId)}
              onLostPointerCapture={(event) => pointerInteraction.cancelPointer(event.pointerId)}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {layout.map(({ node, absoluteBounds, order }) => {
                const selected = selectedIds.includes(node.id);
                const parentMode = parentModeOf(node, byId);
                return (
                  <div
                    className={`wr-design-hit ${selected ? 'selected' : ''}`}
                    data-component-id={node.id}
                    key={node.id}
                    style={{
                      left: absoluteBounds.x,
                      top: absoluteBounds.y,
                      width: absoluteBounds.width,
                      height: absoluteBounds.height,
                      zIndex: designHitZIndex(node, order),
                    }}
                    title={`${node.name}: ${node.type}${
                      parentMode === 'align-to-parent'
                        ? ' (anchored; use layout controls to move)'
                        : ''
                    }`}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      activateComponent(node.id);
                    }}
                    onPointerDown={(event) => startComponentDrag(event, node)}
                  >
                    {selected &&
                      selectedIds.length === 1 &&
                      boundsResizeHandles(node, parentMode, automaticLayout(node)).map((handle) => (
                        <div
                          className={`wr-resize-handle handle-${handle}`}
                          data-resize-handle={handle}
                          aria-label={`Resize ${node.name} (${handle})`}
                          key={handle}
                          onPointerDown={(event) => startResize(event, node, handle)}
                        />
                      ))}
                    {selected && <span className="wr-selection-name">{node.name}</span>}
                  </div>
                );
              })}
              {dropFeedback.feedback &&
                !dropFeedback.feedback.tray &&
                !(interaction?.kind === 'drag' && interaction.reparentTarget !== undefined) && (
                  <DesignerInsertionFeedback preview={dropFeedback.feedback} scale={scale} />
                )}
              {interaction?.kind === 'drag' && interaction.reparentTarget !== undefined && (
                <DesignerInsertionFeedback
                  preview={interaction.reparentTarget.preview}
                  scale={scale}
                />
              )}
              {reorderIndicator && (
                <div
                  className="wr-flow-drop-indicator"
                  style={{
                    left: reorderIndicator.x,
                    top: reorderIndicator.y,
                    width: reorderIndicator.width,
                    height: reorderIndicator.height,
                  }}
                />
              )}
              {marqueeBounds && (
                <div
                  className="wr-selection-marquee"
                  style={{
                    left: marqueeBounds.x,
                    top: marqueeBounds.y,
                    width: marqueeBounds.width,
                    height: marqueeBounds.height,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <div
        className={`wr-nonvisual-tray${dropFeedback.feedback?.tray ? ' wr-nonvisual-tray-drop-active' : ''}`}
        onDragOver={(event) => {
          const payload = dragPayload(event);
          if (payload?.kind === 'component' && appearsInDesignerTray(payload.type))
            handleDragOver(event);
          else dropFeedback.clear();
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleNonvisualDrop}
      >
        <div className="wr-nonvisual-tray-header" id="wr-nonvisual-tray-heading">
          <strong>Nonvisual Components</strong>
          <span>{nonvisualComponents.length}</span>
        </div>
        <div
          className="wr-nonvisual-tray-items"
          role="listbox"
          aria-labelledby="wr-nonvisual-tray-heading"
          aria-multiselectable="true"
        >
          {nonvisualComponents.length === 0 ? (
            <span className="wr-nonvisual-tray-empty">
              Drop a nonvisual component here or double-click it in the palette.
            </span>
          ) : (
            nonvisualComponents.map((node) => {
              const definition = componentRegistry.require(node.type);
              const selected = selectedIds.includes(node.id);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={`${node.name}, ${definition.displayName}`}
                  className={`wr-nonvisual-item${selected ? ' selected' : ''}`}
                  data-nonvisual-component-id={node.id}
                  key={node.id}
                  title={`${node.name}: ${node.type}. Double-click to activate.`}
                  onClick={(event) => {
                    const next = event.shiftKey
                      ? selected
                        ? selectedIds.filter((id) => id !== node.id)
                        : [...selectedIds, node.id]
                      : [node.id];
                    onSelect(next, node.id);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onSelect([node.id], node.id);
                    activateComponent(node.id);
                  }}
                  onKeyDown={handleKeyboard}
                >
                  <span className="wr-nonvisual-item-icon" data-icon={definition.icon}>
                    {definition.palette.caption.slice(0, 1).toLocaleUpperCase()}
                  </span>
                  <span className="wr-nonvisual-item-text">
                    <strong>{node.name}</strong>
                    <small>{definition.displayName}</small>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
