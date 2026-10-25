import { createLucideIconElement, type LucideIconName } from './icon.js';
import type { WebMenuConfiguration, WebMenuItem } from './menu-model.js';

export interface WebMenuProjection {
  readonly idPrefix: string;
  readonly collapsed: boolean;
  readonly mobile: boolean;
  readonly query: string;
  readonly selectedItemId: string;
  readonly expanded: ReadonlySet<string>;
  readonly themeMode?: 'light' | 'dark';
}

export function menuElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function menuButton(
  document: Document,
  action: string,
  label: string,
  icon: LucideIconName,
): HTMLButtonElement {
  const button = menuElement(document, 'button', 'wr-menu-icon-button');
  button.type = 'button';
  button.dataset.menuAction = action;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(createLucideIconElement(document, icon));
  return button;
}

function brand(document: Document, config: WebMenuConfiguration): HTMLElement {
  const result = menuElement(
    document,
    config.brand.href || config.brand.page ? 'a' : 'div',
    'wr-menu-brand',
  );
  if (result instanceof HTMLAnchorElement) {
    result.href = config.brand.href || '#';
    result.dataset.menuAction = 'brand';
  }
  if (config.brand.logo) {
    const logo = menuElement(document, 'img', 'wr-menu-logo');
    logo.src = config.brand.logo;
    logo.alt = config.brand.caption;
    logo.width = config.brand.logoSize;
    logo.height = config.brand.logoSize;
    result.append(logo);
  } else {
    const mark = menuElement(document, 'span', 'wr-menu-brand-mark');
    mark.append(createLucideIconElement(document, 'layers'));
    mark.setAttribute('aria-hidden', 'true');
    result.append(mark);
  }
  const copy = menuElement(document, 'span', 'wr-menu-copy');
  copy.append(menuElement(document, 'strong', 'wr-menu-brand-caption', config.brand.caption));
  if (config.brand.subtitle)
    copy.append(menuElement(document, 'small', 'wr-menu-muted', config.brand.subtitle));
  result.append(copy);
  return result;
}

function matchingItems(items: readonly WebMenuItem[], query: string): readonly WebMenuItem[] {
  return items
    .filter((item) => item.visible !== false)
    .flatMap((item) => {
      const children = matchingItems(item.children ?? [], query);
      const matches = `${item.label} ${item.description ?? ''}`.toLocaleLowerCase().includes(query);
      if (query && !matches && children.length === 0) return [];
      return [
        { ...item, children: query && matches ? matchingItems(item.children ?? [], '') : children },
      ];
    });
}

