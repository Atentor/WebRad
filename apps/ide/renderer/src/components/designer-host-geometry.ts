import type { Bounds } from '@webrad/project-model';
import type { Point } from '@webrad/designer';

/** The structural wrapper owns authoring margins, outside its measured border box. */
export function measureDesignerNodeMargins(
  surface: HTMLElement | null,
  nodeId: string,
): {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
} {
  const element =
    surface === null
      ? undefined
      : Array.from(surface.querySelectorAll<HTMLElement>('[data-designer-node-id]')).find(
          (node) => node.dataset.designerNodeId === nodeId,
        );
  const style = element === undefined ? undefined : getComputedStyle(element);
  const pixels = (value: string | undefined): number =>
    Math.max(0, Number.parseFloat(value ?? '') || 0);
  return {
    left: pixels(style?.marginLeft),
    top: pixels(style?.marginTop),
    right: pixels(style?.marginRight),
    bottom: pixels(style?.marginBottom),
  };
}

/** Browser projection of the coordinate system that contains authored children. */
export function measureDesignerChildrenHost(
  surface: HTMLElement | null,
  parentId: string,
  scale: number,
): { readonly origin: Point; readonly bounds: Bounds } | undefined {
  if (surface === null) return undefined;
  const host = Array.from(surface.querySelectorAll<HTMLElement>('[data-designer-parent-id]')).find(
    (element) => element.dataset.designerParentId === parentId,
  );
  if (host === undefined) return undefined;
  const surfaceBounds = surface.getBoundingClientRect();
  const hostBounds = host.getBoundingClientRect();
  if (surfaceBounds.width <= 0 || hostBounds.width <= 0 || hostBounds.height <= 0) return undefined;
  return {
    origin: {
      x: (hostBounds.left - surfaceBounds.left) / scale + host.clientLeft - host.scrollLeft,
      y: (hostBounds.top - surfaceBounds.top) / scale + host.clientTop - host.scrollTop,
    },
    bounds: {
      x: 0,
      y: 0,
      width: host.clientWidth || hostBounds.width / scale,
      height: host.clientHeight || hostBounds.height / scale,
    },
  };
}
