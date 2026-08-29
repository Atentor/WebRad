import type { WebComponent, WebNonvisualComponent } from './component.js';
import { WebPanel } from './controls.js';
import type { RuntimeContainerLayoutMode } from './layout.js';

export interface ClosePageOptions {
  readonly remove?: boolean;
}

function floatingLayersForPage(element: HTMLElement): readonly HTMLElement[] {
  const pageId = element.dataset.webradPageId;
  if (pageId === undefined) return [];
  const roots = [element.parentElement, element.ownerDocument].filter(
    (root): root is HTMLElement | Document => root !== null,
  );
  const seen = new Set<HTMLElement>();
  const layers: HTMLElement[] = [];
  for (const root of roots) {
    for (const layer of root.querySelectorAll<HTMLElement>('[data-webrad-floating-owner]')) {
      if (layer.dataset.webradFloatingOwner !== pageId || seen.has(layer)) continue;
      seen.add(layer);
      layers.push(layer);
    }
  }
  return layers;
}

/** The root container's current responsive layout mode. */
export type WebPageLayoutMode = RuntimeContainerLayoutMode;

/**
 * Shared authored-code surface for a page and one mounted reusable instance.
 * It owns only generated event disposers; the Project Model remains the source
 * of component identity and the DOM remains its runtime projection.
 */
export class WebComponentScope extends WebPanel {
  readonly #generatedBindings: Array<() => void> = [];
  readonly #components: ReadonlyMap<string, WebComponent> | undefined;

  public constructor(element: HTMLElement, components?: ReadonlyMap<string, WebComponent>) {
    super(element);
    this.#components = components;
  }

  /** Resolves a physical runtime component ID inside this authored scope. */
  public requireComponentElement(componentId: string): HTMLElement {
    if (this.element.dataset.webradId === componentId) return this.element;
    const fromMountedComponents = this.#components?.get(componentId);
    if (fromMountedComponents !== undefined) return fromMountedComponents.element;
    for (const candidate of this.element.querySelectorAll<HTMLElement>('[data-webrad-id]')) {
      if (candidate.dataset.webradId === componentId) return candidate;
    }
    const outsideScope = this.findComponentElementOutsideScope(componentId);
    if (outsideScope !== undefined) return outsideScope;
    throw new Error(`Component element "${componentId}" was not found in "${this.name}".`);
  }

  /** Page scopes extend this to search their viewport-owned floating layer. */
  protected findComponentElementOutsideScope(componentId: string): HTMLElement | undefined {
    void componentId;
    return undefined;
  }

  /** Binds a registered event to a method on the authored scope. */
  protected bindGeneratedEvent(
    component: WebComponent | WebNonvisualComponent,
    eventName: string,
    handlerName: string,
  ): void {
    const dispose = component.bindEvent(eventName, (sender, event) => {
      const handler = Reflect.get(this, handlerName);
      if (typeof handler !== 'function') return;
      Reflect.apply(handler, this, [sender, event]);
    });
    this.#generatedBindings.push(dispose);
  }

  public override dispose(): void {
    for (const dispose of this.#generatedBindings.splice(0)) dispose();
    super.dispose();
  }
}

/**
 * Authored-code scope for one physical placement of a reusable definition.
 * A definition can be used many times, and each placement gets its own class
 * instance, component wrappers, event subscriptions, and mutable state.
 */
export class WebReusableElementInstance extends WebComponentScope {
  readonly #componentIds: ReadonlyMap<string, string>;

  public constructor(
    element: HTMLElement,
    public readonly instanceId: string,
    components: ReadonlyMap<string, WebComponent>,
    componentIds: ReadonlyMap<string, string>,
  ) {
    super(element, components);
    this.#componentIds = componentIds;
  }

  /** Resolves a stable definition-component ID for this physical placement. */
  public componentId(templateComponentId: string): string {
    const componentId = this.#componentIds.get(templateComponentId);
    if (componentId === undefined) {
      throw new Error(
        `Reusable component "${this.name}" has no mounted component "${templateComponentId}".`,
      );
    }
    return componentId;
  }
}

export class WebPage extends WebComponentScope {
  #created = false;

  public get layoutMode(): WebPageLayoutMode {
    const layout = this.element.dataset.webradLayout;
    return layout === 'align-to-parent' || layout === 'row' || layout === 'column'
      ? layout
      : 'fixed';
  }

  public set layoutMode(value: WebPageLayoutMode) {
    this.element.dataset.webradLayout = value;
    if (value === 'row' || value === 'column') {
      this.element.dataset.webradLayoutDisplay = 'flex';
      if (!this.element.hidden) this.element.style.setProperty('display', 'flex', 'important');
      this.element.style.setProperty('flex-direction', value, 'important');
      return;
    }
    delete this.element.dataset.webradLayoutDisplay;
    this.element.style.removeProperty('display');
    this.element.style.removeProperty('flex-direction');
  }

  public override show(): void {
    super.show();
    for (const layer of floatingLayersForPage(this.element)) layer.hidden = false;
    if (!this.#created) {
      this.#created = true;
      this.emit('OnCreate');
    }
    this.emit('OnShow');
  }

  public close(options: ClosePageOptions = {}): void {
    this.emit('OnHide');
    if (options.remove === true) {
      const floatingLayers = floatingLayersForPage(this.element);
      this.element.remove();
      for (const layer of floatingLayers) layer.remove();
    } else {
      this.hide();
    }
  }

  public override hide(): void {
    super.hide();
    for (const layer of floatingLayersForPage(this.element)) layer.hidden = true;
  }

  protected override findComponentElementOutsideScope(
    componentId: string,
  ): HTMLElement | undefined {
    for (const layer of floatingLayersForPage(this.element)) {
      for (const candidate of layer.querySelectorAll<HTMLElement>('[data-webrad-id]')) {
        if (candidate.dataset.webradId === componentId) return candidate;
      }
    }
    return undefined;
  }

  public override dispose(): void {
    for (const layer of floatingLayersForPage(this.element)) layer.remove();
    super.dispose();
  }
}
