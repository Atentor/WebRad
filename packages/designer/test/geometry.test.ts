import { describe, expect, it } from 'vitest';

import {
  clampBounds,
  constrainMovementDelta,
  containsBounds,
  getKeyboardMovementDelta,
  getBoundsResizeHandles,
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

  it('uses one delta within every parent without distorting a selection across containers', () => {
    expect(
      constrainMovementDelta(
        { x: 20, y: 20, width: 300, height: 40 },
        { x: 80, y: 10 },
        {
          snapToGrid: true,
          containerBounds: { x: 0, y: 0, width: 500, height: 500 },
          constraints: [
            {
              bounds: { x: 10, y: 10, width: 30, height: 20 },
              containerBounds: { x: 0, y: 0, width: 100, height: 100 },
            },
            {
              bounds: { x: 80, y: 5, width: 20, height: 20 },
              containerBounds: { x: 0, y: 0, width: 120, height: 100 },
            },
          ],
        },
      ),
    ).toEqual({ x: 20, y: 12 });
  });

  it('keeps an axis intact when two containers have incompatible movement ranges', () => {
    expect(
      constrainMovementDelta(
        { x: 0, y: 0, width: 20, height: 20 },
        { x: 10, y: 8 },
        {
          constraints: [
            {
              bounds: { x: -30, y: 0, width: 10, height: 10 },
              containerBounds: { x: 0, y: 0, width: 20, height: 20 },
            },
            {
              bounds: { x: 40, y: 0, width: 10, height: 10 },
              containerBounds: { x: 0, y: 0, width: 20, height: 20 },
            },
          ],
        },
      ),
    ).toEqual({ x: 0, y: 8 });
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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite minimum dimensions (%s)',
    (value) => {
      const bounds = { x: 0, y: 0, width: 40, height: 40 };
      expect(() => clampBounds(bounds, bounds, { width: value })).toThrow(RangeError);
      expect(() => clampBounds(bounds, bounds, { height: value })).toThrow(RangeError);
    },
  );
});

describe('resize engine', () => {
  it.each([
    ['fixed', 'fixed', 'fixed', RESIZE_HANDLES],
    ['fixed', 'stretch', 'fixed', ['n', 's']],
    ['fixed', 'fixed', 'fit-content', ['e', 'w']],
    ['fixed', 'fit-content', 'stretch', []],
    ['row', 'fixed', 'fixed', ['e', 'se', 's']],
    ['column', 'stretch', 'fixed', ['s']],
    ['row', 'fixed', 'fit-content', ['e']],
    ['align-to-parent', 'fixed', 'fixed', []],
  ] as const)(
    'offers valid bounds handles for %s parent and %s/%s sizing',
    (parentMode, width, height, handles) => {
      expect(getBoundsResizeHandles({ width, height }, parentMode)).toEqual(handles);
    },
  );

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

  it('preserves the fixed edge and minimum size when the container leaves no room', () => {
    const containerBounds = { x: 0, y: 0, width: 40, height: 40 };
    expect(
      resizeBounds(
        { x: 50, y: 50, width: 20, height: 20 },
        'se',
        { x: -100, y: -100 },
        { containerBounds },
      ),
    ).toEqual({ x: 50, y: 50, width: 8, height: 8 });
    expect(
      resizeBounds(
        { x: -30, y: -30, width: 20, height: 20 },
        'nw',
        { x: 100, y: 100 },
        { containerBounds },
      ),
    ).toEqual({ x: -18, y: -18, width: 8, height: 8 });
    expect(
      resizeBounds(
        { x: 2, y: 2, width: 2, height: 2 },
        'nw',
        { x: 1, y: 1 },
        { containerBounds, minWidth: 8, minHeight: 8 },
      ),
    ).toEqual({ x: -4, y: -4, width: 8, height: 8 });
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
