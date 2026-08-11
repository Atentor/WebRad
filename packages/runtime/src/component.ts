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

/** Browser-side wrapper shared by every visual and nonvisual WebRAD component. */
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
  }

  public get enabled(): boolean {
    if (supportsDisabled(this.element)) return !this.element.disabled;
    return this.element.getAttribute('aria-disabled') !== 'true';
  }

  public set enabled(value: boolean) {
    if (supportsDisabled(this.element)) this.element.disabled = !value;
    this.element.setAttribute('aria-disabled', String(!value));
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
