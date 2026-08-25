export type WebComponentEventHandler<TSender extends WebComponent = WebComponent> = (
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
  OnKeyDown: 'keydown',
  OnKeyUp: 'keyup',
  OnMouseDown: 'mousedown',
  OnMouseEnter: 'mouseenter',
  OnMouseLeave: 'mouseleave',
  OnMouseUp: 'mouseup',
  OnResize: 'webrad:resize',
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
  public readonly id: string;
  public readonly name: string;

  public constructor(options: WebNonvisualComponentOptions = {}) {
    this.id = options.id ?? '';
    this.name = options.name ?? '';
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
    return !this.element.hidden;
  }

  public set visible(value: boolean) {
    this.element.hidden = !value;
    if (!value) {
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
