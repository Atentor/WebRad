import type { Bounds } from '@webrad/project-model';
import { snapPoint, type Point } from './geometry.js';

/** Shared by the insertion preview and the command that creates the component. */
export function projectInsertionBounds(
  point: Point,
  size: Pick<Bounds, 'width' | 'height'>,
  parentSize: Pick<Bounds, 'width' | 'height'>,
  gridSize?: number,
): Bounds {
  const snapped = gridSize === undefined ? point : snapPoint(point, gridSize);
  return {
    x: Math.max(0, Math.min(snapped.x, parentSize.width - size.width)),
    y: Math.max(0, Math.min(snapped.y, parentSize.height - size.height)),
    width: size.width,
    height: size.height,
  };
}
