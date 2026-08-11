import type { Bounds } from '@webrad/project-model';

export const DEFAULT_GRID_SIZE = 8;
export const DEFAULT_NUDGE_DISTANCE = 1;
export const DEFAULT_LARGE_NUDGE_DISTANCE = 8;
export const DEFAULT_MINIMUM_SIZE = 8;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const;

export interface GridOptions {
  readonly snapToGrid?: boolean;
  readonly gridSize?: number;
  readonly gridOrigin?: Point;
}

export interface MovementOptions extends GridOptions {
  readonly containerBounds?: Bounds;
}

export interface ResizeOptions extends GridOptions {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly containerBounds?: Bounds;
}

export interface MultiMoveResult {
  readonly bounds: readonly Bounds[];
  readonly delta: Point;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function assertPositive(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }
}

export function assertValidBounds(bounds: Bounds, name = 'bounds'): void {
  assertFinite(bounds.x, `${name}.x`);
  assertFinite(bounds.y, `${name}.y`);
  assertFinite(bounds.width, `${name}.width`);
  assertFinite(bounds.height, `${name}.height`);
  if (bounds.width < 0 || bounds.height < 0) {
    throw new RangeError(`${name} must not have negative dimensions.`);
  }
}

export function normalizeBounds(bounds: Bounds): Bounds {
  assertFinite(bounds.x, 'bounds.x');
  assertFinite(bounds.y, 'bounds.y');
  assertFinite(bounds.width, 'bounds.width');
  assertFinite(bounds.height, 'bounds.height');

  const x = bounds.width < 0 ? bounds.x + bounds.width : bounds.x;
  const y = bounds.height < 0 ? bounds.y + bounds.height : bounds.y;
  return {
    x,
    y,
    width: Math.abs(bounds.width),
    height: Math.abs(bounds.height),
  };
}

export function snapValue(value: number, gridSize = DEFAULT_GRID_SIZE, origin = 0): number {
  assertFinite(value, 'value');
  assertPositive(gridSize, 'gridSize');
  assertFinite(origin, 'origin');
  const snapped = origin + Math.round((value - origin) / gridSize) * gridSize;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function snapPoint(
  point: Point,
  gridSize = DEFAULT_GRID_SIZE,
  origin: Point = { x: 0, y: 0 },
): Point {
  return {
    x: snapValue(point.x, gridSize, origin.x),
    y: snapValue(point.y, gridSize, origin.y),
  };
}

export function snapBounds(
  bounds: Bounds,
  gridSize = DEFAULT_GRID_SIZE,
  mode: 'position' | 'edges' = 'position',
  origin: Point = { x: 0, y: 0 },
): Bounds {
  assertValidBounds(bounds);
  const topLeft = snapPoint(bounds, gridSize, origin);
  if (mode === 'position') {
    return { ...bounds, ...topLeft };
  }

  const bottomRight = snapPoint(
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    gridSize,
    origin,
  );
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(0, bottomRight.x - topLeft.x),
    height: Math.max(0, bottomRight.y - topLeft.y),
  };
}

