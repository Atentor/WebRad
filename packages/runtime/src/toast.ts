import { WebComponent, type WebComponentEventHandler } from './component.js';
import { createWebRadIconElement, isWebRadIconName, type WebRadIconName } from './icons.js';

export const Sucess = 'Sucess' as const;
export const Alert = 'Alert' as const;
export const Danger = 'Danger' as const;
export const Notifier = 'Notifier' as const;
export type WebToastState = typeof Sucess | typeof Alert | typeof Danger | typeof Notifier;
export type WebToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';
export interface WebToastEventDetail {
  readonly message: string;
  readonly state: WebToastState;
}

const positions: readonly WebToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const defaults: Record<WebToastState, WebRadIconName> = {
  Sucess: 'check-circle',
  Alert: 'warning',
  Danger: 'alert-circle',
  Notifier: 'info',
};
const states: readonly WebToastState[] = [Sucess, Alert, Danger, Notifier];
const toastRegions = new WeakMap<Document, Map<WebToastPosition, HTMLElement>>();

function toastRegion(document: Document, position: WebToastPosition): HTMLElement {
  let regions = toastRegions.get(document);
  if (regions === undefined) {
    regions = new Map();
    toastRegions.set(document, regions);
  }
  let region = regions.get(position);
  if (region === undefined || !region.isConnected) {
    region = document.createElement('div');
    region.className = 'wr-toast-region';
    region.dataset.toastPosition = position;
    document.body.append(region);
    regions.set(position, region);
  }
  return region;
}

function removeEmptyToastRegion(region: HTMLElement | null): void {
  if (!region?.classList.contains('wr-toast-region') || region.childElementCount !== 0) return;
  const position = region.dataset.toastPosition as WebToastPosition;
  const regions = toastRegions.get(region.ownerDocument);
  if (regions?.get(position) === region) regions.delete(position);
  region.remove();
}

/** A viewport notification service scoped to its page or reusable placement. */
export class WebToast extends WebComponent {
  readonly #timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  #disposed = false;