export function createWebMenuPanel(
  document: Document,
  config: WebMenuConfiguration,
  state: WebMenuProjection,
): HTMLElement {
  const panel = menuElement(document, 'div', 'wr-menu-panel');
  const header = menuElement(document, 'div', 'wr-menu-header');
  if (config.brand.visible) header.append(brand(document, config));
  if (config.themeToggle) {
    const dark = state.themeMode === 'dark';
    const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    const toggle = menuButton(document, 'theme', label, dark ? 'sun' : 'moon');
    toggle.classList.add('wr-menu-theme-toggle');
    header.append(toggle);
  }
  if (state.mobile) header.append(menuButton(document, 'close', 'Close menu', 'x'));
  else if (config.collapsible && config.orientation === 'vertical') {
    const toggle = menuButton(
      document,
      'collapse',
      state.collapsed ? 'Expand menu' : 'Collapse menu',
      state.collapsed ? 'panel-left-open' : 'panel-left-close',
    );
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
    header.append(toggle);
  }
  if (header.childElementCount) panel.append(header);
  if (config.searchable) {
    const search = menuElement(document, 'label', 'wr-menu-search');
    search.append(createLucideIconElement(document, 'search'));
    const input = menuElement(document, 'input', 'wr-menu-search-input');
    input.type = 'search';
    input.placeholder = config.searchPlaceholder;
    input.setAttribute('aria-label', config.searchPlaceholder || 'Search menu');
    input.value = state.query;
    input.dataset.menuAction = 'search';
    search.append(input);
    panel.append(search);
  }
  const nav = menuElement(document, 'nav', 'wr-menu-navigation');
  nav.setAttribute('aria-label', config.accessibleLabel);
  const query = config.searchMode === 'event' ? '' : state.query.trim().toLocaleLowerCase();
  const tree = (
    items: readonly WebMenuItem[],
    depth: number,
    disabled: boolean,
  ): HTMLUListElement => {
    const list = menuElement(document, 'ul', depth === 0 ? 'wr-menu-list' : 'wr-menu-submenu');
    for (const item of items) {
      const row = menuElement(document, 'li', 'wr-menu-row');
      if (item.kind === 'separator') {
        row.className = 'wr-menu-separator';
        row.setAttribute('role', 'separator');
      } else if (item.kind === 'heading') {
        row.className = 'wr-menu-heading';
        row.textContent = item.label;
      } else {
        const children = item.children ?? [];
        const hasChildren = children.length > 0;
        const expanded = query !== '' || state.expanded.has(item.id);
        const isDisabled = disabled || item.disabled === true;
        const line = menuElement(document, 'div', 'wr-menu-line');
        const control = menuElement(
          document,
          item.href || item.page ? 'a' : 'button',
          'wr-menu-item',
        );
        control.dataset.menuItem = item.id;
        control.dataset.menuAction = 'item';
        control.title = item.description || item.label;
        control.setAttribute('aria-label', item.label);
        if (control instanceof HTMLAnchorElement) {
          control.href = item.href || '#';
          if (item.target === '_blank') {
            control.target = '_blank';
            control.rel = 'noopener noreferrer';
          }
          if (isDisabled) {
            control.removeAttribute('href');
            control.tabIndex = -1;
          }
        } else if (control instanceof HTMLButtonElement) {
          control.type = 'button';
          control.disabled = isDisabled;
        }
        control.setAttribute('aria-disabled', String(isDisabled));
        if (state.selectedItemId === item.id) control.setAttribute('aria-current', 'page');
        if (item.icon) control.append(createLucideIconElement(document, item.icon));
        else if (state.collapsed) control.append(createLucideIconElement(document, 'circle'));
        const copy = menuElement(document, 'span', 'wr-menu-item-copy');
        copy.append(menuElement(document, 'span', 'wr-menu-label', item.label));
        if (item.description)
          copy.append(menuElement(document, 'small', 'wr-menu-description', item.description));
        control.append(copy);
        if (item.badge) control.append(menuElement(document, 'span', 'wr-menu-badge', item.badge));
        const submenuId = `${state.idPrefix}-${encodeURIComponent(item.id)}`;
        if (hasChildren && !item.href && !item.page) {
          control.setAttribute('aria-controls', submenuId);
          control.setAttribute('aria-expanded', String(expanded));
          control.append(createLucideIconElement(document, 'chevron-down'));
        }
        line.append(control);
        if (hasChildren && (item.href || item.page)) {
          const toggle = menuButton(document, 'submenu', `Toggle ${item.label}`, 'chevron-down');
          toggle.dataset.menuItem = item.id;
          toggle.disabled = isDisabled;
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.setAttribute('aria-controls', submenuId);
          line.append(toggle);
        }
        row.append(line);
        if (hasChildren) {
          const submenu = tree(children, depth + 1, isDisabled);
          submenu.id = submenuId;
          submenu.hidden = !expanded;
          row.append(submenu);
        }
      }
      list.append(row);
    }
    return list;
  };
  const items = matchingItems(config.items, query);
  nav.append(tree(items, 0, false));
  if (items.length === 0) {
    const empty = menuElement(document, 'p', 'wr-menu-empty', config.emptyText);
    empty.setAttribute('role', 'status');
    nav.append(empty);
  }
  panel.append(nav);
  if (config.user.visible) {
    const user = menuElement(document, 'button', 'wr-menu-user');
    user.type = 'button';
    user.dataset.menuAction = 'user';
    user.setAttribute('aria-label', config.user.name || 'User profile');
    const avatar = menuElement(document, 'span', 'wr-menu-avatar');
    if (config.user.avatar) {
      const image = menuElement(document, 'img', 'wr-menu-avatar-image');
      image.src = config.user.avatar;
      image.alt = '';
      avatar.append(image);
    } else
      avatar.textContent =
        config.user.name
          .trim()
          .split(/\s+/u)
          .slice(0, 2)
          .map((part) => part[0] ?? '')
          .join('')
          .toLocaleUpperCase() || '?';
    if (config.user.status !== 'none') {
      const status = menuElement(document, 'span', 'wr-menu-status');
      status.dataset.status = config.user.status;
      status.setAttribute('aria-label', config.user.status);
      avatar.append(status);
    }
    const copy = menuElement(document, 'span', 'wr-menu-copy');
    copy.append(menuElement(document, 'strong', 'wr-menu-label', config.user.name));
    if (config.user.description)
      copy.append(menuElement(document, 'small', 'wr-menu-muted', config.user.description));
    user.append(avatar, copy, createLucideIconElement(document, 'chevrons-up-down'));
    panel.append(user);
  }
  if (config.footerText)
    panel.append(menuElement(document, 'small', 'wr-menu-footer', config.footerText));
  return panel;
}

export function applyWebMenuAppearance(element: HTMLElement, config: WebMenuConfiguration): void {
  for (const [name, value] of Object.entries(config.appearance)) {
    const cssName = name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
    element.style.setProperty(
      `--wr-menu-${cssName}`,
      typeof value === 'number' ? `${String(value)}px` : value,
    );
  }
  element.style.setProperty('--wr-menu-logo-size', `${String(config.brand.logoSize)}px`);
  element.style.setProperty('--wr-menu-drawer-width', `${String(config.drawerWidth)}px`);
}
