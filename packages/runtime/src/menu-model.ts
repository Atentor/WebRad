import { isLucideIconName, type LucideIconName } from './icon.js';
import { themeColorReference } from './theme.js';

export interface WebMenuItem {
  readonly id: string;
  readonly label: string;
  readonly kind?: 'item' | 'heading' | 'separator';
  readonly icon?: LucideIconName | '';
  readonly badge?: string;
  readonly description?: string;
  /** Stable project page ID, resolved by the application's router. */
  readonly page?: string;
  readonly href?: string;
  readonly target?: '_self' | '_blank';
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly expanded?: boolean;
  readonly children?: readonly WebMenuItem[];
}

export interface WebMenuBrand {
  readonly visible: boolean;
  readonly caption: string;
  readonly subtitle: string;
  readonly logo: string;
  readonly logoSize: number;
  readonly page: string;
  readonly href: string;
}

export interface WebMenuUser {
  readonly visible: boolean;
  /** Resolve the profile from the project's RestGO session; omitted means manual. */
  readonly bindToCurrentUser?: boolean;
  readonly name: string;
  readonly description: string;
  readonly avatar: string;
  readonly status: 'none' | 'online' | 'away' | 'busy';
}

export interface WebMenuAppearance {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly border: string;
  readonly hoverBackground: string;
  readonly activeBackground: string;
  readonly activeForeground: string;
  readonly accent: string;
  readonly badgeBackground: string;
  readonly badgeForeground: string;
  readonly itemHeight: number;
  readonly itemRadius: number;
  readonly itemGap: number;
  readonly iconSize: number;
  readonly fontSize: number;
  readonly padding: number;
  readonly indent: number;
  readonly collapsedWidth: number;
}

export interface WebMenuConfiguration {
  readonly schemaVersion: 1;
  readonly orientation: 'vertical' | 'horizontal';
  readonly accessibleLabel: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly accordion: boolean;
  readonly searchable: boolean;
  readonly themeToggle: boolean;
  /** Filter while typing, or emit OnSearch when the user presses Enter. */
  readonly searchMode: 'filter' | 'event';
  readonly searchPlaceholder: string;
  readonly emptyText: string;
  readonly footerText: string;
  readonly selectedItemId: string;
  /** Browser viewport width in CSS pixels, independent of the sidebar width. */
  readonly mobileBreakpoint: number;
  /** Side of the hamburger icon in the mobile navigation bar. */
  readonly mobileIconPosition: 'left' | 'right';
  readonly drawerWidth: number;
  readonly drawerSide: 'left' | 'right';
  readonly closeOnSelect: boolean;
  readonly brand: WebMenuBrand;
  readonly user: WebMenuUser;
  readonly appearance: WebMenuAppearance;
  readonly items: readonly WebMenuItem[];
}

export interface WebMenuSearchEvent {
  readonly text: string;
}

export interface WebMenuItemEvent {
  readonly item: WebMenuItem;
  readonly itemId: string;
  readonly path: readonly string[];
}

export interface WebMenuStateEvent {
  readonly collapsed: boolean;
  readonly open: boolean;
}

export interface WebMenuItemToggleEvent extends WebMenuItemEvent {
  readonly expanded: boolean;
}

export const WEB_MENU_THEMES: Readonly<Record<'light' | 'dark', WebMenuAppearance>> = {
  light: {
    background: '#ffffff',
    foreground: '#334155',
    muted: '#64748b',
    border: '#e2e8f0',
    hoverBackground: '#f1f5f9',
    activeBackground: '#eef2ff',
    activeForeground: '#4338ca',
    accent: '#6366f1',
    badgeBackground: '#e0e7ff',
    badgeForeground: '#4338ca',
    itemHeight: 44,
    itemRadius: 10,
    itemGap: 4,
    iconSize: 20,
    fontSize: 14,
    padding: 14,
    indent: 18,
    collapsedWidth: 72,
  },
  dark: {
    background: '#111827',
    foreground: '#e2e8f0',
    muted: '#94a3b8',
    border: '#334155',
    hoverBackground: '#1e293b',
    activeBackground: '#312e81',
    activeForeground: '#e0e7ff',
    accent: '#a5b4fc',
    badgeBackground: '#3730a3',
    badgeForeground: '#e0e7ff',
    itemHeight: 44,
    itemRadius: 10,
    itemGap: 4,
    iconSize: 20,
    fontSize: 14,
    padding: 14,
    indent: 18,
    collapsedWidth: 72,
  },
};

