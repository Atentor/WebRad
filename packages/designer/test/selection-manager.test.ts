import { describe, expect, it, vi } from 'vitest';

import { SelectionManager } from '../src/selection-manager.js';

const candidates = [
  { id: 'a', bounds: { x: 0, y: 0, width: 20, height: 20 } },
  { id: 'b', bounds: { x: 25, y: 25, width: 20, height: 20 } },
  { id: 'locked', bounds: { x: 5, y: 5, width: 5, height: 5 }, selectable: false },
] as const;

describe('SelectionManager', () => {
  it('supports single selection and Shift toggling with a stable primary ID', () => {
    const selection = new SelectionManager();
    const listener = vi.fn();
    selection.subscribe(listener);

    selection.select('a');
    selection.select('b', true);
    expect(selection.snapshot()).toEqual({ ids: ['a', 'b'], primaryId: 'b' });

    selection.select('a', true);
    expect(selection.snapshot()).toEqual({ ids: ['b'], primaryId: 'b' });
    selection.select('b', true);
    expect(selection.snapshot()).toEqual({ ids: [], primaryId: null });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('does not expose a mutable selection array', () => {
    const selection = new SelectionManager();
    selection.set(['a', 'a', 'b']);
    const ids = selection.selectedIds as string[];
    ids.push('outside');
    expect(selection.selectedIds).toEqual(['a', 'b']);
  });

  it('selects by reverse-drag marquee using intersection or containment', () => {
    const selection = new SelectionManager();
    selection.beginMarquee({ x: 30, y: 30 });
    const state = selection.updateMarquee({ x: 10, y: 10 });
    expect(state.bounds).toEqual({ x: 10, y: 10, width: 20, height: 20 });
    expect(selection.completeMarquee(candidates)).toEqual(['a', 'b']);

    expect(
      selection.selectInMarquee({ x: -1, y: -1, width: 23, height: 23 }, candidates, {
        match: 'contains',
      }),
    ).toEqual(['a']);
  });

  it('supports additive and toggled marquee operations', () => {
    const selection = new SelectionManager();
    selection.selectSingle('a');
    selection.selectInMarquee({ x: 24, y: 24, width: 22, height: 22 }, candidates, {
      operation: 'add',
    });
    expect(selection.selectedIds).toEqual(['a', 'b']);

    selection.selectInMarquee({ x: -1, y: -1, width: 50, height: 50 }, candidates, {
      operation: 'toggle',
    });
    expect(selection.selectedIds).toEqual([]);
  });

  it('can retain only IDs that still exist after model edits', () => {
    const selection = new SelectionManager();
    selection.set(['a', 'b']);
    selection.retain(new Set(['b', 'c']));
    expect(selection.selectedIds).toEqual(['b']);
  });
});
