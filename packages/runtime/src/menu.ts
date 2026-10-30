import { bindWebMenuPopovers } from './menu-popovers.js';
import { webMenuEventHost } from './menu-events.js';
import { setRuntimeLayoutProjection } from './layout.js';
import { projectWebMenuLayout, readWebMenuMargins } from './menu-layout.js';
import { runtimeEventName, WebComponent } from './component.js';
import { createLucideIconElement } from './icon.js';
import { Theme } from './theme.js';
import { bindWebMenuRestGoUser } from './menu-restgo.js';
import { applyWebMenuAppearance, createWebMenuPanel, menuButton, menuElement } from './menu-dom.js';
import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
  webMenuItemPath,
  type WebMenuConfiguration,
  type WebMenuItem,
  type WebMenuItemEvent,
  type WebMenuStateEvent,
  type WebMenuSearchEvent,
} from './menu-model.js';

export interface WebMenuOptions {
  /** Static projections still use the identical DOM and appearance. */
  readonly interactive?: boolean;
  readonly viewportWidth?: number;
  /** Allows embedded previews to change their local theme without changing the application. */
  readonly onThemeToggle?: () => void;
}

const scrollLocks = new WeakMap<Document, { count: number; overflow: string }>();
const menuInstances = new WeakMap<HTMLElement, WebMenu>();
const menuInitializers = new WeakMap<HTMLElement, (menu: WebMenu) => void>();
let menuSequence = 0;

/** Responsive navigation with per-instance state, disclosure submenus and a modal mobile drawer. */
export class WebMenu extends WebComponent<HTMLElement> {
  readonly #definitionHandlers = new Map<string, () => void>();

  /** Apply the saved placement before the authored subclass constructor runs. */
  public static createDefinition(
    element: HTMLElement,
    factory: (element: HTMLElement) => WebMenu,
    initialize: (menu: WebMenu) => void,
  ): WebMenu {
    menuInitializers.set(element, initialize);
    try {
      return factory(element);
    } catch (error) {
      menuInstances.get(element)?.dispose();
      throw error;
    } finally {
      menuInitializers.delete(element);
    }
  }

  /** Resolve the concrete authored Menu already mounted for this element. */
  public static fromElement<T extends WebMenu>(
    element: HTMLElement,
    menuClass: new (element: HTMLElement) => T,
  ): T {
    const menu = menuInstances.get(element);
    if (!(menu instanceof menuClass))
      throw new Error('The mounted Menu does not match its definition.');
    return menu;
  }