export function unionBounds(allBounds: readonly Bounds[]): Bounds {
  if (allBounds.length === 0) {
    throw new RangeError('At least one bounds value is required.');
  }

  const first = allBounds[0];
  if (first === undefined) {
    throw new RangeError('At least one bounds value is required.');
  }
  assertValidBounds(first, 'allBounds[0]');

  let left = first.x;
  let top = first.y;
  let right = first.x + first.width;
  let bottom = first.y + first.height;
  for (let index = 1; index < allBounds.length; index += 1) {
    const bounds = allBounds[index];
    if (bounds === undefined) {
      continue;
    }
    assertValidBounds(bounds, `allBounds[${index}]`);
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function constrainAxisDelta(
  requested: number,
  selectionStart: number,
  selectionEnd: number,
  containerStart: number,
  containerEnd: number,
): number {
  const minimum = containerStart - selectionStart;
  const maximum = containerEnd - selectionEnd;
  if (minimum <= maximum) {
    return clamp(requested, minimum, maximum);
  }

  // The selection is larger than its container. It may move only while it still
  // covers the container; this is the only useful bounded behavior in that case.
  return clamp(requested, maximum, minimum);
}

export function constrainMovementDelta(
  selectionBounds: Bounds,
  requestedDelta: Point,
  options: MovementOptions = {},
): Point {
  assertValidBounds(selectionBounds, 'selectionBounds');
  assertFinite(requestedDelta.x, 'requestedDelta.x');
  assertFinite(requestedDelta.y, 'requestedDelta.y');

  let x = requestedDelta.x;
  let y = requestedDelta.y;
  if (options.snapToGrid === true) {
    const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
    const origin = options.gridOrigin ?? { x: 0, y: 0 };
    x = snapValue(selectionBounds.x + x, gridSize, origin.x) - selectionBounds.x;
    y = snapValue(selectionBounds.y + y, gridSize, origin.y) - selectionBounds.y;
  }

  if (options.containerBounds !== undefined) {
    const container = options.containerBounds;
    assertValidBounds(container, 'containerBounds');
    x = constrainAxisDelta(
      x,
      selectionBounds.x,
      selectionBounds.x + selectionBounds.width,
      container.x,
      container.x + container.width,
    );
    y = constrainAxisDelta(
      y,
      selectionBounds.y,
      selectionBounds.y + selectionBounds.height,
      container.y,
      container.y + container.height,
    );
  }

  return { x, y };
}

export function moveBounds(
  bounds: Bounds,
  requestedDelta: Point,
  options: MovementOptions = {},
): Bounds {
  const delta = constrainMovementDelta(bounds, requestedDelta, options);
  return { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y };
}

export function moveBoundsTogether(
  allBounds: readonly Bounds[],
  requestedDelta: Point,
  options: MovementOptions = {},
): MultiMoveResult {
  if (allBounds.length === 0) {
    return { bounds: [], delta: { x: 0, y: 0 } };
  }

  const selectionBounds = unionBounds(allBounds);
  const delta = constrainMovementDelta(selectionBounds, requestedDelta, options);
  return {
    delta,
    bounds: allBounds.map((bounds) => ({
      ...bounds,
      x: bounds.x + delta.x,
      y: bounds.y + delta.y,
    })),
  };
}

export function clampBounds(
  bounds: Bounds,
  containerBounds: Bounds,
  minimumSize: Partial<Size> = {},
): Bounds {
  assertValidBounds(bounds);
  assertValidBounds(containerBounds, 'containerBounds');
  const requestedMinWidth = minimumSize.width ?? 0;
  const requestedMinHeight = minimumSize.height ?? 0;
  if (requestedMinWidth < 0 || requestedMinHeight < 0) {
    throw new RangeError('Minimum dimensions must not be negative.');
  }

  const width = clamp(
    bounds.width,
    Math.min(requestedMinWidth, containerBounds.width),
    containerBounds.width,
  );
  const height = clamp(
    bounds.height,
    Math.min(requestedMinHeight, containerBounds.height),
    containerBounds.height,
  );
  return {
    x: clamp(bounds.x, containerBounds.x, containerBounds.x + containerBounds.width - width),
    y: clamp(bounds.y, containerBounds.y, containerBounds.y + containerBounds.height - height),
    width,
    height,
  };
}

export function containsBounds(container: Bounds, candidate: Bounds): boolean {
  const normalizedContainer = normalizeBounds(container);
  const normalizedCandidate = normalizeBounds(candidate);
  return (
    normalizedCandidate.x >= normalizedContainer.x &&
    normalizedCandidate.y >= normalizedContainer.y &&
    normalizedCandidate.x + normalizedCandidate.width <=
      normalizedContainer.x + normalizedContainer.width &&
    normalizedCandidate.y + normalizedCandidate.height <=
      normalizedContainer.y + normalizedContainer.height
  );
}

export function intersectsBounds(first: Bounds, second: Bounds): boolean {
  const a = normalizeBounds(first);
  const b = normalizeBounds(second);
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

function moveHorizontalEdge(
  left: number,
  right: number,
  handle: ResizeHandle,
  deltaX: number,
  options: ResizeOptions,
): readonly [number, number] {
  const movesLeft = handle.includes('w');
  const movesRight = handle.includes('e');
  if (!movesLeft && !movesRight) {
    return [left, right];
  }

  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
  const origin = options.gridOrigin?.x ?? 0;
  const minWidth = options.minWidth ?? DEFAULT_MINIMUM_SIZE;
  assertPositive(minWidth, 'minWidth');
  let nextLeft = left;
  let nextRight = right;

  if (movesLeft) {
    nextLeft += deltaX;
    if (options.snapToGrid === true) {
      nextLeft = snapValue(nextLeft, gridSize, origin);
    }
    const lower = options.containerBounds?.x ?? Number.NEGATIVE_INFINITY;
    nextLeft = clamp(nextLeft, lower, right - minWidth);
  } else {
    nextRight += deltaX;
    if (options.snapToGrid === true) {
      nextRight = snapValue(nextRight, gridSize, origin);
    }
    const upper =
      options.containerBounds === undefined
        ? Number.POSITIVE_INFINITY
        : options.containerBounds.x + options.containerBounds.width;
    nextRight = clamp(nextRight, left + minWidth, upper);
  }

  return [nextLeft, nextRight];
}

function moveVerticalEdge(
  top: number,
  bottom: number,
  handle: ResizeHandle,
  deltaY: number,
  options: ResizeOptions,
): readonly [number, number] {
  const movesTop = handle.includes('n');
  const movesBottom = handle.includes('s');
  if (!movesTop && !movesBottom) {
    return [top, bottom];
  }

  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE;
  const origin = options.gridOrigin?.y ?? 0;
  const minHeight = options.minHeight ?? DEFAULT_MINIMUM_SIZE;
  assertPositive(minHeight, 'minHeight');
  let nextTop = top;
  let nextBottom = bottom;

  if (movesTop) {
    nextTop += deltaY;
    if (options.snapToGrid === true) {
      nextTop = snapValue(nextTop, gridSize, origin);
    }
    const lower = options.containerBounds?.y ?? Number.NEGATIVE_INFINITY;
    nextTop = clamp(nextTop, lower, bottom - minHeight);
  } else {
    nextBottom += deltaY;
    if (options.snapToGrid === true) {
      nextBottom = snapValue(nextBottom, gridSize, origin);
    }
    const upper =
      options.containerBounds === undefined
        ? Number.POSITIVE_INFINITY
        : options.containerBounds.y + options.containerBounds.height;
    nextBottom = clamp(nextBottom, top + minHeight, upper);
  }

  return [nextTop, nextBottom];
}

export function resizeBounds(
  bounds: Bounds,
  handle: ResizeHandle,
  requestedDelta: Point,
  options: ResizeOptions = {},
): Bounds {
  assertValidBounds(bounds);
  assertFinite(requestedDelta.x, 'requestedDelta.x');
  assertFinite(requestedDelta.y, 'requestedDelta.y');
  if (!RESIZE_HANDLES.includes(handle)) {
    throw new RangeError(`Unknown resize handle: ${String(handle)}.`);
  }
  if (options.containerBounds !== undefined) {
    assertValidBounds(options.containerBounds, 'containerBounds');
  }

  const [left, right] = moveHorizontalEdge(
    bounds.x,
    bounds.x + bounds.width,
    handle,
    requestedDelta.x,
    options,
  );
  const [top, bottom] = moveVerticalEdge(
    bounds.y,
    bounds.y + bounds.height,
    handle,
    requestedDelta.y,
    options,
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export function getKeyboardMovementDelta(key: ArrowKey, shiftKey = false): Point {
  const distance = shiftKey ? DEFAULT_LARGE_NUDGE_DISTANCE : DEFAULT_NUDGE_DISTANCE;
  switch (key) {
    case 'ArrowLeft':
      return { x: -distance, y: 0 };
    case 'ArrowRight':
      return { x: distance, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -distance };
    case 'ArrowDown':
      return { x: 0, y: distance };
  }
}
