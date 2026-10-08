export type WebComponentEventHandler<TSender = WebComponent> = (
  sender: TSender,
  event: Event,
) => void | Promise<void>;

const EVENT_NAME_MAP: Readonly<Record<string, string>> = Object.freeze({
  OnBlur: 'blur',
  OnChange: 'change',
  OnClick: 'click',
  OnCreate: 'webrad:create',
  OnDblClick: 'dblclick',
  OnFocus: 'focus',
  OnHide: 'webrad:hide',
  OnInput: 'input',
  OnLogin: 'webrad:login',
  OnLogout: 'webrad:logout',
  OnUnauthenticated: 'webrad:unauthenticated',
  OnKeyDown: 'keydown',
  OnKeyUp: 'keyup',
  OnMouseDown: 'mousedown',
  OnMouseEnter: 'mouseenter',
  OnMouseLeave: 'mouseleave',
  OnMouseUp: 'mouseup',
  OnResize: 'webrad:resize',
  OnRequest: 'webrad:request',
  OnSuccess: 'webrad:success',
  OnError: 'webrad:error',
  OnComplete: 'webrad:complete',
  OnShow: 'webrad:show',
});

export function runtimeEventName(eventName: string): string {
  const mapped = EVENT_NAME_MAP[eventName];
  if (mapped !== undefined) return mapped;
  return eventName.startsWith('On') ? eventName.slice(2).toLowerCase() : eventName;
}

function supportsDisabled(element: HTMLElement): element is HTMLElement & { disabled: boolean } {
  return 'disabled' in element && typeof element.disabled === 'boolean';
}