  public get duration(): number {
    return Number(this.element.dataset.toastDuration ?? 4000);
  }
  public set duration(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 2147483647)
      throw new RangeError(
        'Toast duration must be an integer between 0 and 2147483647 milliseconds.',
      );
    this.element.dataset.toastDuration = String(value);
  }
  public get position(): WebToastPosition {
    const value = this.element.dataset.toastPosition;
    return positions.find((position) => position === value) ?? 'top-right';
  }
  public set position(value: WebToastPosition) {
    if (!positions.includes(value)) throw new RangeError('Invalid toast position.');
    this.element.dataset.toastPosition = value;
    if (this.element.parentElement?.classList.contains('wr-toast-region')) this.#place();
  }
  public get sucessIcon(): WebRadIconName | '' {
    return this.#icon(Sucess);
  }
  public set sucessIcon(value: WebRadIconName | '') {
    this.#setIcon(Sucess, value);
  }
  public get alertIcon(): WebRadIconName | '' {
    return this.#icon(Alert);
  }
  public set alertIcon(value: WebRadIconName | '') {
    this.#setIcon(Alert, value);
  }
  public get dangerIcon(): WebRadIconName | '' {
    return this.#icon(Danger);
  }
  public set dangerIcon(value: WebRadIconName | '') {
    this.#setIcon(Danger, value);
  }
  public get notifierIcon(): WebRadIconName | '' {
    return this.#icon(Notifier);
  }
  public set notifierIcon(value: WebRadIconName | '') {
    this.#setIcon(Notifier, value);
  }
  /** Show a success notification. */
  public Success(message: string): void {
    this.#show(message, Sucess);
  }
  /** Show a warning notification. */
  public Alert(message: string): void {
    this.#show(message, Alert);
  }
  /** Show an error notification. */
  public Danger(message: string): void {
    this.#show(message, Danger);
  }
  /** Show an informational notification. */
  public Notifier(message: string): void {
    this.#show(message, Notifier);
  }

  /** Show a message. A duration of zero keeps it visible until closed. */
  #show(message: string, state: WebToastState): void {
    if (this.#disposed) return;
    if (!states.includes(state)) throw new RangeError('Invalid toast state.');
    const doc = this.element.ownerDocument;
    if (!doc.body) return;
    this.#place();
    this.element.classList.add('wr-toast-host');
    this.element.setAttribute('aria-label', 'Notifications');
    const item = doc.createElement('div');
    item.className = this.element.className;
    item.classList.remove('wr-toast-region', 'wr-toast-host', 'wr-webtoast');
    item.classList.remove('wr-component');
    item.classList.add('wr-toast-item');
    item.dataset.toastState = state.toLowerCase();
    item.setAttribute('role', state === Danger ? 'alert' : 'status');
    const icon = this.#icon(state);
    if (icon) {
      const graphic = createWebRadIconElement(doc, icon);
      graphic.classList.add('wr-toast-icon');
      item.append(graphic);
    }
    const text = doc.createElement('span');
    text.className = 'wr-toast-message';
    text.textContent = String(message);
    item.append(text);
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'wr-toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.append(createWebRadIconElement(doc, 'close'));
    close.addEventListener('click', () => this.#dismiss(item, { message: String(message), state }));
    item.append(close);
    this.element.append(item);
    const detail = { message: String(message), state };
    if (this.duration > 0)
      this.#timers.set(
        item,
        setTimeout(() => this.#dismiss(item, detail), this.duration),
      );
    this.emit('OnShow', detail);
  }
  /** Dismiss all notifications owned by this component. */
  public Clear(): void {
    for (const item of Array.from(
      this.element.querySelectorAll<HTMLElement>(':scope > .wr-toast-item'),
    )) {
      const state =
        states.find((value) => value.toLowerCase() === item.dataset.toastState) ?? Notifier;
      this.#dismiss(item, {
        message: item.querySelector('.wr-toast-message')?.textContent ?? '',
        state,
      });
    }
  }
  public set onShow(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnShow', handler);
  }
  public set onClose(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnClose', handler);
  }
  public override dispose(): void {
    this.#disposed = true;
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.element.replaceChildren();
    const region = this.element.parentElement;
    this.element.remove();
    removeEmptyToastRegion(region);
    super.dispose();
  }
  #icon(state: WebToastState): WebRadIconName | '' {
    const value = this.element.getAttribute(`data-toast-icon-${state.toLowerCase()}`);
    return value === '' ? '' : isWebRadIconName(value) ? value : defaults[state];
  }
  #setIcon(state: WebToastState, value: WebRadIconName | ''): void {
    if (value !== '' && !isWebRadIconName(value)) throw new RangeError('Invalid toast icon.');
    this.element.setAttribute(`data-toast-icon-${state.toLowerCase()}`, value);
  }
  #place(): void {
    const previous = this.element.parentElement;
    const region = toastRegion(this.element.ownerDocument, this.position);
    if (previous !== region) {
      region.append(this.element);
      removeEmptyToastRegion(previous);
    }
  }
  #dismiss(item: HTMLElement, detail: WebToastEventDetail): void {
    if (!item.isConnected || item.dataset.closing === 'true') return;
    const timer = this.#timers.get(item);
    if (timer !== undefined) clearTimeout(timer);
    this.#timers.delete(item);
    item.dataset.closing = 'true';
    const remove = (): void => {
      const handle = this.#timers.get(item);
      if (handle !== undefined) clearTimeout(handle);
      this.#timers.delete(item);
      item.remove();
      if (this.element.childElementCount === 0) {
        const region = this.element.parentElement;
        this.element.remove();
        removeEmptyToastRegion(region);
      }
    };
    item.addEventListener('animationend', remove, { once: true });
    this.#timers.set(item, setTimeout(remove, 250));
    this.emit('OnClose', detail);
  }
}
