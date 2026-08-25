import type { WebComponent } from './component.js';
import { WebPanel } from './controls.js';
import type { RuntimeContainerLayoutMode } from './layout.js';

export interface ClosePageOptions {
  readonly remove?: boolean;
}

/** The root container's current responsive layout mode. */
export type WebPageLayoutMode = RuntimeContainerLayoutMode;

export class WebPage extends WebPanel {
  readonly #generatedBindings: Array<() => void> = [];
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
    if (!this.#created) {
      this.#created = true;
      this.emit('OnCreate');
    }
    this.emit('OnShow');
  }

  public close(options: ClosePageOptions = {}): void {
    this.emit('OnHide');
    if (options.remove === true) this.element.remove();
    else this.hide();
  }

  public requireComponentElement(componentId: string): HTMLElement {
    if (this.element.dataset.webradId === componentId) return this.element;
    for (const candidate of this.element.querySelectorAll<HTMLElement>('[data-webrad-id]')) {
      if (candidate.dataset.webradId === componentId) return candidate;
    }
    throw new Error(`Component element "${componentId}" was not found in page "${this.name}".`);
  }

  protected bindGeneratedEvent(
    component: WebComponent,
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
