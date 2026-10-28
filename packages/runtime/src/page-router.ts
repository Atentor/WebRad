import { Navigate, type NavigateOptions } from './globals.js';
import type { WebPage, WebReusableElementInstance } from './page.js';
import {
  mountPage,
  type MountedRuntimePage,
  type RuntimePageModel,
  type RuntimeMenuFactory,
} from './render.js';

/** A factory for the authored page class that wraps a mounted page element. */
export type RuntimePageFactory = (element: HTMLElement) => WebPage;

/** Creates authored reusable scopes after all physical instances have mounted. */
export type RuntimeReusableElementFactory = (
  mounted: MountedRuntimePage,
) => readonly WebReusableElementInstance[];

/** One browser-safe route in a compiled WebRAD application. */
export interface RuntimePageRoute {
  /** Stable Project Model page ID. */
  readonly id: string;
  /** User-facing, unique page name. */
  readonly name: string;
  /** Absolute application-relative path; blank defaults to the lowercase page name. */
  readonly path?: string;
  /** Runtime projection of the page's visual model. */
  readonly model: RuntimePageModel;
  /** Instantiates the user-authored wrapper after its visual DOM is mounted. */
  readonly createPage: RuntimePageFactory;
  /** Instantiates authored scopes for every reusable placement on this route. */
  readonly createReusableElements?: RuntimeReusableElementFactory;
  readonly menuFactories?: ReadonlyMap<string, RuntimeMenuFactory>;
}

interface ActiveRuntimePage {
  readonly mounted: MountedRuntimePage;
  readonly page: WebPage;
  readonly reusableElements: readonly WebReusableElementInstance[];
  readonly route: RuntimePageRoute;
}

function disposeMountedComponents(mounted: MountedRuntimePage): void {
  mounted.dispose();
  for (const component of mounted.components.values()) component.dispose();
}

function requireRouteField(value: string, field: 'id' | 'name'): void {
  if (value.trim().length === 0) throw new Error(`Runtime page route ${field} must not be empty.`);
}

/**
 * Mounts one authored page at a time inside a browser host. Routes are resolved
 * by stable ID or page name, while lifecycle events and generated handlers stay
 * attached to only the visible page.
 */
