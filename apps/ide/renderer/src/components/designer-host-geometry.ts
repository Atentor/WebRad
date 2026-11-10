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
  if (surfaceBounds.width <= 0) return undefined;
  // A fixed child host with fit-content can have a zero intrinsic axis even
  // though its component has grown around absolutely positioned children.
  const owner = host.closest<HTMLElement>('[data-component-id]');
  const ownerBounds = owner?.getBoundingClientRect();
  const ownerStyle = owner === null || owner === undefined ? undefined : getComputedStyle(owner);
  const ownerBorder = (value: string | undefined): number =>
    Math.max(0, Number.parseFloat(value ?? '') || 0);
  const hostWidth =
    host.clientWidth ||
    hostBounds.width / scale ||
    Math.max(
      0,
      ((ownerBounds?.right ?? hostBounds.left) - hostBounds.left) / scale -
        ownerBorder(ownerStyle?.borderRightWidth),
    );
  const hostHeight =
    host.clientHeight ||
    hostBounds.height / scale ||
    Math.max(
      0,
      ((ownerBounds?.bottom ?? hostBounds.top) - hostBounds.top) / scale -
        ownerBorder(ownerStyle?.borderBottomWidth),
    );
  if (hostWidth <= 0 || hostHeight <= 0) return undefined;
  // Fixed and anchored children use coordinates relative to the padded content
  // area. Flow insertion retains the host origin because its indicators add
  // padding separately.
  const positioned =
    host.classList.contains('wr-runtime-children-fixed') ||
    host.classList.contains('wr-runtime-children-align-to-parent');
  const style = positioned ? getComputedStyle(host) : undefined;
  const padding = (value: string | undefined): number =>
    Math.max(0, Number.parseFloat(value ?? '') || 0);
  const left = padding(style?.paddingLeft);
  const right = padding(style?.paddingRight);
  const top = padding(style?.paddingTop);
  const bottom = padding(style?.paddingBottom);
  return {
    origin: {
      x: (hostBounds.left - surfaceBounds.left) / scale + host.clientLeft - host.scrollLeft + left,
      y: (hostBounds.top - surfaceBounds.top) / scale + host.clientTop - host.scrollTop + top,
    },
    bounds: {
      x: 0,
      y: 0,
      width: Math.max(0, hostWidth - left - right),
      height: Math.max(0, hostHeight - top - bottom),
    },
  };
}