  /** Shared handlers precede the containing page's ordinary event bindings. */
  protected bindDefinitionEvent(eventName: string, handlerName: string): void {
    const browserEventName = runtimeEventName(eventName);
    this.#definitionHandlers.get(browserEventName)?.();
    const listener: EventListener = (event) => {
      const handler: unknown = Reflect.get(this, handlerName);
      if (typeof handler === 'function') Reflect.apply(handler, this, [this, event]);
    };
    // At-target capture precedes the page's ordinary listener while preserving
    // the real event target and synchronous preventDefault semantics.
    this.element.addEventListener(browserEventName, listener, { capture: true });
    this.#definitionHandlers.set(browserEventName, () =>
      this.element.removeEventListener(browserEventName, listener, { capture: true }),
    );
  }

  public override emit(eventName: string, detail?: unknown): boolean {
    const event = new CustomEvent(runtimeEventName(eventName), { cancelable: true, detail });
    this.element.dispatchEvent(event);
    const host = webMenuEventHost(this.element);
    if (host !== undefined && !this.#disposed) host.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  readonly #onFocusOut = (): void => {
    queueMicrotask(() => {
      if (
        !this.#disposed &&
        !this.#mobile &&
        this.orientation === 'horizontal' &&
        this.#expanded.size &&
        !this.element.contains(this.element.ownerDocument.activeElement)
      ) {
        this.#expanded.clear();
        this.#render();
      }
    });
  };

  #disposePopovers: (() => void) | undefined;
  #themeObserver: MutationObserver | undefined;
  #themeMode(): 'light' | 'dark' {
    const host =
      this.element.closest<HTMLElement>('[data-webrad-theme]') ??
      this.element.ownerDocument.documentElement;
    return host.dataset.webradTheme === 'dark' ? 'dark' : 'light';
  }
  #syncThemeToggle(): void {
    if (this.#disposed) return;
    const dark = this.#themeMode() === 'dark';
    for (const control of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-menu-action="theme"]',
    )) {
      const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
      control.setAttribute('aria-label', label);
      control.title = label;
      control.replaceChildren(
        createLucideIconElement(this.element.ownerDocument, dark ? 'sun' : 'moon'),
      );
    }
  }
  #layoutSignature = '';
  public get floatingZIndex(): number {
    return 1000;
  }

  #marginOwner(): HTMLElement {
    return (
      this.element.closest<HTMLElement>('.wr-webreusableelement[data-menu-managed="true"]') ??
      this.element
    );
  }
  #setMargin(
    property: 'margin' | 'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft',
    value: number,
  ): void {
    if (!Number.isFinite(value)) throw new RangeError(property + ' must be a finite number.');
    const owner = this.#marginOwner();
    owner.style[property] = String(value) + 'px';
    if (owner !== this.element) {
      this.element.style[property] = '0px';
      owner.dispatchEvent(new Event('webrad-placement-change'));
    }
    this.#render();
  }
  public override get margin(): number {
    return Number.parseFloat(this.#marginOwner().style.margin) || 0;
  }
  public override get marginTop(): number {
    return Number.parseFloat(this.#marginOwner().style.marginTop) || 0;
  }
  public override set marginTop(value: number) {
    this.#setMargin('marginTop', value);
  }
  public override get marginRight(): number {
    return Number.parseFloat(this.#marginOwner().style.marginRight) || 0;
  }
  public override set marginRight(value: number) {
    this.#setMargin('marginRight', value);
  }
  public override get marginBottom(): number {
    return Number.parseFloat(this.#marginOwner().style.marginBottom) || 0;
  }
  public override set marginBottom(value: number) {
    this.#setMargin('marginBottom', value);
  }
  public override get marginLeft(): number {
    return Number.parseFloat(this.#marginOwner().style.marginLeft) || 0;
  }
  public override set marginLeft(value: number) {
    this.#setMargin('marginLeft', value);
  }
  public override set margin(value: number) {
    this.#setMargin('margin', value);
  }
  public get placement(): 'floating' {
    return 'floating';
  }
  public get floatingHorizontalAnchor(): 'left' | 'center' | 'right' {
    const owner = this.element.closest<HTMLElement>(
      '.wr-webreusableelement[data-menu-managed="true"]',
    );
    const value =
      owner?.dataset.webradFloatingHorizontalAnchor ??
      this.element.dataset.webradFloatingHorizontalAnchor;
    return value === 'center' || value === 'right' ? value : 'left';
  }
  public set floatingHorizontalAnchor(value: 'left' | 'center' | 'right') {
    if (value !== 'left' && value !== 'center' && value !== 'right')
      throw new TypeError('Menu side must be left, center or right.');
    const owner = this.element.closest<HTMLElement>(
      '.wr-webreusableelement[data-menu-managed="true"]',
    );
    (owner ?? this.element).dataset.webradFloatingHorizontalAnchor = value;
    owner?.dispatchEvent(new Event('webrad-placement-change'));
    this.#render();
  }
  public get floatingVerticalAnchor(): 'top' | 'center' | 'bottom' {
    const owner = this.element.closest<HTMLElement>(
      '.wr-webreusableelement[data-menu-managed="true"]',
    );
    const value =
      owner?.dataset.webradFloatingVerticalAnchor ??
      this.element.dataset.webradFloatingVerticalAnchor;
    return value === 'center' || value === 'bottom' ? value : 'top';
  }
  public set floatingVerticalAnchor(value: 'top' | 'center' | 'bottom') {
    if (value !== 'top' && value !== 'center' && value !== 'bottom')
      throw new TypeError('Menu side must be top, center or bottom.');
    const owner = this.element.closest<HTMLElement>(
      '.wr-webreusableelement[data-menu-managed="true"]',
    );
    (owner ?? this.element).dataset.webradFloatingVerticalAnchor = value;
    owner?.dispatchEvent(new Event('webrad-placement-change'));
    this.#render();
  }

  #configuration = createDefaultWebMenuConfiguration();
  #unbindRestGoUser: (() => void) | undefined;
  #restGoUser: WebMenuConfiguration['user'] | null = null;

  #syncRestGoUser(): void {
    if (this.#disposed) return;
    if (this.#configuration.user.bindToCurrentUser && this.#options.interactive !== false) {
      this.#unbindRestGoUser ??= bindWebMenuRestGoUser((user) => {
        if (JSON.stringify(user) === JSON.stringify(this.#restGoUser)) return;
        this.#restGoUser = user;
        this.#render();
      });
    } else {
      this.#unbindRestGoUser?.();
      this.#unbindRestGoUser = undefined;
      this.#restGoUser = null;
    }
  }

  #projectedUser(): WebMenuConfiguration['user'] {
    const user = this.#configuration.user;
    if (!user.bindToCurrentUser || this.#options.interactive === false) return user;
    return this.#restGoUser
      ? { ...this.#restGoUser, visible: user.visible }
      : { ...user, visible: false, name: '', description: '', avatar: '', status: 'none' };
  }
  #expanded = new Set<string>();
  #selectedItemId = '';
  #collapsed = false;
  #query = '';
  #open = false;
  #mobile = false;
  #disposed = false;
  #expandedWidth: { value: string; priority: string } | undefined;
  #desktopHeight: { value: string; priority: string } | undefined;
  #dialog: HTMLDialogElement | null = null;
  readonly #options: WebMenuOptions;
  readonly #idPrefix: string;
  readonly #onRouteChange = (event: Event): void => {
    if (
      !(event instanceof CustomEvent) ||
      typeof event.detail !== 'string' ||
      !this.element.isConnected
    )
      return;
    const find = (items: readonly WebMenuItem[]): WebMenuItem | undefined => {
      for (const item of items) {
        if (item.page === event.detail && item.visible !== false && !item.disabled) return item;
        const child = find(item.children ?? []);
        if (child && item.visible !== false && !item.disabled) return child;
      }
      return undefined;
    };
    const active = find(this.#configuration.items);
    if (active) this.selectedItemId = active.id;
  };
  readonly #onResize = (): void => {
    if (!this.#disposed) this.#render();
  };
  readonly #onOutsidePointer = (event: PointerEvent): void => {
    if (
      this.orientation !== 'horizontal' ||
      this.#mobile ||
      this.#expanded.size === 0 ||
      !(event.target instanceof Node) ||
      this.element.contains(event.target)
    )
      return;
    this.#expanded.clear();
    this.#render();
  };
  readonly #onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('[data-menu-action]');
    if (control === null || !this.element.contains(control)) return;
    if (control.dataset.menuAction === 'search') return;
    event.preventDefault();
    if (!this.enabled || control.getAttribute('aria-disabled') === 'true') return;
    const id = control.dataset.menuItem ?? '';
    switch (control.dataset.menuAction) {
      case 'open':
        this.open();
        break;
      case 'close':
        this.close();
        break;
      case 'collapse':
        this.collapsed = !this.collapsed;
        break;
      case 'user':
        this.emit('OnUserClick', { ...this.#projectedUser() });
        break;
      case 'theme':
        if (this.#options.onThemeToggle) this.#options.onThemeToggle();
        else Theme.toggle();
        this.#syncThemeToggle();
        break;
      case 'brand':
        if (this.emit('OnBrandClick', { ...this.#configuration.brand }))
          this.#navigate(this.#configuration.brand.page, this.#configuration.brand.href);
        break;
      case 'submenu':
        this.toggleItem(id);
        break;
      case 'item':
        this.activateItem(id);
        break;
    }
  };
  readonly #onInput = (event: Event): void => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      input.dataset.menuAction !== 'search' ||
      !this.enabled ||
      this.#query === input.value
    )
      return;
    this.#query = input.value;
    if (this.searchMode === 'event') return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    this.#render();
    const search = this.element.querySelector<HTMLInputElement>('.wr-menu-search-input');
    search?.focus();
    if (start !== null && end !== null) search?.setSelectionRange(start, end);
  };
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (event.key === 'Escape') {
      if (this.#open) {
        event.preventDefault();
        this.close();
      } else if (this.#expanded.size) {
        event.preventDefault();
        const control =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-menu-item]')
            : null;
        const path = webMenuItemPath(this.items, control?.dataset.menuItem ?? '');
        const owner = path.length > 1 ? path.at(-2) : path[0];
        if (owner) {
          this.collapseItem(owner.id);
          this.focusItem(owner.id);
        } else {
          this.#expanded.clear();
          this.#render();
        }
      }
      return;
    }
    if (event.target instanceof HTMLInputElement) {
      const input = event.target;
      if (input.dataset.menuAction === 'search' && event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        if (this.searchMode === 'event' && !event.repeat) {
          this.#query = input.value;
          this.emit('OnSearch', { text: this.#query } satisfies WebMenuSearchEvent);
        }
      }
      return;
    }
    if (!(event.target instanceof HTMLElement)) return;
    const control = event.target.closest<HTMLElement>('[data-menu-item]');
    if (control === null) return;
    const id = control.dataset.menuItem ?? '';
    const path = webMenuItemPath(this.items, id);
    const item = path.at(-1);
    if (
      event.key === 'ArrowDown' &&
      this.orientation === 'horizontal' &&
      !this.#mobile &&
      path.length === 1 &&
      item?.children?.length
    ) {
      event.preventDefault();
      this.expandItem(id);
      const first = item.children.find((child) => child.visible !== false && !child.disabled);
      if (first) this.focusItem(first.id);
      return;
    }
    if (!item) return;
    if (event.key === 'ArrowRight' && item.children?.length) {
      event.preventDefault();
      this.expandItem(id);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (this.#expanded.has(id)) this.collapseItem(id);
      else {
        const parent = path.at(-2);
        if (parent) this.focusItem(parent.id);
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const controls = [
      ...this.element.querySelectorAll<HTMLElement>('.wr-menu-item:not([aria-disabled="true"])'),
    ].filter((candidate) => candidate.getClientRects().length > 0);
    const index = controls.indexOf(control);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
    controls[next]?.focus();
  };

  public constructor(element: HTMLElement, options: WebMenuOptions = {}) {
    super(element);
    this.#options = options;
    this.#idPrefix = `wr-menu-${String(++menuSequence)}`;
    const existing = menuInstances.get(element);
    if (existing) return existing;
    menuInstances.set(element, this);
    element.classList.add('wr-webmenu');
    const themeHost =
      element.closest('[data-webrad-theme]') ?? element.ownerDocument.documentElement;
    this.#themeObserver = new MutationObserver(() => this.#syncThemeToggle());
    this.#themeObserver.observe(themeHost, {
      attributes: true,
      attributeFilter: ['data-webrad-theme'],
    });
    if (options.interactive !== false) {
      element.addEventListener('click', this.#onClick);
      element.addEventListener('input', this.#onInput);
      element.addEventListener('keydown', this.#onKeyDown);
      element.addEventListener('focusout', this.#onFocusOut);
      element.ownerDocument.addEventListener('pointerdown', this.#onOutsidePointer);
      element.ownerDocument.defaultView?.addEventListener('resize', this.#onResize);
      element.ownerDocument.defaultView?.addEventListener(
        'webrad:route-change',
        this.#onRouteChange,
      );
    }
    this.configuration = this.#configuration;
    menuInitializers.get(element)?.(this);
    queueMicrotask(() => {
      if (!this.#disposed && this.element.isConnected) this.#render();
    });
  }

  public get configuration(): WebMenuConfiguration {
    return structuredClone({
      ...this.#configuration,
      collapsed: this.#collapsed,
      selectedItemId: this.#selectedItemId,
    });
  }
  public override get enabled(): boolean {
    return super.enabled;
  }
  public override set enabled(value: boolean) {
    super.enabled = value;
    this.element.inert = !value;
    if (!value) {
      this.close();
      this.#expanded.clear();
      this.#render();
    }
  }
  public set configuration(value: WebMenuConfiguration) {
    const parsed = parseWebMenuConfiguration(value);
    this.close();
    this.#configuration = parsed;
    this.#syncRestGoUser();
    this.#selectedItemId = parsed.selectedItemId;
    this.#collapsed = parsed.collapsed;
    this.#query = '';
    this.#expanded.clear();
    const visit = (items: readonly WebMenuItem[]): void => {
      for (const item of items) {
        if (item.expanded && parsed.orientation === 'vertical') this.#expanded.add(item.id);
        visit(item.children ?? []);
      }
    };
    visit(parsed.items);
    if (parsed.orientation === 'vertical')
      for (const item of webMenuItemPath(parsed.items, this.#selectedItemId).slice(0, -1))
        this.#expanded.add(item.id);
    this.#render();
  }
  public get items(): readonly WebMenuItem[] {
    return structuredClone(this.#configuration.items);
  }
  public set items(value: readonly WebMenuItem[]) {
    const parsed = parseWebMenuConfiguration({
      ...this.configuration,
      items: value,
      selectedItemId: '',
    });
    const selectedItemId = webMenuItemPath(parsed.items, this.#selectedItemId).length
      ? this.#selectedItemId
      : '';
    const expanded = new Set(this.#expanded);
    this.#configuration = { ...parsed, selectedItemId };
    this.#selectedItemId = selectedItemId;
    this.#expanded = new Set(
      [...expanded].filter((id) => webMenuItemPath(parsed.items, id).length > 0),
    );
    this.#render();
  }
  public get orientation(): WebMenuConfiguration['orientation'] {
    return this.#configuration.orientation;
  }
  public set orientation(value: WebMenuConfiguration['orientation']) {
    this.#patchConfiguration({ orientation: value });
  }
  public get brand(): WebMenuConfiguration['brand'] {
    return structuredClone(this.#configuration.brand);
  }
  public set brand(value: WebMenuConfiguration['brand']) {
    this.#patchConfiguration({ brand: value });
  }
  public get user(): WebMenuConfiguration['user'] {
    return structuredClone(this.#configuration.user);
  }
  public set user(value: WebMenuConfiguration['user']) {
    this.#patchConfiguration({ user: value });
  }
  public get appearance(): WebMenuConfiguration['appearance'] {
    return { ...this.#configuration.appearance };
  }
  public set appearance(value: WebMenuConfiguration['appearance']) {
    this.#patchConfiguration({ appearance: value });
  }
  public get selectedItemId(): string {
    return this.#selectedItemId;
  }
  public set selectedItemId(value: string) {
    if (value && !webMenuItemPath(this.#configuration.items, value).length)
      throw new RangeError(`Unknown menu item: ${value}`);
    this.#selectedItemId = value;
    if (this.orientation === 'vertical')
      for (const item of webMenuItemPath(this.#configuration.items, value).slice(0, -1))
        this.#expanded.add(item.id);
    this.#render();
  }
  public get collapsed(): boolean {
    return this.#collapsed;
  }
  public set collapsed(value: boolean) {
    if (typeof value !== 'boolean') throw new TypeError('collapsed must be boolean.');
    if (this.#collapsed === value) return;
    this.#collapsed = value;
    this.#render();
    this.emit('OnCollapseChange', {
      collapsed: value,
      open: this.#open,
    } satisfies WebMenuStateEvent);
  }
  public get isOpen(): boolean {
    return this.#open;
  }
  public get isMobile(): boolean {
    return this.#mobile;
  }
  public get searchMode(): WebMenuConfiguration['searchMode'] {
    return this.#configuration.searchMode;
  }
  public get themeToggle(): boolean {
    return this.#configuration.themeToggle;
  }
  public set themeToggle(value: boolean) {
    this.#patchConfiguration({ themeToggle: value });
  }
  public set searchMode(value: WebMenuConfiguration['searchMode']) {
    this.#patchConfiguration({ searchMode: value });
  }
  public get searchText(): string {
    return this.#query;
  }
  public set searchText(value: string) {
    this.#query = String(value);
    this.#render();
  }
  public findItem(id: string): WebMenuItem | undefined {
    const item = webMenuItemPath(this.#configuration.items, id).at(-1);
    return item ? structuredClone(item) : undefined;
  }
  public updateItem(id: string, changes: Partial<Omit<WebMenuItem, 'id'>>): void {
    if (!this.findItem(id)) throw new RangeError(`Unknown menu item: ${id}`);
    const update = (items: readonly WebMenuItem[]): readonly WebMenuItem[] =>
      items.map((item) =>
        item.id === id
          ? { ...item, ...changes, id }
          : { ...item, ...(item.children ? { children: update(item.children) } : {}) },
      );
    this.items = update(this.#configuration.items);
  }
  public expandItem(id: string): void {
    this.#setExpanded(id, true);
  }
  public collapseItem(id: string): void {
    this.#setExpanded(id, false);
  }
  public toggleItem(id: string): void {
    this.#setExpanded(id, !this.#expanded.has(id));
  }
  public focusItem(id: string): void {
    for (const control of this.element.querySelectorAll<HTMLElement>('.wr-menu-item'))
      if (control.dataset.menuItem === id) {
        control.focus();
        return;
      }
  }
  public activateItem(id: string): void {
    const path = webMenuItemPath(this.#configuration.items, id);
    const item = path.at(-1);
    if (
      !this.enabled ||
      !item ||
      (item.kind && item.kind !== 'item') ||
      path.some((entry) => entry.visible === false || entry.disabled)
    )
      return;
    if (item.children?.length && !item.href && !item.page) {
      this.toggleItem(id);
      return;
    }
    const detail: WebMenuItemEvent = {
      item: structuredClone(item),
      itemId: id,
      path: path.map((entry) => entry.id),
    };
    if (!this.emit('OnItemClick', detail) || this.#disposed) return;
    this.#selectedItemId = id;
    this.emit('OnSelectionChange', detail);
    if (this.#disposed) return;
    if (this.#configuration.closeOnSelect) {
      if (this.orientation === 'horizontal') this.#expanded.clear();
      this.close();
    }
    this.#render();
    this.#navigate(item.page ?? '', item.href ?? '', item.target);
  }
  public open(): void {
    if (this.#options.interactive === false || this.#disposed || !this.enabled) return;
    if (!this.#mobile) {
      this.collapsed = false;
      return;
    }
    if (this.#open) return;
    this.#open = true;
    this.#render();
    const dialog = this.#dialog;
    if (!dialog) return;
    try {
      dialog.showModal();
    } catch (error) {
      this.#open = false;
      this.#render();
      throw error;
    }
    const document = this.element.ownerDocument;
    const lock = scrollLocks.get(document) ?? { count: 0, overflow: document.body.style.overflow };
    lock.count++;
    scrollLocks.set(document, lock);
    document.body.style.overflow = 'hidden';
    this.emit('OnOpen', { open: true, collapsed: this.#collapsed } satisfies WebMenuStateEvent);
  }
  public close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#dialog?.close();
    const document = this.element.ownerDocument;
    const lock = scrollLocks.get(document);
    if (lock && --lock.count === 0) {
      document.body.style.overflow = lock.overflow;
      scrollLocks.delete(document);
    }
    this.#render();
    this.element.querySelector<HTMLButtonElement>('[data-menu-action="open"]')?.focus();
    this.emit('OnClose', { open: false, collapsed: this.#collapsed } satisfies WebMenuStateEvent);
  }
  public toggle(): void {
    if (this.#mobile) {
      if (this.#open) this.close();
      else this.open();
    } else this.collapsed = !this.collapsed;
  }
  public override dispose(): void {
    if (this.#disposed) return;
    this.close();
    this.#disposed = true;
    this.#unbindRestGoUser?.();
    this.#unbindRestGoUser = undefined;
    for (const dispose of this.#definitionHandlers.values()) dispose();
    this.#definitionHandlers.clear();
    this.#themeObserver?.disconnect();
    menuInstances.delete(this.element);
    this.element.removeEventListener('click', this.#onClick);
    this.element.removeEventListener('input', this.#onInput);
    this.element.removeEventListener('keydown', this.#onKeyDown);
    this.element.removeEventListener('focusout', this.#onFocusOut);
    this.element.ownerDocument.removeEventListener('pointerdown', this.#onOutsidePointer);
    this.element.ownerDocument.defaultView?.removeEventListener('resize', this.#onResize);
    this.element.ownerDocument.defaultView?.removeEventListener(
      'webrad:route-change',
      this.#onRouteChange,
    );
    this.#restoreWidth();
    this.#restoreHeight();
    setRuntimeLayoutProjection(this.element, null);
    this.#disposePopovers?.();
    this.#disposePopovers = undefined;
    super.dispose();
  }
  #setExpanded(id: string, expanded: boolean): void {
    const path = webMenuItemPath(this.#configuration.items, id);
    const item = path.at(-1);
    if (!item?.children?.length || path.some((entry) => entry.disabled || entry.visible === false))
      return;
    if (this.#collapsed && !this.#mobile) this.#collapsed = false;
    if (expanded && (this.#configuration.accordion || this.orientation === 'horizontal')) {
      const siblings = path.length > 1 ? (path.at(-2)?.children ?? []) : this.#configuration.items;
      const closeBranch = (entry: WebMenuItem): void => {
        this.#expanded.delete(entry.id);
        for (const child of entry.children ?? []) closeBranch(child);
      };
      for (const sibling of siblings) if (sibling.id !== id) closeBranch(sibling);
    }
    if (expanded) {
      for (const parent of path.slice(0, -1)) this.#expanded.add(parent.id);
      this.#expanded.add(id);
    } else {
      const close = (entry: WebMenuItem): void => {
        this.#expanded.delete(entry.id);
        for (const child of entry.children ?? []) close(child);
      };
      close(item);
    }
    this.#render();
    this.focusItem(id);
    this.emit('OnItemToggle', {
      item: structuredClone(item),
      itemId: id,
      path: path.map((entry) => entry.id),
      expanded,
    });
  }
  #patchConfiguration(changes: Partial<WebMenuConfiguration>): void {
    if (changes.orientation !== undefined && changes.orientation !== this.orientation)
      this.#expanded.clear();
    this.#configuration = parseWebMenuConfiguration({ ...this.configuration, ...changes });
    this.#syncRestGoUser();
    this.#render();
  }
  #navigate(page: string, href: string, target?: '_self' | '_blank'): void {
    if (!page && !href) return;
    const request = new CustomEvent('webrad:menu-navigate', {
      bubbles: true,
      cancelable: true,
      detail: { destination: page || href, target, page: Boolean(page) },
    });
    if (!this.element.dispatchEvent(request)) return;
    if (page) throw new Error('Menu page navigation requires WebPageRouter.');
    const window = this.element.ownerDocument.defaultView;
    if (target === '_blank') window?.open(href, '_blank', 'noopener,noreferrer');
    else window?.location.assign(href);
  }
  #restoreWidth(): void {
    if (!this.#expandedWidth) return;
    if (this.#expandedWidth.value)
      this.element.style.setProperty(
        'width',
        this.#expandedWidth.value,
        this.#expandedWidth.priority,
      );
    else this.element.style.removeProperty('width');
    this.#expandedWidth = undefined;
  }
  #restoreHeight(): void {
    if (!this.#desktopHeight) return;
    if (this.#desktopHeight.value)
      this.element.style.setProperty(
        'height',
        this.#desktopHeight.value,
        this.#desktopHeight.priority,
      );
    else this.element.style.removeProperty('height');
    this.#desktopHeight = undefined;
  }
  #render(): void {
    if (this.#disposed) return;
    const document = this.element.ownerDocument;
    const viewport = this.#options.viewportWidth ?? document.defaultView?.innerWidth ?? 1024;
    const mobile = viewport < this.#configuration.mobileBreakpoint;
    if (!mobile && this.#open) {
      this.close();
      return;
    }
    this.#mobile = mobile;
    const collapsed = this.#collapsed && !mobile && this.orientation === 'vertical';
    const layoutConfiguration = { ...this.#configuration, collapsed: this.#collapsed };
    const horizontalAnchor = this.floatingHorizontalAnchor;
    const verticalAnchor = this.floatingVerticalAnchor;
    const liveMargins = readWebMenuMargins(this.element);
    const viewportHeight = document.defaultView?.innerHeight;
    const managed = setRuntimeLayoutProjection(this.element, (node) =>
      projectWebMenuLayout(
        {
          ...node,
          props: {
            ...node.props,
            ...liveMargins,
            floatingHorizontalAnchor: horizontalAnchor,
            floatingVerticalAnchor: verticalAnchor,
          },
        },
        viewport,
        layoutConfiguration,
        undefined,
        viewportHeight,
      ),
    );
    if (!managed && this.#options.interactive !== false && collapsed && this.element.isConnected) {
      this.#expandedWidth ??= {
        value: this.element.style.getPropertyValue('width'),
        priority: this.element.style.getPropertyPriority('width'),
      };
      this.element.style.setProperty(
        'width',
        `${String(this.#configuration.appearance.collapsedWidth)}px`,
        'important',
      );
    } else if (managed) this.#expandedWidth = undefined;
    else this.#restoreWidth();
    if (!managed && this.#options.interactive !== false && mobile && this.element.isConnected) {
      this.#desktopHeight ??= {
        value: this.element.style.getPropertyValue('height'),
        priority: this.element.style.getPropertyPriority('height'),
      };
      this.element.style.setProperty('height', '48px', 'important');
    } else if (managed) this.#desktopHeight = undefined;
    else this.#restoreHeight();
    applyWebMenuAppearance(this.element, this.#configuration);
    const owner =
      this.element.closest<HTMLElement>('.wr-webreusableelement[data-menu-managed="true"]') ??
      this.element;
    const style = document.defaultView?.getComputedStyle(owner);
    const minimum = Number.parseFloat(style?.minWidth ?? '') || 0;
    const maximum = Number.parseFloat(style?.maxWidth ?? '') || Number.POSITIVE_INFINITY;
    const preferred =
      Number(owner.dataset.menuPreferredWidth ?? this.element.dataset.menuPreferredWidth) || 288;
    this.element.style.setProperty(
      '--wr-menu-drawer-width',
      `${Math.max(0, Math.min(viewport * 0.92, Math.max(minimum, Math.min(preferred, maximum))))}px`,
    );
    this.element.dataset.menuOrientation = this.orientation;
    this.element.dataset.menuMobile = String(mobile);
    this.element.dataset.menuCollapsed = String(collapsed);
    this.element.dataset.menuStatic = String(this.#options.interactive === false);
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedItem = focused?.dataset.menuItem;
    const focusedAction = focused?.dataset.menuAction;
    const scrollTop =
      this.element.querySelector<HTMLElement>('.wr-menu-navigation')?.scrollTop ?? 0;
    this.#disposePopovers?.();
    this.#disposePopovers = undefined;
    const panel = createWebMenuPanel(
      document,
      { ...this.#configuration, user: this.#projectedUser() },
      {
        idPrefix: this.#idPrefix,
        themeMode: this.#themeMode(),
        collapsed,
        mobile,
        query: this.#query,
        expanded: this.#expanded,
        selectedItemId: this.#selectedItemId,
      },
    );
    if (mobile) {
      const trigger = menuButton(
        document,
        'open',
        this.#configuration.accessibleLabel || 'Open menu',
        'menu',
      );
      trigger.classList.add('wr-menu-mobile-trigger');
      trigger.setAttribute('aria-expanded', String(this.#open));
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', `${this.#idPrefix}-drawer`);
      const label = menuElement(
        document,
        'span',
        'wr-menu-label',
        this.#configuration.brand.caption,
      );
      if (this.#configuration.mobileIconPosition === 'right') trigger.prepend(label);
      else trigger.append(label);
      if (!this.#dialog) {
        this.#dialog = menuElement(document, 'dialog', 'wr-menu-dialog');
        this.#dialog.id = `${this.#idPrefix}-drawer`;
        this.#dialog.setAttribute('aria-label', this.#configuration.accessibleLabel);
        this.#dialog.addEventListener('cancel', (event) => {
          event.preventDefault();
          this.close();
        });
        const dialog = this.#dialog;
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog) {
            const bounds = dialog.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              this.close();
          }
        });
      }
      this.#dialog.dataset.side = this.floatingHorizontalAnchor;
      this.#dialog.replaceChildren(panel);
      // Keep an open dialog connected; removing it would discard its top-layer state.
      if (this.#dialog.parentElement === this.element) {
        for (const child of [...this.element.children]) if (child !== this.#dialog) child.remove();
        this.element.prepend(trigger);
      } else this.element.replaceChildren(trigger, this.#dialog);
    } else {
      this.#dialog = null;
      this.element.replaceChildren(panel);
    }
    const navigation = this.element.querySelector<HTMLElement>('.wr-menu-navigation');
    if (navigation) navigation.scrollTop = scrollTop;
    if (!mobile && this.orientation === 'horizontal' && this.#options.interactive !== false)
      this.#disposePopovers = bindWebMenuPopovers(this.element);
    if (focusedItem && focused && !focused.isConnected) this.focusItem(focusedItem);
    else if (focusedAction && focused && !focused.isConnected)
      for (const control of this.element.querySelectorAll<HTMLElement>('[data-menu-action]'))
        if (control.dataset.menuAction === focusedAction) {
          control.focus();
          break;
        }
    if (this.#options.interactive === false)
      for (const control of this.element.querySelectorAll<HTMLElement>('a,button,input'))
        control.tabIndex = -1;

    const signature = `${mobile}:${collapsed}:${this.orientation}:${this.floatingHorizontalAnchor}:${this.floatingVerticalAnchor}:${this.#configuration.appearance.collapsedWidth}`;
    if (managed && signature !== this.#layoutSignature) {
      this.#layoutSignature = signature;
      this.element.dispatchEvent(new Event('webrad:menu-layout-change', { bubbles: true }));
    }
  }
}
