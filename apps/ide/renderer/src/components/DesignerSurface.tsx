import { ComponentView, SharedComponentStyles } from '@webrad/components';
import { componentRegistry } from '@webrad/component-registry';
import {
  RESIZE_HANDLES,
  constrainMovementDelta,
  intersectsBounds,
  normalizeBounds,
  resizeBounds,
  type Point,
  type ResizeHandle,
} from '@webrad/designer';
import type { Bounds, ComponentNode, FormModel, ProjectSettings } from '@webrad/project-model';
import {
  memo,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';

interface DesignerSurfaceProps {
  form: FormModel;
  settings: ProjectSettings;
  selectedIds: readonly string[];
  selectedPaletteType: string | null;
  zoom: number;
  onSelect: (ids: readonly string[], primaryId?: string) => void;
  onAddComponent: (type: string, point: Point, parentId: string) => void;
  onMoveComponents: (ids: readonly string[], delta: Point) => void;
  onResizeComponent: (id: string, bounds: Bounds) => void;
  onDeleteSelection: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onZoomChange: (zoom: number) => void;
  onDefaultEvent: (componentId: string) => void;
}

interface LayoutNode {
  node: ComponentNode;
  absoluteBounds: Bounds;
  order: number;
  depth: number;
}

interface DragInteraction {
  kind: 'drag';
  pointerId: number;
  start: Point;
  ids: readonly string[];
  originalBounds: ReadonlyMap<string, Bounds>;
  selectionBounds: Bounds;
  delta: Point;
}

interface ResizeInteraction {
  kind: 'resize';
  pointerId: number;
  start: Point;
  id: string;
  handle: ResizeHandle;
  originalBounds: Bounds;
  currentBounds: Bounds;
  containerBounds: Bounds;
}

interface MarqueeInteraction {
  kind: 'marquee';
  pointerId: number;
  start: Point;
  current: Point;
  additive: boolean;
}

type Interaction = DragInteraction | ResizeInteraction | MarqueeInteraction;

function unionBounds(bounds: readonly Bounds[]): Bounds {
  const first = bounds[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (const item of bounds.slice(1)) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function localBoundsWithPreview(node: ComponentNode, interaction: Interaction | null): Bounds {
  if (interaction?.kind === 'drag' && interaction.ids.includes(node.id)) {
    const original = interaction.originalBounds.get(node.id) ?? node.bounds;
    return {
      ...original,
      x: original.x + interaction.delta.x,
      y: original.y + interaction.delta.y,
    };
  }
  if (interaction?.kind === 'resize' && interaction.id === node.id) {
    return interaction.currentBounds;
  }
  return node.bounds;
}

function layoutForm(form: FormModel, interaction: Interaction | null): readonly LayoutNode[] {
  const byId = new Map(form.components.map((node) => [node.id, node]));
  const output: LayoutNode[] = [];
  let order = 0;

  const visitChildren = (parentId: string, origin: Point, depth: number): void => {
    const parent = byId.get(parentId);
    if (!parent) return;
    for (const childId of parent.children) {
      const child = byId.get(childId);
      if (!child || componentRegistry.get(child.type)?.visual !== true) continue;
      const local = localBoundsWithPreview(child, interaction);
      const absoluteBounds = { ...local, x: origin.x + local.x, y: origin.y + local.y };
      output.push({ node: child, absoluteBounds, order, depth });
      order += 1;
      visitChildren(child.id, { x: absoluteBounds.x, y: absoluteBounds.y }, depth + 1);
    }
  };

  visitChildren(form.rootComponentId, { x: 0, y: 0 }, 0);
  return output;
}

interface RuntimeNodeProps {
  node: ComponentNode;
  byId: ReadonlyMap<string, ComponentNode>;
  interaction: Interaction | null;
}

const RuntimeNode = memo(function RuntimeNode({
  node,
  byId,
  interaction,
}: RuntimeNodeProps): ReactElement {
  const bounds = localBoundsWithPreview(node, interaction);
  return (
    <div
      className={`wr-runtime-node${node.children.length > 0 ? ' wr-runtime-container' : ''}`}
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }}
    >
      <ComponentView node={node} designTime />
      {node.children.map((childId) => {
        const child = byId.get(childId);
        return child && componentRegistry.get(child.type)?.visual === true ? (
          <RuntimeNode key={child.id} node={child} byId={byId} interaction={interaction} />
        ) : null;
      })}
    </div>
  );
});

function pointInside(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.y >= bounds.y &&
    point.x <= bounds.x + bounds.width &&
    point.y <= bounds.y + bounds.height
  );
}