export function createDefaultWebMenuConfiguration(): WebMenuConfiguration {
  return {
    schemaVersion: 1,
    orientation: 'vertical',
    accessibleLabel: 'Main navigation',
    collapsible: true,
    collapsed: false,
    accordion: false,
    searchable: false,
    themeToggle: true,
    searchMode: 'filter',
    searchPlaceholder: 'Search menu…',
    emptyText: 'No items found',
    footerText: '',
    selectedItemId: '',
    mobileBreakpoint: 768,
    mobileIconPosition: 'left',
    drawerWidth: 288,
    drawerSide: 'left',
    closeOnSelect: true,
    brand: {
      visible: true,
      caption: 'Workspace',
      subtitle: 'Your application',
      logo: '',
      logoSize: 36,
      page: '',
      href: '',
    },
    user: {
      visible: false,
      bindToCurrentUser: false,
      name: '',
      description: '',
      avatar: '',
      status: 'none',
    },
    appearance: createProjectWebMenuAppearance(),
    items: [
      { id: 'home', label: 'Home', icon: 'house' },
      {
        id: 'workspace',
        label: 'Workspace',
        icon: 'layers',
        expanded: true,
        children: [
          { id: 'projects', label: 'Projects', icon: 'folder' },
          { id: 'team', label: 'Team', icon: 'users' },
        ],
      },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
  };
}

/** A saved appearance can follow project themes while fixed presets stay available. */
export function createProjectWebMenuAppearance(
  appearance: WebMenuAppearance = WEB_MENU_THEMES.light,
): WebMenuAppearance {
  return {
    ...appearance,
    background: themeColorReference('surface'),
    foreground: themeColorReference('heading'),
    muted: themeColorReference('text-muted'),
    border: themeColorReference('border'),
    hoverBackground: themeColorReference('disabled-surface'),
    activeBackground: themeColorReference('surface-muted'),
    activeForeground: themeColorReference('primary'),
    accent: themeColorReference('primary'),
    badgeBackground: themeColorReference('surface-muted'),
    badgeForeground: themeColorReference('primary'),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts relative, HTTP(S), mail and telephone links; rejects executable schemes. */
export function isWebMenuLink(value: string, image = false): boolean {
  if (
    [...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    value !== value.trim()
  )
    return false;
  if (image && /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);/iu.test(value)) return true;
  if (value.startsWith('//') || value.includes('\\')) return false;
  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(value)?.[1]?.toLowerCase();
  return (
    scheme === undefined ||
    (image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(scheme)
  );
}

/** Strict browser-safe parser used by serialization, the Inspector and runtime. */
export function parseWebMenuConfiguration(value: unknown): WebMenuConfiguration {
  const fail = (field: string): never => {
    throw new TypeError(`Invalid Menu configuration: ${field}.`);
  };
  if (!record(value)) return fail('expected an object');
  const defaults = createDefaultWebMenuConfiguration();
  const exact = (input: Record<string, unknown>, keys: readonly string[], path: string): void => {
    for (const key of Object.keys(input)) if (!keys.includes(key)) fail(`${path}${key} is unknown`);
  };
  exact(value, Object.keys(defaults), '');
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1');
  const text = (input: Record<string, unknown>, name: string, max = 4096): string => {
    const result = input[name];
    return typeof result === 'string' && result.length <= max ? result : fail(name);
  };
  const number = (
    input: Record<string, unknown>,
    name: string,
    min: number,
    max: number,
  ): number => {
    const result = input[name];
    return typeof result === 'number' && Number.isFinite(result) && result >= min && result <= max
      ? result
      : fail(name);
  };
  const choice = <T extends string>(
    input: Record<string, unknown>,
    name: string,
    choices: readonly T[],
  ): T => {
    const result = input[name];
    return typeof result === 'string' && choices.includes(result as T) ? (result as T) : fail(name);
  };
  for (const key of ['collapsible', 'collapsed', 'accordion', 'searchable', 'closeOnSelect'])
    if (typeof value[key] !== 'boolean') fail(key);
  for (const key of [
    'accessibleLabel',
    'searchPlaceholder',
    'emptyText',
    'footerText',
    'selectedItemId',
  ])
    text(value, key);
  choice(value, 'orientation', ['vertical', 'horizontal']);
  const searchMode =
    value.searchMode === undefined ? 'filter' : choice(value, 'searchMode', ['filter', 'event']);
  const themeToggle = value.themeToggle === undefined ? false : value.themeToggle;
  const mobileIconPosition =
    value.mobileIconPosition === undefined
      ? 'left'
      : choice(value, 'mobileIconPosition', ['left', 'right']);
  if (typeof themeToggle !== 'boolean') fail('themeToggle');
  choice(value, 'drawerSide', ['left', 'right']);
  number(value, 'mobileBreakpoint', 0, 4096);
  number(value, 'drawerWidth', 180, 640);
  const brand = value.brand;
  const user = value.user;
  const appearance = value.appearance;
  if (!record(brand) || !record(user) || !record(appearance))
    return fail('brand, user or appearance');
  exact(brand, Object.keys(defaults.brand), 'brand.');
  exact(user, Object.keys(defaults.user), 'user.');
  const bindToCurrentUser = user.bindToCurrentUser === undefined ? false : user.bindToCurrentUser;
  if (typeof bindToCurrentUser !== 'boolean') fail('user.bindToCurrentUser');
  exact(appearance, Object.keys(defaults.appearance), 'appearance.');
  if (typeof brand.visible !== 'boolean' || typeof user.visible !== 'boolean') fail('visible');
  for (const key of ['caption', 'subtitle', 'page', 'href']) text(brand, key);
  for (const key of ['name', 'description']) text(user, key);
  if (
    !isWebMenuLink(text(brand, 'logo', 32 * 1024 * 1024), true) ||
    !isWebMenuLink(text(user, 'avatar', 32 * 1024 * 1024), true) ||
    !isWebMenuLink(text(brand, 'href'))
  )
    fail('brand or user URL');
  number(brand, 'logoSize', 16, 128);
  choice(user, 'status', ['none', 'online', 'away', 'busy']);
  for (const [key, fallback] of Object.entries(defaults.appearance)) {
    if (typeof fallback === 'number')
      number(appearance, key, key === 'collapsedWidth' ? 48 : key === 'itemHeight' ? 32 : 0, 256);
    else if (
      !/^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]+|var\(--[a-z\d-]+\))$/iu.test(
        text(appearance, key, 128),
      )
    )
      fail(`appearance.${key}`);
  }
  const ids = new Set<string>();
  let count = 0;
  const items = (input: unknown, depth: number): void => {
    if (!Array.isArray(input) || (input.length > 0 && depth > 12))
      return fail('items must be arrays with at most 12 levels');
    for (const item of input as unknown[]) {
      if (++count > 1000 || !record(item)) return fail('at most 1000 items');
      exact(
        item,
        [
          'id',
          'label',
          'kind',
          'icon',
          'badge',
          'description',
          'page',
          'href',
          'target',
          'visible',
          'disabled',
          'expanded',
          'children',
        ],
        'items.',
      );
      const id = text(item, 'id', 128);
      if (id.trim() === '' || ids.has(id)) fail('item IDs must be unique and nonempty');
      ids.add(id);
      const kind =
        item.kind === undefined ? 'item' : choice(item, 'kind', ['item', 'heading', 'separator']);
      if (text(item, 'label', 512).trim() === '' && kind !== 'separator') fail('item label');
      if (item.icon !== undefined && item.icon !== '' && !isLucideIconName(item.icon))
        fail('item icon');
      for (const key of ['badge', 'description', 'page', 'href'])
        if (item[key] !== undefined) text(item, key);
      if (item.page && item.href) fail('choose a page or a link for each item');
      if (typeof item.href === 'string' && !isWebMenuLink(item.href)) fail('item href');
      if (item.target !== undefined) choice(item, 'target', ['_self', '_blank']);
      for (const key of ['visible', 'disabled', 'expanded'])
        if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`item ${key}`);
      if (item.children !== undefined) {
        if (kind !== 'item' && Array.isArray(item.children) && item.children.length > 0)
          fail('only items can own submenus');
        items(item.children, depth + 1);
      }
    }
  };
  items(value.items, 1);
  if (value.selectedItemId !== '' && !ids.has(String(value.selectedItemId)))
    fail('selectedItemId does not exist');
  if (brand.page && brand.href) fail('choose a page or link for the brand');
  return structuredClone({
    ...value,
    searchMode,
    themeToggle,
    mobileIconPosition,
    user: { ...user, bindToCurrentUser },
    mobileBreakpoint: 768,
    drawerWidth: 288,
  }) as unknown as WebMenuConfiguration;
}

export function webMenuItemPath(
  items: readonly WebMenuItem[],
  id: string,
  path: readonly string[] = [],
): readonly WebMenuItem[] {
  for (const item of items) {
    if (item.id === id) return [item];
    if (path.includes(item.id)) continue;
    const children = webMenuItemPath(item.children ?? [], id, [...path, item.id]);
    if (children.length > 0) return [item, ...children];
  }
  return [];
}