function finitePixels(value: number, property: string): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${property} must be a finite number.`);
  }
  return `${String(value)}px`;
}

function pixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface WebNonvisualComponentOptions {
  readonly id?: string;
  readonly name?: string;
}

/** Browser-safe identity shared by services that do not own a DOM element. */
export class WebNonvisualComponent {
  readonly #events = new EventTarget();
  readonly #eventDisposers = new Map<string, () => void>();
  public readonly id: string;
  public readonly name: string;

  public constructor(options: WebNonvisualComponentOptions = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
  }

  /** Binds a generated page handler to a nonvisual component lifecycle event. */
  public bindEvent(eventName: string, handler: WebComponentEventHandler<this> | null): () => void {
    this.#eventDisposers.get(eventName)?.();
    this.#eventDisposers.delete(eventName);
    if (handler === null) return () => undefined;

    const listener: EventListener = (event) => {
      void handler(this, event);
    };
    const browserEventName = runtimeEventName(eventName);
    this.#events.addEventListener(browserEventName, listener);
    const dispose = (): void => {
      this.#events.removeEventListener(browserEventName, listener);
      if (this.#eventDisposers.get(eventName) === dispose) this.#eventDisposers.delete(eventName);
    };
    this.#eventDisposers.set(eventName, dispose);
    return dispose;
  }

  /** Emits a lifecycle event without requiring a DOM element. */
  public emit(eventName: string, detail?: unknown): boolean {
    return this.#events.dispatchEvent(
      new CustomEvent(runtimeEventName(eventName), { cancelable: true, detail }),
    );
  }

  public dispose(): void {
    for (const dispose of [...this.#eventDisposers.values()]) dispose();
    this.#eventDisposers.clear();
  }
}

/** Browser-side wrapper shared by every visual WebRAD component. */
export class WebComponent<TElement extends HTMLElement = HTMLElement> {
  readonly #eventDisposers = new Map<string, () => void>();

  public constructor(public readonly element: TElement) {}

  public get id(): string {
    return this.element.dataset.webradId ?? this.element.id;
  }

  public get name(): string {
    return this.element.dataset.webradName ?? '';
  }

  public get visible(): boolean {
    const stored = this.element.dataset.webradVisible;
    return stored === undefined ? !this.element.hidden : stored !== 'false';
  }

  public set visible(value: boolean) {
    this.element.dataset.webradVisible = String(value);
    this.#applyVisibility();
  }

  /** Whether an invisible component is removed from its parent layout. */
  public get collapseWhenHidden(): boolean {
    return this.element.dataset.webradCollapseWhenHidden !== 'false';
  }

  public set collapseWhenHidden(value: boolean) {
    this.element.dataset.webradCollapseWhenHidden = String(value);
    this.#applyVisibility();
  }

  #applyVisibility(): void {
    const visible = this.visible;
    const collapse = this.collapseWhenHidden;
    this.element.hidden = !visible && collapse;
    this.element.setAttribute('aria-hidden', String(!visible));

    if (!visible && !collapse) {
      this.element.style.setProperty('visibility', 'hidden', 'important');
    } else {
      this.element.style.removeProperty('visibility');
    }

    if (!visible && collapse) {
      // Layout uses inline !important for structural display so a reusable
      // style cannot turn a row or column into a different display mode. Keep
      // the visibility API authoritative over that structural projection.
      this.element.style.setProperty('display', 'none', 'important');
      return;
    }

    const layoutDisplay = this.element.dataset.webradLayoutDisplay;
    if (layoutDisplay === undefined) this.element.style.removeProperty('display');
    else this.element.style.setProperty('display', layoutDisplay, 'important');
  }

  public get enabled(): boolean {
    if (supportsDisabled(this.element)) return !this.element.disabled;
    return this.element.getAttribute('aria-disabled') !== 'true';
  }

  public set enabled(value: boolean) {
    if (supportsDisabled(this.element)) this.element.disabled = !value;
    this.element.setAttribute('aria-disabled', String(!value));
  }

  public get x(): number {
    return pixelValue(this.element.style.left, this.element.offsetLeft);
  }

  public set x(value: number) {
    this.element.style.left = finitePixels(value, 'x');
  }

  public get y(): number {
    return pixelValue(this.element.style.top, this.element.offsetTop);
  }

  public set y(value: number) {
    this.element.style.top = finitePixels(value, 'y');
  }

  public get width(): number {
    return pixelValue(this.element.style.width, this.element.offsetWidth);
  }

  public set width(value: number) {
    this.element.style.width = finitePixels(value, 'width');
  }

  public get height(): number {
    return pixelValue(this.element.style.height, this.element.offsetHeight);
  }

  public set height(value: number) {
    this.element.style.height = finitePixels(value, 'height');
  }

  public get tabIndex(): number {
    return this.element.tabIndex;
  }

  /** Outer spacing on all four sides, in pixels. */
  public get margin(): number {
    return pixelValue(this.element.style.margin, 0);
  }

  public set margin(value: number) {
    this.element.style.margin = finitePixels(value, 'margin');
  }

  /** Outer spacing on the top side, in pixels. */
  public get marginTop(): number {
    return pixelValue(this.element.style.marginTop || getComputedStyle(this.element).marginTop, 0);
  }

  public set marginTop(value: number) {
    this.element.style.marginTop = finitePixels(value, 'marginTop');
  }

  /** Outer spacing on the right side, in pixels. */
  public get marginRight(): number {
    return pixelValue(
      this.element.style.marginRight || getComputedStyle(this.element).marginRight,
      0,
    );
  }

  public set marginRight(value: number) {
    this.element.style.marginRight = finitePixels(value, 'marginRight');
  }

  /** Outer spacing on the bottom side, in pixels. */
  public get marginBottom(): number {
    return pixelValue(
      this.element.style.marginBottom || getComputedStyle(this.element).marginBottom,
      0,
    );
  }

  public set marginBottom(value: number) {
    this.element.style.marginBottom = finitePixels(value, 'marginBottom');
  }

  /** Outer spacing on the left side, in pixels. */
  public get marginLeft(): number {
    return pixelValue(
      this.element.style.marginLeft || getComputedStyle(this.element).marginLeft,
      0,
    );
  }

  public set marginLeft(value: number) {
    this.element.style.marginLeft = finitePixels(value, 'marginLeft');
  }

  public set tabIndex(value: number) {
    this.element.tabIndex = value;
  }

  public get backgroundColor(): string {
    return this.element.style.backgroundColor;
  }

  public set backgroundColor(value: string) {
    this.element.style.backgroundColor = value;
  }

  public get color(): string {
    return this.element.style.color;
  }

  public set color(value: string) {
    this.element.style.color = value;
  }

  public get borderColor(): string {
    return this.element.style.borderColor;
  }

  public set borderColor(value: string) {
    this.element.style.borderColor = value;
  }

  public focus(options?: FocusOptions): void {
    this.element.focus(options);
  }

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public bindEvent(eventName: string, handler: WebComponentEventHandler<this> | null): () => void {
    this.#eventDisposers.get(eventName)?.();
    this.#eventDisposers.delete(eventName);
    if (handler === null) return () => undefined;

    const browserEventName = runtimeEventName(eventName);
    const listener: EventListener = (event) => {
      void handler(this, event);
    };
    this.element.addEventListener(browserEventName, listener);
    const dispose = (): void => {
      this.element.removeEventListener(browserEventName, listener);
      if (this.#eventDisposers.get(eventName) === dispose) this.#eventDisposers.delete(eventName);
    };
    this.#eventDisposers.set(eventName, dispose);
    return dispose;
  }

  public emit(eventName: string, detail?: unknown): boolean {
    return this.element.dispatchEvent(
      new CustomEvent(runtimeEventName(eventName), { bubbles: false, cancelable: true, detail }),
    );
  }

  public dispose(): void {
    for (const dispose of [...this.#eventDisposers.values()]) dispose();
    this.#eventDisposers.clear();
  }
}
