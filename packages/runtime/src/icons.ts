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
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
  'chevron-left',
  'chevron-up',
  'chevrons-left',
  'chevrons-right',
  'chevrons-up',
  'chevrons-down',
  'menu',
  'more-horizontal',
  'more-vertical',
  'home',
  'external-link',
  'check',
  'check-circle',
  'check-square',
  'minus',
  'minus-circle',
  'plus-circle',
  'edit',
  'copy',
  'cut',
  'clipboard',
  'download',
  'upload',
  'refresh',
  'link',
  'unlink',
  'share',
  'send',
  'printer',
  'archive',
  'eye',
  'eye-off',
  'lock',
  'unlock',
  'filter',
  'sort-asc',
  'sort-desc',
  'warning',
  'alert-circle',
  'help-circle',
  'bell',
  'bookmark',
  'flag',
  'heart',
  'star',
  'folder',
  'file',
  'file-plus',
  'file-text',
  'image',
  'camera',
  'database',
  'table',
  'list',
  'grid',
  'chart-bar',
  'chart-line',
  'code',
  'terminal',
  'cloud',
  'upload-cloud',
  'download-cloud',
  'user',
  'users',
  'user-plus',
  'mail',
  'phone',
  'globe',
  'map-pin',
  'calendar',
  'clock',
  'pause',
  'stop',
  'skip-back',
  'skip-forward',
  'volume-2',
  'volume-x',
  'video',
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
  'arrow-left': [{ kind: 'path', d: 'M19 12H5m6-6-6 6 6 6' }],
  'arrow-right': [{ kind: 'path', d: 'M5 12h14m-6-6 6 6-6 6' }],
  'arrow-up': [{ kind: 'path', d: 'M12 19V5m-6 6 6-6 6 6' }],
  'arrow-down': [{ kind: 'path', d: 'M12 5v14m-6-6 6 6 6-6' }],
  'chevron-left': [{ kind: 'path', d: 'm14.5 7-5 5 5 5' }],
  'chevron-up': [{ kind: 'path', d: 'm7 14.5 5-5 5 5' }],
  'chevrons-left': [{ kind: 'path', d: 'm11 7-5 5 5 5m7-10-5 5 5 5' }],
  'chevrons-right': [{ kind: 'path', d: 'm13 7 5 5-5 5M6 7l5 5-5 5' }],
  'chevrons-up': [{ kind: 'path', d: 'm7 17 5-5 5 5M7 11l5-5 5 5' }],
  'chevrons-down': [{ kind: 'path', d: 'm7 7 5 5 5-5m-10 6 5 5 5-5' }],
  menu: [{ kind: 'path', d: 'M4 6h16M4 12h16M4 18h16' }],
  'more-horizontal': [
    { kind: 'circle', cx: '6', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '12', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '18', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' },
  ],
  'more-vertical': [
    { kind: 'circle', cx: '12', cy: '6', r: '1.2', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '12', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '12', cy: '18', r: '1.2', fill: 'currentColor', stroke: 'none' },
  ],
  home: [
    { kind: 'path', d: 'm3 11 9-8 9 8v9H3z' },
    { kind: 'path', d: 'M9 20v-6h6v6' },
  ],
  'external-link': [
    { kind: 'path', d: 'M14 4h6v6m0-6-9 9' },
    { kind: 'path', d: 'M19 14v6H4V5h6' },
  ],
  check: [{ kind: 'path', d: 'm5 12 4 4L19 6' }],
  'check-circle': [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'm8 12 2.7 2.7L16.5 9' },
  ],
  'check-square': [
    { kind: 'path', d: 'M4 4h16v16H4z' },
    { kind: 'path', d: 'm8 12 2.7 2.7L16.5 9' },
  ],
  minus: [{ kind: 'path', d: 'M5 12h14' }],
  'minus-circle': [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M8 12h8' },
  ],
  'plus-circle': [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M12 8v8M8 12h8' },
  ],
  edit: [
    { kind: 'path', d: 'm4 20 4.5-1 10-10-3.5-3.5-10 10z' },
    { kind: 'path', d: 'm13 6 3.5 3.5' },
  ],
  copy: [
    { kind: 'path', d: 'M9 4h11v12H9z' },
    { kind: 'path', d: 'M15 16v4H4V8h4' },
  ],
  cut: [
    { kind: 'path', d: 'm7 7 10 10M17 7 7 17' },
    { kind: 'circle', cx: '6', cy: '6', r: '2' },
    { kind: 'circle', cx: '6', cy: '18', r: '2' },
  ],
  clipboard: [
    { kind: 'path', d: 'M8 5h8V3H8zM6 5H5v16h14V5h-1' },
    { kind: 'path', d: 'M8 10h8M8 14h8' },
  ],
  download: [{ kind: 'path', d: 'M12 3v12m-5-5 5 5 5-5M5 21h14' }],
  upload: [{ kind: 'path', d: 'M12 21V9m-5 5 5-5 5 5M5 3h14' }],
  refresh: [
    { kind: 'path', d: 'M20 11a8 8 0 0 0-14-4l-2 3m0-5v5h5' },
    { kind: 'path', d: 'M4 13a8 8 0 0 0 14 4l2-3m0 5v-5h-5' },
  ],
  link: [
    { kind: 'path', d: 'M10 13.5a4 4 0 0 0 5.7.1l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7' },
    { kind: 'path', d: 'M14 10.5a4 4 0 0 0-5.7-.1l-3 3A4 4 0 0 0 11 19.1l1.7-1.7' },
  ],
  unlink: [
    { kind: 'path', d: 'M10 13.5a4 4 0 0 0 5.7.1l3-3a4 4 0 0 0-.1-5.7' },
    { kind: 'path', d: 'M14 10.5a4 4 0 0 0-5.7-.1l-3 3a4 4 0 0 0 .1 5.7' },
    { kind: 'path', d: 'M4 4l16 16' },
  ],
  share: [
    { kind: 'circle', cx: '18', cy: '5', r: '2.5' },
    { kind: 'circle', cx: '6', cy: '12', r: '2.5' },
    { kind: 'circle', cx: '18', cy: '19', r: '2.5' },
    { kind: 'path', d: 'm8.2 10.8 7.5-4.4m-7.5 6.8 7.5 4.4' },
  ],
  send: [
    { kind: 'path', d: 'm3 4 18 8-18 8 4-8z' },
    { kind: 'path', d: 'M7 12h8' },
  ],
  printer: [
    { kind: 'path', d: 'M6 9V4h12v5M6 18h12v2H6z' },
    { kind: 'path', d: 'M4 9h16v9H4zM16 13h.01' },
  ],
  archive: [
    { kind: 'path', d: 'M3 5h18v4H3zM5 9v11h14V9' },
    { kind: 'path', d: 'M10 13h4' },
  ],
  eye: [
    { kind: 'path', d: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z' },
    { kind: 'circle', cx: '12', cy: '12', r: '2.5' },
  ],
  'eye-off': [
    { kind: 'path', d: 'M3 3l18 18' },
    { kind: 'path', d: 'M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3.3 3.9' },
    { kind: 'path', d: 'M6.2 7.2A17.6 17.6 0 0 0 2.5 12S6 18 12 18c1 0 2-.2 2.9-.6' },
    { kind: 'path', d: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' },
  ],
  lock: [
    { kind: 'path', d: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3' },
    { kind: 'path', d: 'M12 15v2' },
  ],
  unlock: [
    { kind: 'path', d: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7-2' },
    { kind: 'path', d: 'M12 15v2' },
  ],
  filter: [{ kind: 'path', d: 'M4 5h16l-6 7v5l-4 2v-7z' }],
  'sort-asc': [{ kind: 'path', d: 'M8 5v14m-3-3 3 3 3-3M13 7h7M13 12h5M13 17h3' }],
  'sort-desc': [{ kind: 'path', d: 'M8 19V5m-3 3 3-3 3 3M13 7h3M13 12h5M13 17h7' }],
  warning: [
    { kind: 'path', d: 'm12 3 10 18H2z' },
    { kind: 'path', d: 'M12 9v4M12 17h.01', strokeWidth: 2.6 },
  ],
  'alert-circle': [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M12 8v5M12 16.5h.01', strokeWidth: 2.6 },
  ],
  'help-circle': [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M9.5 9a2.7 2.7 0 1 1 4.2 2.2c-1 .7-1.7 1.2-1.7 2.8' },
    { kind: 'path', d: 'M12 17.5h.01', strokeWidth: 2.6 },
  ],
  bell: [
    { kind: 'path', d: 'M6 16h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v3.5z' },
    { kind: 'path', d: 'M10 20h4' },
  ],
  bookmark: [{ kind: 'path', d: 'M6 3h12v18l-6-4-6 4z' }],
  flag: [{ kind: 'path', d: 'M5 21V4m0 1h11l-1.5 4 1.5 4H5' }],
  heart: [
    {
      kind: 'path',
      d: 'M20.5 8.5A5.5 5.5 0 0 0 12 5a5.5 5.5 0 0 0-8.5 3.5C3.5 14 12 20 12 20s8.5-6 8.5-11.5Z',
    },
  ],
  star: [
    { kind: 'path', d: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z' },
  ],
  folder: [{ kind: 'path', d: 'M3 6h7l2 2h9v11H3z' }],
  file: [
    { kind: 'path', d: 'M6 3h9l4 4v14H6z' },
    { kind: 'path', d: 'M15 3v5h4' },
  ],
  'file-plus': [
    { kind: 'path', d: 'M6 3h9l4 4v14H6z' },
    { kind: 'path', d: 'M15 3v5h4M12 12v5m-2.5-2.5h5' },
  ],
  'file-text': [
    { kind: 'path', d: 'M6 3h9l4 4v14H6z' },
    { kind: 'path', d: 'M15 3v5h4M9 12h6M9 16h6' },
  ],
  image: [
    { kind: 'path', d: 'M4 5h16v14H4z' },
    { kind: 'circle', cx: '9', cy: '10', r: '1.5' },
    { kind: 'path', d: 'm5 18 5-5 3 3 2-2 4 4' },
  ],
  camera: [
    { kind: 'path', d: 'M4 7h4l1.5-2h5L16 7h4v12H4z' },
    { kind: 'circle', cx: '12', cy: '13', r: '3.5' },
  ],
  database: [
    { kind: 'path', d: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z' },
    { kind: 'path', d: 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6' },
    { kind: 'path', d: 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6' },
  ],
  table: [{ kind: 'path', d: 'M4 5h16v14H4zM4 10h16M10 5v14' }],
  list: [
    { kind: 'path', d: 'M9 6h11M9 12h11M9 18h11' },
    { kind: 'circle', cx: '5', cy: '6', r: '.8', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '5', cy: '12', r: '.8', fill: 'currentColor', stroke: 'none' },
    { kind: 'circle', cx: '5', cy: '18', r: '.8', fill: 'currentColor', stroke: 'none' },
  ],
  grid: [{ kind: 'path', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' }],
  'chart-bar': [{ kind: 'path', d: 'M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7' }],
  'chart-line': [{ kind: 'path', d: 'M4 19V5M4 19h16M6 15l4-4 3 2 5-6' }],
  code: [{ kind: 'path', d: 'm9 7-5 5 5 5m6-10 5 5-5 5' }],
  terminal: [{ kind: 'path', d: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5' }],
  cloud: [{ kind: 'path', d: 'M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 8a4 4 0 0 0 0 10Z' }],
  'upload-cloud': [
    { kind: 'path', d: 'M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 8a4 4 0 0 0 0 10Z' },
    { kind: 'path', d: 'M12 16V9m-3 3 3-3 3 3' },
  ],
  'download-cloud': [
    { kind: 'path', d: 'M7 18h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 8a4 4 0 0 0 0 10Z' },
    { kind: 'path', d: 'M12 9v7m-3-3 3 3 3-3' },
  ],
  user: [
    { kind: 'circle', cx: '12', cy: '8', r: '3.5' },
    { kind: 'path', d: 'M5 21a7 7 0 0 1 14 0' },
  ],
  users: [
    { kind: 'circle', cx: '9', cy: '8', r: '3' },
    { kind: 'circle', cx: '17', cy: '10', r: '2.5' },
    { kind: 'path', d: 'M3 20a6 6 0 0 1 12 0M15 17a5 5 0 0 1 6 3' },
  ],
  'user-plus': [
    { kind: 'circle', cx: '9', cy: '8', r: '3' },
    { kind: 'path', d: 'M3 20a6 6 0 0 1 12 0M18 8v6m-3-3h6' },
  ],
  mail: [{ kind: 'path', d: 'M4 5h16v14H4zM4 7l8 6 8-6' }],
  phone: [
    {
      kind: 'path',
      d: 'M7 3 4.5 5.5c-1 5.8 8.2 15 14 14l2.5-2.5-4-3-2 2c-2.8-1.5-5.5-4.2-7-7l2-2z',
    },
  ],
  globe: [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    {
      kind: 'path',
      d: 'M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z',
    },
  ],
  'map-pin': [
    { kind: 'path', d: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z' },
    { kind: 'circle', cx: '12', cy: '10', r: '2.5' },
  ],
  calendar: [
    { kind: 'path', d: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5' },
    { kind: 'path', d: 'M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01' },
  ],
  clock: [
    { kind: 'circle', cx: '12', cy: '12', r: '9' },
    { kind: 'path', d: 'M12 7v5l3.5 2' },
  ],
  pause: [{ kind: 'path', d: 'M6 5h4v14H6zM14 5h4v14h-4z', fill: 'currentColor', stroke: 'none' }],
  stop: [{ kind: 'path', d: 'M6 6h12v12H6z', fill: 'currentColor', stroke: 'none' }],
  'skip-back': [
    { kind: 'path', d: 'M6 5v14m12-14-9 7 9 7z', fill: 'currentColor', stroke: 'none' },
  ],
  'skip-forward': [
    { kind: 'path', d: 'M18 5v14M6 5l9 7-9 7z', fill: 'currentColor', stroke: 'none' },
  ],
  'volume-2': [
    { kind: 'path', d: 'M4 10h4l5-4v12l-5-4H4z' },
    { kind: 'path', d: 'M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12' },
  ],
  'volume-x': [
    { kind: 'path', d: 'M4 10h4l5-4v12l-5-4H4z' },
    { kind: 'path', d: 'm17 10 4 4m0-4-4 4' },
  ],
  video: [{ kind: 'path', d: 'M4 6h11v12H4zM15 10l5-3v10l-5-3z' }],
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
