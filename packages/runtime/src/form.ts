import type { WebComponent } from './component.js';
import { WebPanel } from './controls.js';

export interface CloseFormOptions {
  readonly remove?: boolean;
}

export type WebFormLayoutMode = 'absolute' | 'flex' | 'grid';

export class WebForm extends WebPanel {
  readonly #generatedBindings: Array<() => void> = [];
  #created = false;

  public get layoutMode(): WebFormLayoutMode {
    const layout = this.element.dataset.webradLayout;
    return layout === 'flex' || layout === 'grid' ? layout : 'absolute';
  }

  public set layoutMode(value: WebFormLayoutMode) {
    this.element.dataset.webradLayout = value;
    this.element.style.display = value === 'absolute' ? '' : value;
  }

  public override show(): void {
    super.show();
    if (!this.#created) {
      this.#created = true;
      this.emit('OnCreate');
    }
    this.emit('OnShow');
  }

  public close(options: CloseFormOptions = {}): void {
    this.emit('OnHide');
    if (options.remove === true) this.element.remove();
    else this.hide();
  }

  public requireComponentElement(componentId: string): HTMLElement {
    if (this.element.dataset.webradId === componentId) return this.element;
    for (const candidate of this.element.querySelectorAll<HTMLElement>('[data-webrad-id]')) {
      if (candidate.dataset.webradId === componentId) return candidate;
    }
    throw new Error(`Component element "${componentId}" was not found in form "${this.name}".`);
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
