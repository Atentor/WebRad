import { Navigate, type NavigateOptions } from './globals.js';
import type { WebPage, WebReusableElementInstance } from './page.js';
import { mountPage, type MountedRuntimePage, type RuntimePageModel } from './render.js';

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
  /** Runtime projection of the page's visual model. */
  readonly model: RuntimePageModel;
  /** Instantiates the user-authored wrapper after its visual DOM is mounted. */
  readonly createPage: RuntimePageFactory;
  /** Instantiates authored scopes for every reusable placement on this route. */
  readonly createReusableElements?: RuntimeReusableElementFactory;
}

interface ActiveRuntimePage {
  readonly mounted: MountedRuntimePage;
  readonly page: WebPage;
  readonly reusableElements: readonly WebReusableElementInstance[];
  readonly route: RuntimePageRoute;
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
  readonly #host: HTMLElement;
  readonly #window: Window;
  readonly #onHashChange = (): void => {
    if (this.#entryRoute !== null) this.#navigateFromHash();
  };
  #active: ActiveRuntimePage | null = null;
  #entryRoute: RuntimePageRoute | null = null;
  #listeningForHashChanges = false;

  public constructor(routes: readonly RuntimePageRoute[], host: HTMLElement = document.body) {
    if (routes.length === 0) throw new Error('WebPageRouter requires at least one page route.');
    this.#host = host;
    const ownerWindow = host.ownerDocument.defaultView;
    if (ownerWindow === null)
      throw new Error('WebPageRouter host must belong to a browser document.');
    this.#window = ownerWindow;
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
    return this.#routesById.get(destination) ?? this.#routesByName.get(destination);
  }

  /**
   * Starts hash-based application routing at the entry page. Direct links and
   * browser history resolve through the same route table.
   */
  public start(entryDestination: string): WebPage {
    const entryRoute = this.findRoute(entryDestination);
    if (entryRoute === undefined) {
      throw new Error(`No WebRAD entry page route matches "${entryDestination}".`);
    }
    this.#entryRoute = entryRoute;
    if (!this.#listeningForHashChanges) {
      this.#window.addEventListener('hashchange', this.#onHashChange);
      this.#listeningForHashChanges = true;
    }
    return this.#navigateFromHash();
  }

  /**
   * Extends browser navigation with exact internal page-name and stable-ID
   * matches, while preserving normal URL and new-window navigation otherwise.
   */
  public navigateBrowser(destination: string | URL, options: NavigateOptions = {}): void {
    const route = typeof destination === 'string' ? this.findRoute(destination) : undefined;
    if (route === undefined) {
      Navigate(destination, options);
      return;
    }
    if (options.newWindow === true || options.target !== undefined) {
      const url = new URL(this.#window.location.href);
      url.hash = this.#routeHash(route);
      Navigate(url, options);
      return;
    }

    const hash = this.#routeHash(route);
    if (this.#window.location.hash !== hash) {
      if (options.replace === true) this.#window.history.replaceState(null, '', hash);
      else this.#window.location.hash = hash;
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
    const mounted = mountPage(route.model, this.#host);
    let page: WebPage;
    let reusableElements: readonly WebReusableElementInstance[] = [];
    try {
      page = route.createPage(mounted.element);
      reusableElements = route.createReusableElements?.(mounted) ?? [];
    } catch (error) {
      mounted.page.close({ remove: true });
      for (const reusableElement of reusableElements) reusableElement.dispose();
      mounted.page.dispose();
      throw error;
    }

    this.#active = { mounted, page, reusableElements, route };
    try {
      page.show();
    } catch (error) {
      this.#disposeActivePage();
      throw error;
    }
    return page;
  }

  /** Removes the active page and releases all generated event bindings. */
  public dispose(): void {
    if (this.#listeningForHashChanges) {
      this.#window.removeEventListener('hashchange', this.#onHashChange);
      this.#listeningForHashChanges = false;
    }
    this.#entryRoute = null;
    this.#disposeActivePage();
  }

  #routeHash(route: RuntimePageRoute): string {
    return `#/${encodeURIComponent(route.name)}`;
  }

  #routeFromHash(): RuntimePageRoute | undefined {
    if (!this.#window.location.hash.startsWith('#/')) return undefined;
    try {
      return this.findRoute(decodeURIComponent(this.#window.location.hash.slice(2)));
    } catch {
      return undefined;
    }
  }

  #navigateFromHash(): WebPage {
    const entryRoute = this.#entryRoute;
    if (entryRoute === null) throw new Error('WebPageRouter has not been started.');
    return this.navigate((this.#routeFromHash() ?? entryRoute).id);
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
      active.mounted.page.dispose();
      // A user OnHide handler can throw before close() removes the root.
      active.page.element.remove();
    }
  }
}