export function DesignerSurface({
  form,
  settings,
  selectedIds,
  selectedPaletteType,
  zoom,
  onSelect,
  onAddComponent,
  onMoveComponents,
  onResizeComponent,
  onDeleteSelection,
  onCopy,
  onPaste,
  onUndo,
  onRedo,
  onBringToFront,
  onSendToBack,
  onZoomChange,
  onDefaultEvent,
}: DesignerSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const scale = zoom / 100;
  const byId = useMemo(() => new Map(form.components.map((node) => [node.id, node])), [form]);
  const layout = useMemo(() => layoutForm(form, interaction), [form, interaction]);
  const layoutById = useMemo(() => new Map(layout.map((item) => [item.node.id, item])), [layout]);
  const root = byId.get(form.rootComponentId);
  const nonvisualComponents = useMemo(
    () =>
      form.components.filter(
        (node) =>
          node.id !== form.rootComponentId && componentRegistry.get(node.type)?.visual === false,
      ),
    [form],
  );
  const movableSelectedIds = useMemo(
    () =>
      selectedIds.filter(
        (id) =>
          id !== form.rootComponentId &&
          componentRegistry.get(byId.get(id)?.type ?? '')?.visual === true,
      ),
    [byId, form.rootComponentId, selectedIds],
  );

  const eventPoint = (event: { clientX: number; clientY: number }): Point => {
    const rectangle = surfaceRef.current?.getBoundingClientRect();
    if (!rectangle) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rectangle.left) / scale,
      y: (event.clientY - rectangle.top) / scale,
    };
  };

  const insertionTarget = (point: Point): { parentId: string; point: Point } => {
    const candidates = [...layout]
      .reverse()
      .filter(
        (item) =>
          componentRegistry.get(item.node.type)?.canHaveChildren === true &&
          pointInside(item.absoluteBounds, point),
      );
    const parent = candidates[0];
    return parent
      ? {
          parentId: parent.node.id,
          point: { x: point.x - parent.absoluteBounds.x, y: point.y - parent.absoluteBounds.y },
        }
      : { parentId: form.rootComponentId, point };
  };

  const insertAt = (type: string, point: Point): void => {
    if (componentRegistry.get(type)?.visual === false) {
      onAddComponent(type, { x: 0, y: 0 }, form.rootComponentId);
      return;
    }
    const target = insertionTarget(point);
    onAddComponent(type, target.point, target.parentId);
  };

  const startComponentDrag = (event: PointerEvent<HTMLDivElement>, node: ComponentNode): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
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
    const ids = selectedIds.includes(node.id) ? selectedIds : [node.id];
    onSelect(ids, node.id);
    const originalBounds = new Map<string, Bounds>();
    const absolute = ids
      .map((id) => layoutById.get(id))
      .filter((item): item is LayoutNode => item !== undefined)
      .map((item) => {
        originalBounds.set(item.node.id, item.node.bounds);
        return item.absoluteBounds;
      });
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      kind: 'drag',
      pointerId: event.pointerId,
      start: point,
      ids,
      originalBounds,
      selectionBounds: unionBounds(absolute),
      delta: { x: 0, y: 0 },
    });
  };

  const startResize = (
    event: PointerEvent<HTMLDivElement>,
    node: ComponentNode,
    handle: ResizeHandle,
  ): void => {
    event.stopPropagation();
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    const containerBounds = {
      x: 0,
      y: 0,
      width: parent?.bounds.width ?? form.width,
      height: parent?.bounds.height ?? form.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      kind: 'resize',
      pointerId: event.pointerId,
      start: eventPoint(event),
      id: node.id,
      handle,
      originalBounds: node.bounds,
      currentBounds: node.bounds,
      containerBounds,
    });
  };

  const startMarquee = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const point = eventPoint(event);
    if (selectedPaletteType) {
      insertAt(selectedPaletteType, point);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      kind: 'marquee',
      pointerId: event.pointerId,
      start: point,
      current: point,
      additive: event.shiftKey,
    });
    if (!event.shiftKey) onSelect([]);
  };

  const updateInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const current = eventPoint(event);
    const requested = { x: current.x - interaction.start.x, y: current.y - interaction.start.y };
    if (interaction.kind === 'drag') {
      const delta = constrainMovementDelta(interaction.selectionBounds, requested, {
        snapToGrid: settings.snapToGrid,
        gridSize: settings.gridSize,
        containerBounds: { x: 0, y: 0, width: form.width, height: form.height },
      });
      setInteraction({ ...interaction, delta });
    } else if (interaction.kind === 'resize') {
      setInteraction({
        ...interaction,
        currentBounds: resizeBounds(interaction.originalBounds, interaction.handle, requested, {
          snapToGrid: settings.snapToGrid,
          gridSize: settings.gridSize,
          minWidth: 8,
          minHeight: 8,
          containerBounds: interaction.containerBounds,
        }),
      });
    } else {
      setInteraction({ ...interaction, current });
    }
  };

  const finishInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === 'drag' && (interaction.delta.x !== 0 || interaction.delta.y !== 0)) {
      onMoveComponents(interaction.ids, interaction.delta);
    } else if (interaction.kind === 'resize') {
      onResizeComponent(interaction.id, interaction.currentBounds);
    } else if (interaction.kind === 'marquee') {
      const bounds = normalizeBounds({
        x: interaction.start.x,
        y: interaction.start.y,
        width: interaction.current.x - interaction.start.x,
        height: interaction.current.y - interaction.start.y,
      });
      if (bounds.width < 2 && bounds.height < 2 && !interaction.additive) {
        onSelect([form.rootComponentId], form.rootComponentId);
        setInteraction(null);
        return;
      }
      const matched = layout
        .filter((item) => intersectsBounds(bounds, item.absoluteBounds))
        .map((item) => item.node.id);
      onSelect(interaction.additive ? [...new Set([...selectedIds, ...matched])] : matched);
    }
    setInteraction(null);
  };

  const handleKeyboard = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key.startsWith('Arrow') && movableSelectedIds.length > 0) {
      const distance = event.shiftKey ? 8 : 1;
      const deltas: Record<string, Point> = {
        ArrowLeft: { x: -distance, y: 0 },
        ArrowRight: { x: distance, y: 0 },
        ArrowUp: { x: 0, y: -distance },
        ArrowDown: { x: 0, y: distance },
      };
      const delta = deltas[event.key];
      if (delta) {
        event.preventDefault();
        onMoveComponents(movableSelectedIds, delta);
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
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-webrad-component');
    if (type) insertAt(type, eventPoint(event));
  };

  const handleNonvisualDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/x-webrad-component');
    if (componentRegistry.get(type)?.visual === false) {
      onAddComponent(type, { x: 0, y: 0 }, form.rootComponentId);
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

  return (
    <div className="wr-designer-workspace">
      <div className="wr-designer-toolbar">
        <button type="button" disabled={movableSelectedIds.length === 0} onClick={onBringToFront}>
          Bring to Front
        </button>
        <button type="button" disabled={movableSelectedIds.length === 0} onClick={onSendToBack}>
          Send to Back
        </button>
        <span />
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
      <div className="wr-designer-scroll">
        <div
          className="wr-form-zoom-frame"
          style={{ width: form.width * scale, height: form.height * scale }}
        >
          <div
            ref={surfaceRef}
            className={`wr-form-surface ${settings.showGrid ? 'show-grid' : ''}`}
            style={{
              width: form.width,
              height: form.height,
              transform: `scale(${scale})`,
              backgroundColor:
                typeof root?.props.backgroundColor === 'string'
                  ? root.props.backgroundColor
                  : '#ffffff',
              backgroundSize: `${settings.gridSize}px ${settings.gridSize}px`,
            }}
            tabIndex={0}
            onKeyDown={handleKeyboard}
          >
            <SharedComponentStyles />
            <div className="wr-runtime-layer" aria-hidden="true">
              {root?.children.map((childId) => {
                const child = byId.get(childId);
                return child && componentRegistry.get(child.type)?.visual === true ? (
                  <RuntimeNode key={child.id} node={child} byId={byId} interaction={interaction} />
                ) : null;
              })}
            </div>
            <div
              className="wr-design-overlay"
              onPointerDown={startMarquee}
              onPointerMove={updateInteraction}
              onPointerUp={finishInteraction}
              onPointerCancel={() => setInteraction(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              {layout.map(({ node, absoluteBounds, order }) => {
                const selected = selectedIds.includes(node.id);
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
                      zIndex: order + 1,
                    }}
                    title={`${node.name}: ${node.type}`}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      onDefaultEvent(node.id);
                    }}
                    onPointerDown={(event) => startComponentDrag(event, node)}
                  >
                    {selected &&
                      selectedIds.length === 1 &&
                      RESIZE_HANDLES.map((handle) => (
                        <div
                          className={`wr-resize-handle handle-${handle}`}
                          key={handle}
                          onPointerDown={(event) => startResize(event, node, handle)}
                        />
                      ))}
                    {selected && <span className="wr-selection-name">{node.name}</span>}
                  </div>
                );
              })}
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
        className="wr-nonvisual-tray"
        onDragOver={(event) => event.preventDefault()}
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
                  title={`${node.name}: ${node.type}`}
                  onClick={(event) => {
                    const next = event.shiftKey
                      ? selected
                        ? selectedIds.filter((id) => id !== node.id)
                        : [...selectedIds, node.id]
                      : [node.id];
                    onSelect(next, node.id);
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
