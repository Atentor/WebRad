/**
 * Small, network-independent SVG icons shared by the IDE chrome and generated
 * applications. The data is deliberately framework-neutral so both DOM and
 * React renderers can project the same icon without importing each other.
 */
export const WEBRAD_ICON_NAMES = [
  'add',
  'chevron-down',
  'chevron-right',
  'close',
  'delete',
  'folder-open',
  'info',
  'layers',
  'lightbulb',
  'palette',
  'page',
  'play',
  'redo',
  'save',
  'search',
  'settings',
  'style',
  'undo',
] as const;

export type WebRadIconName = (typeof WEBRAD_ICON_NAMES)[number];

interface WebRadIconShapeAttributes {
  readonly fill?: 'currentColor';
  readonly stroke?: 'none';
  readonly strokeWidth?: number;
}

export interface WebRadIconPathShape extends WebRadIconShapeAttributes {
  readonly kind: 'path';
  readonly d: string;
}

export interface WebRadIconCircleShape extends WebRadIconShapeAttributes {
  readonly kind: 'circle';
  readonly cx: string;
  readonly cy: string;
  readonly r: string;
}

export type WebRadIconShape = WebRadIconPathShape | WebRadIconCircleShape;

const WEBRAD_ICON_SHAPES: Readonly<Record<WebRadIconName, readonly WebRadIconShape[]>> = {
  add: [{ kind: 'path', d: 'M12 5v14M5 12h14' }],
  'chevron-down': [{ kind: 'path', d: 'm7 9.5 5 5 5-5' }],
  'chevron-right': [{ kind: 'path', d: 'm9.5 7 5 5-5 5' }],
  close: [{ kind: 'path', d: 'm6 6 12 12M18 6 6 18' }],
  delete: [
    { kind: 'path', d: 'M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13' },
    { kind: 'path', d: 'M10 11v5M14 11v5' },
  ],
  'folder-open': [
    { kind: 'path', d: 'M3.5 18.5V6.5h6l2 2h9v2' },
    { kind: 'path', d: 'M5 19.5h13.5l2.5-9H7.5z' },
  ],
  info: [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M12 11v6' },
    { kind: 'path', d: 'M12 7.5h.01', strokeWidth: 2.6 },
  ],
  layers: [
    { kind: 'path', d: 'm12 3 9 5-9 5-9-5z' },
    { kind: 'path', d: 'm4.5 12 7.5 4 7.5-4M4.5 16l7.5 4 7.5-4' },
  ],
  lightbulb: [
    { kind: 'path', d: 'M9 18h6M10 21h4' },
    {
      kind: 'path',
      d: 'M8.5 15.5A6 6 0 1 1 15.5 15.5c-.8.6-1.2 1.3-1.3 2.1h-4.4c-.1-.8-.5-1.5-1.3-2.1Z',
    },
  ],
  palette: [
    {
      kind: 'path',
      d: 'M12 3a9 9 0 0 0 0 18h1.1a1.9 1.9 0 0 0 1.4-3.2 1.9 1.9 0 0 1 1.4-3.2H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9Z',
    },
    { kind: 'circle', cx: '7.5', cy: '11', r: '.7', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '9.2', cy: '7.4', r: '.7', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '13.2', cy: '6.6', r: '.7', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '16.5', cy: '9', r: '.7', fill: 'currentColor', stroke: 'none' },
  ],
  page: [
    { kind: 'path', d: 'M5 3h10l4 4v14H5z' },
    { kind: 'path', d: 'M15 3v5h4' },
  ],
  play: [{ kind: 'path', d: 'm8 5 11 7-11 7z', fill: 'currentColor', stroke: 'none' }],
  redo: [{ kind: 'path', d: 'm15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6' }],
  save: [
    { kind: 'path', d: 'M5 3h12l2 2v16H5z' },
    { kind: 'path', d: 'M8 3v6h8V3M8 21v-7h8v7' },
  ],
  search: [
    { kind: 'circle', cx: '10.5', cy: '10.5', r: '6.5' },
    { kind: 'path', d: 'm15.5 15.5 4.5 4.5' },
  ],
  settings: [
    { kind: 'path', d: 'M4 7h10M18 7h2M4 17h2M10 17h10' },
    { kind: 'circle', cx: '16', cy: '7', r: '2' },
    { kind: 'circle', cx: '8', cy: '17', r: '2' },
  ],
  style: [
    { kind: 'path', d: 'M4 4h7l9 9-7 7-9-9z' },
    { kind: 'circle', cx: '8', cy: '8', r: '1' },
  ],
  undo: [{ kind: 'path', d: 'm9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6' }],
};

export function isWebRadIconName(value: unknown): value is WebRadIconName {
  return typeof value === 'string' && WEBRAD_ICON_NAMES.includes(value as WebRadIconName);
}

export function webRadIconLabel(name: WebRadIconName): string {
  return name.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getWebRadIconShapes(name: WebRadIconName): readonly WebRadIconShape[] {
  return WEBRAD_ICON_SHAPES[name];
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function applyShapeAttributes(element: SVGElement, shape: WebRadIconShape): void {
  if (shape.fill !== undefined) element.setAttribute('fill', shape.fill);
  if (shape.stroke !== undefined) element.setAttribute('stroke', shape.stroke);
  if (shape.strokeWidth !== undefined)
    element.setAttribute('stroke-width', String(shape.strokeWidth));
}

function createShapeElement(document: Document, shape: WebRadIconShape): SVGElement {
  if (shape.kind === 'path') {
    const element = document.createElementNS(SVG_NAMESPACE, 'path');
    element.setAttribute('d', shape.d);
    applyShapeAttributes(element, shape);
    return element;
  }

  const element = document.createElementNS(SVG_NAMESPACE, 'circle');
  element.setAttribute('cx', shape.cx);
  element.setAttribute('cy', shape.cy);
  element.setAttribute('r', shape.r);
  applyShapeAttributes(element, shape);
  return element;
}

/** Replaces only a SVG icon's graphics, preserving its host attributes and classes. */
export function setWebRadIconElementContent(element: SVGSVGElement, name: WebRadIconName): void {
  element.replaceChildren(
    ...getWebRadIconShapes(name).map((shape) => createShapeElement(element.ownerDocument, shape)),
  );
}

/** Creates an accessible-decorative SVG element for a browser-runtime component. */
export function createWebRadIconElement(document: Document, name: WebRadIconName): SVGSVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, 'svg');
  element.setAttribute('viewBox', '0 0 24 24');
  element.setAttribute('fill', 'none');
  element.setAttribute('stroke', 'currentColor');
  element.setAttribute('stroke-width', '1.8');
  element.setAttribute('stroke-linecap', 'round');
  element.setAttribute('stroke-linejoin', 'round');
  element.setAttribute('focusable', 'false');
  element.setAttribute('aria-hidden', 'true');
  setWebRadIconElementContent(element, name);
  return element;
}
