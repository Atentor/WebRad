import { describe, expect, it } from 'vitest';

import {
  clampBounds,
  containsBounds,
  getKeyboardMovementDelta,
  intersectsBounds,
  moveBoundsTogether,
  normalizeBounds,
  RESIZE_HANDLES,
  resizeBounds,
  snapBounds,
  snapValue,
} from '../src/geometry.js';

describe('grid and keyboard movement', () => {
  it('snaps to the default 8px grid, including negative coordinates', () => {
    expect(snapValue(11)).toBe(8);
    expect(snapValue(13)).toBe(16);
    expect(snapValue(-6)).toBe(-8);
    expect(snapValue(13, 8, 2)).toBe(10);
    expect(snapBounds({ x: 11, y: 13, width: 21, height: 19 }, 8, 'edges')).toEqual({
      x: 8,
      y: 16,
      width: 24,
      height: 16,
    });
  });

  it('uses 1px for Arrow and 8px for Shift+Arrow', () => {
    expect(getKeyboardMovementDelta('ArrowLeft')).toEqual({ x: -1, y: 0 });
    expect(getKeyboardMovementDelta('ArrowDown', true)).toEqual({ x: 0, y: 8 });
  });

  it('rejects invalid grids instead of producing unusable geometry', () => {
    expect(() => snapValue(10, 0)).toThrow(RangeError);
    expect(() => snapValue(Number.NaN)).toThrow(RangeError);
  });
});

describe('movement and bounds', () => {
  it('applies one shared clamped delta to a multi-selection', () => {
    const result = moveBoundsTogether(
      [
        { x: 10, y: 10, width: 20, height: 20 },
        { x: 50, y: 30, width: 30, height: 20 },
      ],
      { x: 50, y: -50 },
      { containerBounds: { x: 0, y: 0, width: 100, height: 100 } },
    );

    expect(result.delta).toEqual({ x: 20, y: -10 });
    expect(result.bounds).toEqual([
      { x: 30, y: 0, width: 20, height: 20 },
      { x: 70, y: 20, width: 30, height: 20 },
    ]);
  });

  it('snaps the group anchor without changing relative distances', () => {
    const result = moveBoundsTogether(
      [
        { x: 3, y: 5, width: 10, height: 10 },
        { x: 18, y: 20, width: 10, height: 10 },
      ],
      { x: 3, y: 4 },
      { snapToGrid: true },
    );
    expect(result.delta).toEqual({ x: 5, y: 3 });
    expect((result.bounds[1]?.x ?? 0) - (result.bounds[0]?.x ?? 0)).toBe(15);
  });

  it('clamps and, when necessary, shrinks bounds into a container', () => {
    expect(
      clampBounds(
        { x: -20, y: 90, width: 140, height: 30 },
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 8, height: 8 },
      ),
    ).toEqual({ x: 0, y: 70, width: 100, height: 30 });
  });
});

describe('resize engine', () => {
  it('supports all eight handles', () => {
    const expected = {
      n: { x: 10, y: 25, width: 100, height: 75 },
      ne: { x: 10, y: 25, width: 110, height: 75 },
      e: { x: 10, y: 20, width: 110, height: 80 },
      se: { x: 10, y: 20, width: 110, height: 85 },
      s: { x: 10, y: 20, width: 100, height: 85 },
      sw: { x: 20, y: 20, width: 90, height: 85 },
      w: { x: 20, y: 20, width: 90, height: 80 },
      nw: { x: 20, y: 25, width: 90, height: 75 },
    } as const;

    for (const handle of RESIZE_HANDLES) {
      expect(
        resizeBounds({ x: 10, y: 20, width: 100, height: 80 }, handle, { x: 10, y: 5 }),
      ).toEqual(expected[handle]);
    }
  });

  it('enforces minimum size, grid snapping, and container edges', () => {
    expect(
      resizeBounds(
        { x: 10, y: 10, width: 100, height: 40 },
        'w',
        { x: 500, y: 0 },
        { minWidth: 16 },
      ),
    ).toEqual({ x: 94, y: 10, width: 16, height: 40 });

    expect(
      resizeBounds(
        { x: 10, y: 10, width: 20, height: 20 },
        'se',
        { x: 5, y: 100 },
        {
          snapToGrid: true,
          containerBounds: { x: 0, y: 0, width: 40, height: 40 },
        },
      ),
    ).toEqual({ x: 10, y: 10, width: 22, height: 30 });
  });
});

describe('rectangle relationships', () => {
  it('normalizes reverse marquee drags and detects containment/intersection', () => {
    const marquee = normalizeBounds({ x: 30, y: 30, width: -20, height: -10 });
    expect(marquee).toEqual({ x: 10, y: 20, width: 20, height: 10 });
    expect(containsBounds(marquee, { x: 12, y: 22, width: 5, height: 5 })).toBe(true);
    expect(intersectsBounds(marquee, { x: 30, y: 25, width: 5, height: 5 })).toBe(true);
    expect(intersectsBounds(marquee, { x: 31, y: 31, width: 1, height: 1 })).toBe(false);
  });
});
