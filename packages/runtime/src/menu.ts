import { WebComponent } from './component.js';
import { applyWebMenuAppearance, createWebMenuPanel, menuButton, menuElement } from './menu-dom.js';
import {
  createDefaultWebMenuConfiguration,
  parseWebMenuConfiguration,
  webMenuItemPath,
  type WebMenuConfiguration,
  type WebMenuItem,
  type WebMenuItemEvent,
  type WebMenuStateEvent,
} from './menu-model.js';

export interface WebMenuOptions {
  /** Static projections still use the identical DOM and appearance. */
  readonly interactive?: boolean;
  readonly viewportWidth?: number;
}

const scrollLocks = new WeakMap<Document, { count: number; overflow: string }>();
const menuInstances = new WeakMap<HTMLElement, WebMenu>();
let menuSequence = 0;

/** Responsive navigation with per-instance state, disclosure submenus and a modal mobile drawer. */
export class WebMenu extends WebComponent<HTMLElement> {
  #configuration = createDefaultWebMenuConfiguration();
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
        this.emit('OnUserClick', { ...this.#configuration.user });
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
    if (
      event.target instanceof HTMLInputElement &&
      event.target.dataset.menuAction === 'search' &&
      this.enabled
    ) {
      const start = event.target.selectionStart;
      const end = event.target.selectionEnd;
      this.#query = event.target.value;
      this.#render();
      const search = this.element.querySelector<HTMLInputElement>('.wr-menu-search-input');
      search?.focus();
      if (start !== null && end !== null) search?.setSelectionRange(start, end);
    }
  };
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (event.key === 'Escape') {
      if (this.#open) {
        event.preventDefault();
        this.close();
      } else {
        this.#expanded.clear();
        this.#render();
      }
      return;
    }
    if (event.target instanceof HTMLInputElement) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (!(event.target instanceof HTMLElement)) return;
    const control = event.target.closest<HTMLElement>('[data-menu-item]');
    if (control === null) return;
    const id = control.dataset.menuItem ?? '';
    const path = webMenuItemPath(this.items, id);
    const item = path.at(-1);
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
    if (options.interactive !== false) {
      element.addEventListener('click', this.#onClick);
      element.addEventListener('input', this.#onInput);
      element.addEventListener('keydown', this.#onKeyDown);
      element.ownerDocument.addEventListener('pointerdown', this.#onOutsidePointer);
      element.ownerDocument.defaultView?.addEventListener('resize', this.#onResize);
      element.ownerDocument.defaultView?.addEventListener(
        'webrad:route-change',
        this.#onRouteChange,
      );
    }
    this.configuration = this.#configuration;
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
    if (!value) this.close();
  }
  public set configuration(value: WebMenuConfiguration) {
    const parsed = parseWebMenuConfiguration(value);
    this.close();
    this.#configuration = parsed;
    this.#selectedItemId = parsed.selectedItemId;
    this.#collapsed = parsed.collapsed;
    this.#query = '';
    this.#expanded.clear();
    const visit = (items: readonly WebMenuItem[]): void => {
      for (const item of items) {
        if (item.expanded) this.#expanded.add(item.id);
        visit(item.children ?? []);
      }
    };
    visit(parsed.items);
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
    if (this.#configuration.closeOnSelect) this.close();
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
    menuInstances.delete(this.element);
    this.element.removeEventListener('click', this.#onClick);
    this.element.removeEventListener('input', this.#onInput);
    this.element.removeEventListener('keydown', this.#onKeyDown);
    this.element.ownerDocument.removeEventListener('pointerdown', this.#onOutsidePointer);
    this.element.ownerDocument.defaultView?.removeEventListener('resize', this.#onResize);
    this.element.ownerDocument.defaultView?.removeEventListener(
      'webrad:route-change',
      this.#onRouteChange,
    );
    this.#restoreWidth();
    this.#restoreHeight();
    super.dispose();
  }
  #setExpanded(id: string, expanded: boolean): void {
    const path = webMenuItemPath(this.#configuration.items, id);
    const item = path.at(-1);
    if (!item?.children?.length || path.some((entry) => entry.disabled || entry.visible === false))
      return;
    if (this.#collapsed && !this.#mobile) this.#collapsed = false;
    if (expanded && this.#configuration.accordion) {
      const siblings = path.length > 1 ? (path.at(-2)?.children ?? []) : this.#configuration.items;
      for (const sibling of siblings) this.#expanded.delete(sibling.id);
    }
    if (expanded) this.#expanded.add(id);
    else this.#expanded.delete(id);
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
    this.#configuration = parseWebMenuConfiguration({ ...this.configuration, ...changes });
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
    if ((collapsed || mobile) && this.element.isConnected) {
      this.#expandedWidth ??= {
        value: this.element.style.getPropertyValue('width'),
        priority: this.element.style.getPropertyPriority('width'),
      };
      this.element.style.setProperty(
        'width',
        mobile ? '100%' : `${String(this.#configuration.appearance.collapsedWidth)}px`,
        'important',
      );
    } else this.#restoreWidth();
    if (mobile && this.element.isConnected) {
      this.#desktopHeight ??= {
        value: this.element.style.getPropertyValue('height'),
        priority: this.element.style.getPropertyPriority('height'),
      };
      this.element.style.setProperty('height', '48px', 'important');
    } else this.#restoreHeight();
    applyWebMenuAppearance(this.element, this.#configuration);
    this.element.dataset.menuOrientation = this.orientation;
    this.element.dataset.menuMobile = String(mobile);
    this.element.dataset.menuCollapsed = String(collapsed);
    this.element.dataset.menuStatic = String(this.#options.interactive === false);
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusedItem = focused?.dataset.menuItem;
    const focusedAction = focused?.dataset.menuAction;
    const scrollTop =
      this.element.querySelector<HTMLElement>('.wr-menu-navigation')?.scrollTop ?? 0;
    const panel = createWebMenuPanel(document, this.#configuration, {
      idPrefix: this.#idPrefix,
      collapsed,
      mobile,
      query: this.#query,
      expanded: this.#expanded,
      selectedItemId: this.#selectedItemId,
    });
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
      trigger.append(
        menuElement(document, 'span', 'wr-menu-label', this.#configuration.brand.caption),
      );
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
      this.#dialog.dataset.side = this.#configuration.drawerSide;
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
  }
}
