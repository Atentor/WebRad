import { WebComponent, type WebComponentEventHandler } from './component.js';
import {
  compileEditMask,
  isWebEditMaskTokens,
  parseWebEditMaskTokens,
  type CompiledEditMask,
  type WebEditMaskCase,
  type WebEditMaskTokens,
} from './edit-mask.js';

export type WebInputType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';

const instances = new WeakMap<HTMLInputElement, WebEdit>();

/** A text field with an optional, dynamically configurable character mask. */
export class WebEdit extends WebComponent<HTMLInputElement> {
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
    if (!(element instanceof HTMLInputElement))
      throw new TypeError('WebEdit requires an input element.');
    super(element);
    const existing = instances.get(element);
    if (existing !== undefined) return existing;
    instances.set(element, this);
    this.#inputType = element.type as WebInputType;
    this.#listen('compositionstart', () => {
      this.#composing = true;
    });
    this.#listen('compositionend', () => {
      this.#composing = false;
      if (this.#applyInput())
        this.element.dispatchEvent(
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
    this.element.addEventListener(name, listener, true);
    this.#listeners.push(() => this.element.removeEventListener(name, listener, true));
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
    this.element.type =
      this.#active && !['password', 'search', 'tel'].includes(this.#inputType)
        ? 'text'
        : this.#inputType;
  }

  #applyInput(): boolean {
    const mask = this.#active;
    if (!mask) return false;
    const previous = this.element.value;
    const start = this.element.selectionStart,
      end = this.element.selectionEnd;
    const direction = this.element.selectionDirection ?? 'none';
    const result = mask.format(previous, this.#maskCase);
    if (result.text === previous) return false;
    this.element.value = result.text;
    if (start !== null && end !== null)
      this.element.setSelectionRange(
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
    const start = this.element.selectionStart,
      end = this.element.selectionEnd;
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
    this.element.value = next.text;
    const before = removed[0]?.index ?? 0;
    const caret = before === 0 ? 0 : (next.positions[before - 1]?.end ?? next.text.length);
    this.element.setSelectionRange(caret, caret);
    this.element.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: event.inputType }),
    );
  }

  public get value(): string {
    return this.element.value;
  }
  public set value(value: string) {
    this.element.value = this.#active?.format(value, this.#maskCase).text ?? value;
  }

  /** Accepted characters without mask literals. Assign this when input is known to be raw. */
  public get rawValue(): string {
    return this.#active?.format(this.value, this.#maskCase).raw ?? this.value;
  }
  public set rawValue(value: string) {
    this.element.value = this.#active?.format(value, this.#maskCase, true).text ?? value;
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
    return this.element.placeholder;
  }
  public set placeholder(value: string) {
    this.element.placeholder = value;
  }
  public get readOnly(): boolean {
    return this.element.readOnly;
  }
  public set readOnly(value: boolean) {
    this.element.readOnly = value;
  }
  public get inputType(): WebInputType {
    return this.#inputType;
  }
  public set inputType(value: WebInputType) {
    this.#inputType = value;
    this.#syncType();
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

  public override dispose(): void {
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
  component.readOnly = props.readOnly === true;
}
