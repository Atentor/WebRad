import { WebComponent, type WebComponentEventHandler } from './component.js';
import { createWebRadIconElement, isWebRadIconName, type WebRadIconName } from './icons.js';

export type WebLineOrientation = 'horizontal' | 'vertical';
export type WebLineIcon = WebRadIconName | '';

export interface LineProjection {
  readonly orientation: WebLineOrientation;
  readonly caption: string;
  readonly icon: WebLineIcon;
  readonly accessibleLabel: string;
}

/** Normalizes persisted properties for the Designer and browser runtime. */
export function projectLine(props: Readonly<Record<string, unknown>>): LineProjection {
  return {
    orientation: props.orientation === 'vertical' ? 'vertical' : 'horizontal',
    caption: typeof props.caption === 'string' ? props.caption : '',
    icon: isWebRadIconName(props.icon) ? props.icon : '',
    accessibleLabel: typeof props.accessibleLabel === 'string' ? props.accessibleLabel : '',
  };
}

/** A horizontal or vertical separator with optional centered content. */
export class WebLine extends WebComponent<HTMLElement> {
  public constructor(element: HTMLElement) {
    super(element);
    this.#render(this.#state());
  }

  #state(): LineProjection {
    const data = this.element.dataset;
    return projectLine({
      orientation: data.webradLineOrientation,
      caption: data.webradLineCaption,
      icon: data.webradLineIcon,
      accessibleLabel: data.webradLineAccessibleLabel,
    });
  }

  public get orientation(): WebLineOrientation {
    return this.#state().orientation;
  }

  public set orientation(value: WebLineOrientation) {
    if (value !== 'horizontal' && value !== 'vertical') {
      throw new RangeError('Line orientation must be horizontal or vertical.');
    }
    this.#render({ ...this.#state(), orientation: value });
  }

  public get caption(): string {
    return this.#state().caption;
  }

  public set caption(value: string) {
    this.#render({ ...this.#state(), caption: value });
  }

  public get icon(): WebLineIcon {
    return this.#state().icon;
  }

  public set icon(value: WebLineIcon) {
    if (value !== '' && !isWebRadIconName(value)) throw new RangeError('Unknown Line icon.');
    this.#render({ ...this.#state(), icon: value });
  }

  public get accessibleLabel(): string {
    return this.#state().accessibleLabel;
  }

  public set accessibleLabel(value: string) {
    this.#render({ ...this.#state(), accessibleLabel: value });
  }

  public set onClick(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnClick', handler);
  }

  #render(state: LineProjection): void {
    const { element } = this;
    const document = element.ownerDocument;
    const hasContent = state.caption.length > 0 || state.icon !== '';
    element.dataset.webradLineOrientation = state.orientation;
    element.dataset.webradLineCaption = state.caption;
    element.dataset.webradLineIcon = state.icon;
    element.dataset.webradLineAccessibleLabel = state.accessibleLabel;
    element.setAttribute('role', 'separator');
    element.setAttribute('aria-orientation', state.orientation);
    const label = state.accessibleLabel.trim() || state.caption.trim();
    if (label) element.setAttribute('aria-label', label);
    else element.removeAttribute('aria-label');

    const layout = document.createElement('span');
    layout.className = 'wr-line-layout';
    layout.dataset.webradLineContent = String(hasContent);
    const before = document.createElement('span');
    before.className = 'wr-line-segment';
    const after = document.createElement('span');
    after.className = 'wr-line-segment';
    layout.append(before);
    if (hasContent) {
      const content = document.createElement('span');
      content.className = 'wr-line-center';
      content.setAttribute('aria-hidden', 'true');
      if (state.icon !== '') {
        const icon = createWebRadIconElement(document, state.icon);
        icon.classList.add('wr-line-icon');
        content.append(icon);
      }
      if (state.caption.length > 0) {
        const caption = document.createElement('span');
        caption.className = 'wr-line-caption';
        caption.textContent = state.caption;
        content.append(caption);
      }
      layout.append(content);
    }
    layout.append(after);
    element.replaceChildren(layout);
  }
}
