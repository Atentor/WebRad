import { WebComponent, type WebComponentEventHandler } from './component.js';
import type { WebButtonIcon } from './controls.js';
import { createWebRadIconElement, isWebRadIconName } from './icons.js';
import {
  compileEditMask,
  isWebEditMaskTokens,
  parseWebEditMaskTokens,
  type CompiledEditMask,
  type WebEditMaskCase,
  type WebEditMaskTokens,
} from './edit-mask.js';

export type WebInputType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';
/** An empty string removes the icon. */
export type WebEditIcon = WebButtonIcon | '';

const instances = new WeakMap<HTMLElement, WebEdit>();
let nextEditLabelId = 0;

/** A text field with an optional, dynamically configurable character mask. */
export class WebEdit extends WebComponent<HTMLElement> {
  readonly #input!: HTMLInputElement;
  readonly #label?: HTMLLabelElement;
  #icon: WebEditIcon = '';
  #iconElement: SVGSVGElement | HTMLButtonElement | undefined;
  #iconClickHandler: WebComponentEventHandler<this> | null = null;
  #iconClickDispose: (() => void) | undefined;
  #iconAccessibleLabel = '';
  #maskEnabled = false;
  #mask = '';
  #maskTokens: WebEditMaskTokens = {};
  #maskCase: WebEditMaskCase = 'none';
  #maskError = '';
  #compiled: CompiledEditMask | undefined;
  #inputType: WebInputType = 'text';
  #composing = false;
  readonly #listeners: (() => void)[] = [];

