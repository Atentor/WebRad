import type { Bounds } from '@webrad/project-model';

import { containsBounds, intersectsBounds, normalizeBounds, type Point } from './geometry.js';

export interface SelectableBounds {
  readonly id: string;
  readonly bounds: Bounds;
  readonly selectable?: boolean;
}

export type MarqueeMatch = 'intersects' | 'contains';
export type SelectionOperation = 'replace' | 'add' | 'toggle';

export interface MarqueeSelectionOptions {
  readonly match?: MarqueeMatch;
  readonly operation?: SelectionOperation;
}

export interface MarqueeState {
  readonly anchor: Point;
  readonly current: Point;
  readonly bounds: Bounds;
  readonly operation: SelectionOperation;
}

export interface SelectionSnapshot {
  readonly ids: readonly string[];
  readonly primaryId: string | null;
}

export type SelectionListener = (selection: SelectionSnapshot) => void;

function uniqueIds(ids: Iterable<string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

/**
 * Owns design-time selection independently from any React component or DOM node.
 * IDs retain insertion order, with the most recently selected ID acting as primary.
 */
export class SelectionManager {
  readonly #listeners = new Set<SelectionListener>();
  #selectedIds: string[] = [];
  #marquee: MarqueeState | null = null;

  public get selectedIds(): readonly string[] {
    return [...this.#selectedIds];
  }

  public get primaryId(): string | null {
    return this.#selectedIds.at(-1) ?? null;
  }

  public get size(): number {
    return this.#selectedIds.length;
  }

  public get marquee(): MarqueeState | null {
    if (this.#marquee === null) {
      return null;
    }
    return {
      ...this.#marquee,
      anchor: { ...this.#marquee.anchor },
      current: { ...this.#marquee.current },
      bounds: { ...this.#marquee.bounds },
    };
  }

  public has(id: string): boolean {
    return this.#selectedIds.includes(id);
  }

  public snapshot(): SelectionSnapshot {
    return { ids: [...this.#selectedIds], primaryId: this.primaryId };
  }

  public subscribe(listener: SelectionListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  public clear(): void {
    this.#replace([]);
  }

  public selectSingle(id: string): void {
    this.#replace(id.length === 0 ? [] : [id]);
  }

  /** Implements the normal click/Shift+click behavior used by the designer. */
  public select(id: string, shiftKey = false): void {
    if (!shiftKey) {
      this.selectSingle(id);
      return;
    }
    this.toggle(id);
  }

  public toggle(id: string): void {
    if (id.length === 0) {
      return;
    }
    if (this.has(id)) {
      this.#replace(this.#selectedIds.filter((selectedId) => selectedId !== id));
      return;
    }
    this.#replace([...this.#selectedIds, id]);
  }

  public add(ids: Iterable<string>): void {
    this.#replace([...this.#selectedIds, ...ids]);
  }

  public set(ids: Iterable<string>, primaryId?: string): void {
    const nextIds = uniqueIds(ids);
    if (primaryId !== undefined) {
      const primaryIndex = nextIds.indexOf(primaryId);
      if (primaryIndex >= 0) {
        nextIds.splice(primaryIndex, 1);
        nextIds.push(primaryId);
      }
    }
    this.#replace(nextIds);
  }

  public retain(existingIds: ReadonlySet<string>): void {
    this.#replace(this.#selectedIds.filter((id) => existingIds.has(id)));
  }

  public beginMarquee(anchor: Point, operation: SelectionOperation = 'replace'): MarqueeState {
    this.#marquee = {
      anchor: { ...anchor },
      current: { ...anchor },
      bounds: { x: anchor.x, y: anchor.y, width: 0, height: 0 },
      operation,
    };
    return this.marquee as MarqueeState;
  }

  public updateMarquee(current: Point): MarqueeState {
    if (this.#marquee === null) {
      throw new Error('Cannot update a marquee before beginMarquee().');
    }
    const anchor = this.#marquee.anchor;
    this.#marquee = {
      ...this.#marquee,
      current: { ...current },
      bounds: normalizeBounds({
        x: anchor.x,
        y: anchor.y,
        width: current.x - anchor.x,
        height: current.y - anchor.y,
      }),
    };
    return this.marquee as MarqueeState;
  }

  public completeMarquee(
    candidates: readonly SelectableBounds[],
    match: MarqueeMatch = 'intersects',
  ): readonly string[] {
    if (this.#marquee === null) {
      throw new Error('Cannot complete a marquee before beginMarquee().');
    }
    const { bounds, operation } = this.#marquee;
    this.#marquee = null;
    return this.selectInMarquee(bounds, candidates, { match, operation });
  }

  public cancelMarquee(): void {
    this.#marquee = null;
  }

  public selectInMarquee(
    marqueeBounds: Bounds,
    candidates: readonly SelectableBounds[],
    options: MarqueeSelectionOptions = {},
  ): readonly string[] {
    const match = options.match ?? 'intersects';
    const operation = options.operation ?? 'replace';
    const matchedIds = uniqueIds(
      candidates
        .filter((candidate) => {
          if (candidate.selectable === false) {
            return false;
          }
          return match === 'contains'
            ? containsBounds(marqueeBounds, candidate.bounds)
            : intersectsBounds(marqueeBounds, candidate.bounds);
        })
        .map((candidate) => candidate.id),
    );

    if (operation === 'replace') {
      this.#replace(matchedIds);
    } else if (operation === 'add') {
      this.#replace([...this.#selectedIds, ...matchedIds]);
    } else {
      const toggled = [...this.#selectedIds];
      for (const id of matchedIds) {
        const index = toggled.indexOf(id);
        if (index >= 0) {
          toggled.splice(index, 1);
        } else {
          toggled.push(id);
        }
      }
      this.#replace(toggled);
    }

    return this.selectedIds;
  }

  #replace(ids: Iterable<string>): void {
    const nextIds = uniqueIds(ids);
    if (sameIds(this.#selectedIds, nextIds)) {
      return;
    }
    this.#selectedIds = nextIds;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      listener(snapshot);
    }
  }
}