export class WebPageRouter {
  readonly #routesById = new Map<string, RuntimePageRoute>();
  readonly #routesByName = new Map<string, RuntimePageRoute>();
  readonly #paths = new Map<string, RuntimePageRoute>();
  readonly #routePaths = new Map<string, string>();
  readonly #mode: 'history' | 'hash';
  readonly #basePath: string;
  readonly #host: HTMLElement;
  readonly #window: Window;
  readonly #onHashChange = (): void => {
    if (this.#entryRoute !== null) this.#navigateFromHash();
  };
  readonly #onMenuNavigate = (event: Event): void => {
    if (event.defaultPrevented) return;
    if (
      !(event instanceof CustomEvent) ||
      typeof event.detail !== 'object' ||
      event.detail === null
    )
      return;
    const detail: unknown = event.detail;
    const destination: unknown = Reflect.get(detail as object, 'destination');
    const target: unknown = Reflect.get(detail as object, 'target');
    if (
      typeof destination !== 'string' ||
      (target !== undefined && target !== '_self' && target !== '_blank')
    )
      return;
    event.preventDefault();
    if (Reflect.get(detail as object, 'page') === true && !this.findRoute(destination))
      throw new Error(`Menu references unknown page "${destination}".`);
    this.navigateBrowser(destination, target === '_blank' ? { newWindow: true } : {});
  };
  #active: ActiveRuntimePage | null = null;
  #entryRoute: RuntimePageRoute | null = null;
  #listeningForHashChanges = false;

  public constructor(
    routes: readonly RuntimePageRoute[],
    host: HTMLElement = document.body,
    options: { readonly mode?: 'history' | 'hash'; readonly basePath?: string } = {},
  ) {
    if (routes.length === 0) throw new Error('WebPageRouter requires at least one page route.');
    this.#host = host;
    const ownerWindow = host.ownerDocument.defaultView;
    if (ownerWindow === null)
      throw new Error('WebPageRouter host must belong to a browser document.');
    this.#window = ownerWindow;
    this.#mode = ['http:', 'https:'].includes(ownerWindow.location.protocol)
      ? (options.mode ?? 'history')
      : 'hash';
    const base =
      this.#mode === 'hash'
        ? null
        : new URL(
            host.ownerDocument.querySelector('base')?.href ?? './',
            ownerWindow.location.href,
          );
    this.#basePath = options.basePath ?? base?.pathname ?? '/';
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(this.#basePath))
      throw new Error('Router basePath must start and end with /.');
    for (const route of routes) {
      requireRouteField(route.id, 'id');
      requireRouteField(route.name, 'name');
      if (route.model.id !== route.id) {
        throw new Error(`Runtime page route "${route.name}" does not match its model ID.`);
      }
      if (route.model.name !== route.name) {
        throw new Error(`Runtime page route "${route.id}" does not match its model name.`);
      }
      if (this.#routesById.has(route.id)) {
        throw new Error(`A runtime page route already uses ID "${route.id}".`);
      }
      if (this.#routesByName.has(route.name)) {
        throw new Error(`A runtime page route already uses name "${route.name}".`);
      }
      const routePath = route.path || '/' + route.name.toLowerCase();
      if (
        !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(routePath) ||
        routePath.split('/').some((part) => ['assets', 'index.html'].includes(part))
      )
        throw new Error('Invalid page route path: ' + routePath);
      if (this.#paths.has(routePath)) throw new Error('Duplicate page route path: ' + routePath);
      this.#paths.set(routePath, route);
      this.#routePaths.set(route.id, routePath);
      this.#routesById.set(route.id, route);
      this.#routesByName.set(route.name, route);
    }
    for (const route of routes) {
      const matchingId = this.#routesById.get(route.name);
      if (matchingId !== undefined && matchingId !== route) {
        throw new Error(
          `Runtime page route name "${route.name}" conflicts with page ID "${matchingId.id}".`,
        );
      }
      const matchingName = this.#routesByName.get(route.id);
      if (matchingName !== undefined && matchingName !== route) {
        throw new Error(
          `Runtime page route ID "${route.id}" conflicts with page name "${matchingName.name}".`,
        );
      }
    }
  }

  /** The currently mounted authored page, if navigation has started. */
  public get activePage(): WebPage | null {
    return this.#active?.page ?? null;
  }

  /** The current route, if navigation has started. */
  public get activeRoute(): RuntimePageRoute | null {
    return this.#active?.route ?? null;
  }

  /** Finds a route by stable page ID or the user-facing page name. */
  public findRoute(destination: string): RuntimePageRoute | undefined {
    return (
      this.#routesById.get(destination) ??
      this.#routesByName.get(destination) ??
      this.#paths.get(destination)
    );
  }

  /**
   * Starts application routing at the entry page (History over HTTP, Hash for files). Direct links and
   * browser history resolve through the same route table.
   */
  public start(entryDestination: string): WebPage {
    const entryRoute = this.findRoute(entryDestination);
    if (entryRoute === undefined) {
      throw new Error(`No WebRAD entry page route matches "${entryDestination}".`);
    }
    this.#entryRoute = entryRoute;
    if (!this.#listeningForHashChanges) {
      this.#host.addEventListener('webrad:menu-navigate', this.#onMenuNavigate);
      this.#window.addEventListener(
        this.#mode === 'hash' ? 'hashchange' : 'popstate',
        this.#onHashChange,
      );
      this.#listeningForHashChanges = true;
    }
    return this.#navigateFromHash();
  }

  /**
   * Extends browser navigation with exact internal page-name and stable-ID
   * matches, while preserving normal URL and new-window navigation otherwise.
   */
  public navigateBrowser(destination: string | URL, options: NavigateOptions = {}): void {
    let route = typeof destination === 'string' ? this.findRoute(destination) : undefined;
    if (route === undefined) {
      const url = new URL(destination, this.#window.location.href);
      const current = this.#window.location;
      const internal =
        url.origin === current.origin &&
        url.protocol === current.protocol &&
        url.pathname.startsWith(this.#basePath) &&
        (url.protocol !== 'file:' || url.pathname === current.pathname);
      if (internal) {
        const path =
          this.#mode === 'hash' && url.hash !== ''
            ? url.hash.slice(1)
            : '/' + url.pathname.slice(this.#basePath.length).replace(/\/$/, '');
        const entryLocation =
          this.#mode === 'hash'
            ? url.hash === '' &&
              (url.pathname === current.pathname || path === '/' || path === '/index.html')
            : path === '/' || path === '/index.html';
        route =
          this.#paths.get(path) ??
          (entryLocation ? (this.#entryRoute ?? undefined) : this.#paths.get('/404'));
      }
    }
    if (route === undefined) {
      Navigate(destination, options);
      return;
    }
    if (options.newWindow === true || options.target !== undefined) {
      const url = new URL(this.#window.location.href);
      if (this.#mode === 'hash') url.hash = this.#routeHash(route);
      else {
        url.pathname = this.#routeUrl(route);
        url.hash = '';
      }
      Navigate(url, options);
      return;
    }

    const url =
      this.#mode === 'hash'
        ? this.#routeHash(route)
        : this.#routeUrl(route) + this.#window.location.search;
    const current =
      this.#mode === 'hash'
        ? this.#window.location.hash
        : this.#window.location.pathname + this.#window.location.search;
    if (current !== url) {
      if (options.replace === true)
        this.#window.history.replaceState(null, '', new URL(url, this.#window.location.href));
      else if (this.#mode === 'hash') this.#window.location.hash = url;
      else this.#window.history.pushState(null, '', url);
    }
    this.navigate(route.id);
  }

  /**
   * Replaces the active page with the target route. Calling it for the active
   * route simply re-shows that page, without recreating its authored state.
   */
  public navigate(destination: string): WebPage {
    const route = this.findRoute(destination);
    if (route === undefined) throw new Error(`No WebRAD page route matches "${destination}".`);
    if (this.#active?.route.id === route.id) {
      if (!this.#active.page.visible) this.#active.page.show();
      return this.#active.page;
    }

    this.#disposeActivePage();
    const mounted = mountPage(route.model, this.#host, { menuFactories: route.menuFactories });
    mounted.element.dataset.webradRoutePath = this.#routePaths.get(route.id) ?? '';
    let page: WebPage;
    let reusableElements: readonly WebReusableElementInstance[] = [];
    try {
      page = route.createPage(mounted.element);
      reusableElements = route.createReusableElements?.(mounted) ?? [];
    } catch (error) {
      mounted.page.close({ remove: true });
      for (const reusableElement of reusableElements) reusableElement.dispose();
      disposeMountedComponents(mounted);
      throw error;
    }

    this.#active = { mounted, page, reusableElements, route };
    try {
      page.show();
      if (this.#active?.page === page)
        this.#window.dispatchEvent(new CustomEvent('webrad:route-change', { detail: route.id }));
    } catch (error) {
      this.#disposeActivePage();
      throw error;
    }
    return page;
  }

  /** Removes the active page and releases all generated event bindings. */
  public dispose(): void {
    this.#host.removeEventListener('webrad:menu-navigate', this.#onMenuNavigate);
    if (this.#listeningForHashChanges) {
      this.#window.removeEventListener(
        this.#mode === 'hash' ? 'hashchange' : 'popstate',
        this.#onHashChange,
      );
      this.#listeningForHashChanges = false;
    }
    this.#entryRoute = null;
    this.#disposeActivePage();
  }

  #routeHash(route: RuntimePageRoute): string {
    return '#' + this.#routePaths.get(route.id);
  }

  #routeUrl(route: RuntimePageRoute): string {
    return this.#basePath + (this.#routePaths.get(route.id) ?? '/').slice(1);
  }

  #routeFromHash(): RuntimePageRoute | undefined {
    if (this.#mode === 'history') {
      const pathname = this.#window.location.pathname;
      if (!pathname.startsWith(this.#basePath)) return undefined;
      const relative = '/' + pathname.slice(this.#basePath.length).replace(/\/$/, '');
      return this.#paths.get(relative);
    }
    if (!this.#window.location.hash.startsWith('#/')) return undefined;
    try {
      const destination = decodeURIComponent(this.#window.location.hash.slice(1));
      return this.findRoute(destination) ?? this.findRoute(destination.slice(1));
    } catch {
      return undefined;
    }
  }

  #navigateFromHash(): WebPage {
    const entryRoute = this.#entryRoute;
    if (entryRoute === null) throw new Error('WebPageRouter has not been started.');
    const matched = this.#routeFromHash();
    if (matched !== undefined) return this.navigate(matched.id);
    const location = this.#window.location;
    const entryLocation =
      this.#mode === 'hash'
        ? location.hash === '' || location.hash === '#'
        : location.pathname === this.#basePath ||
          location.pathname === this.#basePath + 'index.html';
    if (entryLocation) return this.navigate(entryRoute.id);
    const notFound = this.#paths.get('/404');
    if (notFound === undefined) throw new Error('No WebRAD 404 page route is registered.');
    const url =
      this.#mode === 'hash'
        ? this.#routeHash(notFound)
        : this.#routeUrl(notFound) + location.search;
    // Replace an unmatched address so Back does not re-enter a redirect loop.
    this.#window.history.replaceState(null, '', url);
    return this.navigate(notFound.id);
  }

  #disposeActivePage(): void {
    const active = this.#active;
    this.#active = null;
    if (active === null) return;
    try {
      active.page.close({ remove: true });
    } finally {
      for (const reusableElement of active.reusableElements) reusableElement.dispose();
      active.page.dispose();
      disposeMountedComponents(active.mounted);
      // A user OnHide handler can throw before close() removes the root.
      active.page.element.remove();
    }
  }
}