  public constructor(element: HTMLElement) {
    super(element);
    const existing = instances.get(element);
    if (existing !== undefined) return existing;
    instances.set(element, this);
    if (element instanceof HTMLInputElement) {
      this.#input = element;
    } else {
      const input = element.ownerDocument.createElement('input');
      input.type = 'text';
      input.className = 'wr-edit-input';
      input.id = `webrad-edit-input-${++nextEditLabelId}`;
      const label = element.ownerDocument.createElement('label');
      label.className = 'wr-edit-label';
      label.htmlFor = input.id;
      label.hidden = true;
      element.replaceChildren(input, label);
      this.#input = input;
      this.#label = label;
      element.tabIndex = -1;
      for (const [from, to] of [['focusin', 'focus'], ['focusout', 'blur']] as const) {
        const listener = (event: Event): void => {
          const relatedTarget = event instanceof FocusEvent ? event.relatedTarget : null;
          if (relatedTarget instanceof Node && element.contains(relatedTarget)) return;
          element.dispatchEvent(new FocusEvent(to, { relatedTarget }));
        };
        element.addEventListener(from, listener);
        this.#listeners.push(() => element.removeEventListener(from, listener));
      }
    }
    this.#inputType = this.#input.type as WebInputType;
    this.#listen('compositionstart', () => {
      this.#composing = true;
    });
    this.#listen('compositionend', () => {
      this.#composing = false;
      if (this.#applyInput())
        this.#input.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText' }),
        );
    });
    this.#listen('input', (event) => {
      if (!this.#composing && !(event instanceof InputEvent && event.isComposing))
        this.#applyInput();
    });
    this.#listen('beforeinput', (event) => this.#delete(event));
  }

  #listen(name: string, listener: EventListener): void {
    // Format before authored handlers observe the native event, regardless of wrapper order.
    this.#input.addEventListener(name, listener, true);
    this.#listeners.push(() => this.#input.removeEventListener(name, listener, true));
  }

  get #active(): CompiledEditMask | undefined {
    return this.#maskEnabled && this.#mask !== '' ? this.#compiled : undefined;
  }

  #recompile(): void {
    try {
      this.#compiled = compileEditMask(this.#mask, this.#maskTokens);
      this.#maskError = '';
    } catch (error) {
      // Incomplete Inspector patterns are editable drafts, never renderer exceptions.
      this.#compiled = undefined;
      this.#maskError = error instanceof Error ? error.message : 'Invalid mask.';
    }
    this.#syncType();
  }

  #syncType(): void {
    // Native number/email/url sanitization and selection APIs conflict with arbitrary literals.
    this.#input.type =
      this.#active && !['password', 'search', 'tel'].includes(this.#inputType)
        ? 'text'
        : this.#inputType;
  }

  #applyInput(): boolean {
    const mask = this.#active;
    if (!mask) return false;
    const previous = this.#input.value;
    const start = this.#input.selectionStart,
      end = this.#input.selectionEnd;
    const direction = this.#input.selectionDirection ?? 'none';
    const result = mask.format(previous, this.#maskCase);
    if (result.text === previous) return false;
    this.#input.value = result.text;
    if (start !== null && end !== null)
      this.#input.setSelectionRange(
        result.carets[start] ?? result.text.length,
        result.carets[end] ?? result.text.length,
        direction,
      );
    return true;
  }

  #delete(event: Event): void {
    const mask = this.#active;
    if (
      !mask ||
      this.#composing ||
      this.readOnly ||
      !this.enabled ||
      !(event instanceof InputEvent) ||
      !event.cancelable ||
      !['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)
    )
      return;
    const start = this.#input.selectionStart,
      end = this.#input.selectionEnd;
    if (start === null || end === null) return;
    const current = mask.format(this.value, this.#maskCase);
    const backward = event.inputType === 'deleteContentBackward';
    const selected = current.positions
      .map((position, index) => ({ ...position, index }))
      .filter((position) =>
        start === end
          ? backward
            ? position.start < start
            : position.end > end
          : position.end > start && position.start < end,
      );
    const removed =
      start === end ? (backward ? selected.slice(-1) : selected.slice(0, 1)) : selected;
    event.preventDefault();
    if (removed.length === 0) return;
    const indices = new Set(removed.map((position) => position.index));
    const raw = Array.from(current.raw)
      .filter((_, index) => !indices.has(index))
      .join('');
    const next = mask.format(raw, this.#maskCase, true);
    this.#input.value = next.text;
    const before = removed[0]?.index ?? 0;
    const caret = before === 0 ? 0 : (next.positions[before - 1]?.end ?? next.text.length);
    this.#input.setSelectionRange(caret, caret);
    this.#input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: event.inputType }),
    );
  }

  public get value(): string {
    return this.#input.value;
  }
  public set value(value: string) {
    this.#input.value = this.#active?.format(value, this.#maskCase).text ?? value;
  }

  /** Accepted characters without mask literals. Assign this when input is known to be raw. */
  public get rawValue(): string {
    return this.#active?.format(this.value, this.#maskCase).raw ?? this.value;
  }
  public set rawValue(value: string) {
    this.#input.value = this.#active?.format(value, this.#maskCase, true).text ?? value;
  }

  public get maskEnabled(): boolean {
    return this.#maskEnabled;
  }
  public set maskEnabled(value: boolean) {
    this.#maskEnabled = value;
    this.#syncType();
    this.#applyInput();
  }

  /** 0 digit, a Unicode letter, * alphanumeric, # any character; escape literals with \\. */
  public get mask(): string {
    return this.#mask;
  }
  public set mask(value: string) {
    const raw = this.rawValue;
    this.#mask = value;
    this.#recompile();
    this.rawValue = raw;
  }

  /** Custom tokens override built-ins. Each pattern matches one whole Unicode character. */
  public get maskTokens(): WebEditMaskTokens {
    return structuredClone(this.#maskTokens);
  }
  public set maskTokens(value: WebEditMaskTokens) {
    const tokens = parseWebEditMaskTokens(value);
    const raw = this.rawValue;
    this.#maskTokens = tokens;
    this.#recompile();
    this.rawValue = raw;
  }

  public get maskCase(): WebEditMaskCase {
    return this.#maskCase;
  }
  public set maskCase(value: WebEditMaskCase) {
    if (!['none', 'upper', 'lower'].includes(value)) throw new TypeError('Invalid mask case.');
    this.#maskCase = value;
    this.#applyInput();
  }

  /** True when an active mask has all its required positions filled. Empty is incomplete. */
  public get maskComplete(): boolean {
    return this.#active?.format(this.value, this.#maskCase).complete ?? false;
  }
  /** Empty for a valid pattern. Invalid patterns leave the text editable without masking. */
  public get maskError(): string {
    return this.#maskError;
  }
  public get placeholder(): string {
    return this.#input.placeholder;
  }
  public set placeholder(value: string) {
    this.#input.placeholder = value;
  }
  public get readOnly(): boolean {
    return this.#input.readOnly;
  }
  public set readOnly(value: boolean) {
    this.#input.readOnly = value;
  }
  public get inputType(): WebInputType {
    return this.#inputType;
  }
  public set inputType(value: WebInputType) {
    this.#inputType = value;
    this.#syncType();
  }
  /** Visible, accessible field label. An empty string hides it. */
  public get label(): string {
    return this.#label?.textContent ?? '';
  }
  public set label(value: string) {
    if (this.#label === undefined) {
      if (value !== '') throw new TypeError('A visible label requires a WebEdit container element.');
      return;
    }
    this.#label.textContent = value;
    this.#label.hidden = value.length === 0;
    if (value.length > 0) this.#input.removeAttribute('aria-label');
    else this.#input.setAttribute('aria-label', this.name || this.placeholder || 'Edit');
    this.#syncIconButton();
  }
  /** Icon shown inside the field. An empty string removes it. */
  public get icon(): WebEditIcon {
    return this.#icon;
  }
  public set icon(value: WebEditIcon) {
    if (value !== '' && !isWebRadIconName(value)) throw new TypeError('Invalid Edit icon.');
    if (value !== '' && this.element instanceof HTMLInputElement)
      throw new TypeError('A visible icon requires a WebEdit container element.');
    this.#icon = value;
    this.#renderIcon();
  }
  /** Accessible name of the clickable icon; empty uses the icon and field names. */
  public get iconAccessibleLabel(): string {
    return this.#iconAccessibleLabel;
  }
  public set iconAccessibleLabel(value: string) {
    this.#iconAccessibleLabel = value;
    this.#syncIconButton();
  }
  #syncIconButton(): void {
    if (!(this.#iconElement instanceof HTMLButtonElement)) return;
    this.#iconElement.disabled = !this.enabled;
    this.#iconElement.tabIndex = this.tabIndex < 0 ? -1 : 0;
    this.#iconElement.setAttribute(
      'aria-label',
      this.#iconAccessibleLabel.trim() ||
        `${this.#icon.replaceAll('-', ' ')}: ${this.label || this.name || 'Edit'}`,
    );
  }
  #renderIcon(): void {
    this.#iconElement?.remove();
    this.#iconElement = undefined;
    if (this.#icon === '') return;
    const graphic = createWebRadIconElement(this.element.ownerDocument, this.#icon);
    graphic.classList.add('wr-edit-icon');
    graphic.dataset.webradEditIcon = this.#icon;
    if (this.#iconClickHandler === null) {
      this.#iconElement = graphic;
    } else {
      const button = this.element.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'wr-edit-icon-action';
      button.append(graphic);
      button.addEventListener('click', (event) => {
        if (this.enabled) void this.#iconClickHandler?.(this, event);
      });
      this.#iconElement = button;
      this.#syncIconButton();
    }
    this.element.append(this.#iconElement);
  }
  public override get enabled(): boolean {
    return !this.#input.disabled;
  }
  public override set enabled(value: boolean) {
    super.enabled = value;
    this.#input.disabled = !value;
    this.#syncIconButton();
  }
  public override get tabIndex(): number {
    return this.#input.tabIndex;
  }
  public override set tabIndex(value: number) {
    this.#input.tabIndex = value;
    this.#syncIconButton();
  }
  public override focus(options?: FocusOptions): void {
    this.#input.focus(options);
  }
  public clear(): void {
    this.value = '';
  }
  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
  public set onInput(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnInput', handler);
  }
  /** Binds the icon action, enabling its native button and hover feedback. */
  public set onIconClick(
    handler: ((sender: this, event: MouseEvent) => void | Promise<void>) | null,
  ) {
    this.bindEvent(
      'OnIconClick',
      handler === null ? null : (sender, event) => handler(sender, event as MouseEvent),
    );
  }

  public override bindEvent(
    eventName: string,
    handler: WebComponentEventHandler<this> | null,
  ): () => void {
    if (eventName !== 'OnIconClick') return super.bindEvent(eventName, handler);
    this.#iconClickDispose?.();
    this.#iconClickHandler = handler;
    this.#renderIcon();
    if (handler === null) return () => undefined;
    const dispose = (): void => {
      if (this.#iconClickDispose !== dispose) return;
      this.#iconClickDispose = undefined;
      this.#iconClickHandler = null;
      this.#renderIcon();
    };
    this.#iconClickDispose = dispose;
    return dispose;
  }

  public override dispose(): void {
    this.#iconClickDispose?.();
    for (const remove of this.#listeners) remove();
    this.#listeners.length = 0;
    instances.delete(this.element);
    super.dispose();
  }
}

/** Project-model projection used by Designer, Preview and exported applications. */
export function configureWebEdit(
  component: WebEdit,
  props: Readonly<Record<string, unknown>>,
): void {
  component.maskEnabled = false;
  component.maskTokens = isWebEditMaskTokens(props.maskTokens) ? props.maskTokens : {};
  component.mask = typeof props.mask === 'string' ? props.mask : '';
  component.maskCase =
    props.maskCase === 'upper' || props.maskCase === 'lower' ? props.maskCase : 'none';
  component.inputType = (
    typeof props.inputType === 'string' ? props.inputType : 'text'
  ) as WebInputType;
  // Enable before assigning the value so native number sanitization cannot discard a formatted value.
  component.maskEnabled = props.maskEnabled === true;
  component.value = typeof props.value === 'string' ? props.value : '';
  component.placeholder = typeof props.placeholder === 'string' ? props.placeholder : '';
  component.label = typeof props.label === 'string' ? props.label : '';
  component.iconAccessibleLabel =
    typeof props.iconAccessibleLabel === 'string' ? props.iconAccessibleLabel : '';
  component.icon = isWebRadIconName(props.icon) ? props.icon : '';
  component.readOnly = props.readOnly === true;
}
