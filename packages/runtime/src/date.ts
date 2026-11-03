import { WebComponent, type WebComponentEventHandler } from './component.js';
import { createWebRadIconElement } from './icons.js';
import { DateCalendar } from './date-calendar.js';
import {
  dateMask,
  formatDateText,
  maskDateText,
  parseDateText,
  parseDateValue,
  serializeDateValue,
  type WebDateMode,
  type WebDateFormat,
} from './date-value.js';
export type { WebDateMode, WebDateFormat } from './date-value.js';

const instances = new WeakMap<HTMLElement, WebDate>();

/** Empty values clear a field. Nonempty values use local ISO calendar fields. */
export function isWebDateValue(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || parseDateValue(value) !== null);
}

/** Shared model projection for Designer and generated browser applications. */
export function configureWebDate(
  component: WebDate,
  props: Readonly<Record<string, unknown>>,
  name: string,
): void {
  component.accessibleLabel =
    typeof props.accessibleLabel === 'string' && props.accessibleLabel !== ''
      ? props.accessibleLabel
      : name;
  component.mode = props.mode === 'datetime' ? 'datetime' : 'date';
  component.dateFormat =
    props.dateFormat === 'MM/dd/yyyy' || props.dateFormat === 'yyyy-MM-dd'
      ? props.dateFormat
      : 'dd/MM/yyyy';
  component.showSeconds = props.showSeconds === true;
  component.placeholder = typeof props.placeholder === 'string' ? props.placeholder : '';
  component.required = props.required === true;
  component.readOnly = props.readOnly === true;
  component.showCalendar = props.showCalendar !== false;
  component.min = isWebDateValue(props.min) ? props.min : '';
  component.max = isWebDateValue(props.max) ? props.max : '';
  component.value = isWebDateValue(props.value) ? props.value : '';
}

/** Masked local date/date-time input. Values never imply a UTC time zone. */
export class WebDate extends WebComponent<HTMLElement> {
  // Authored and mounted scopes share the existing instance for an element.
  readonly #input!: HTMLInputElement;
  readonly #calendar!: DateCalendar;
  readonly #button!: HTMLButtonElement;
  readonly #listeners: (() => void)[] = [];
  #mode: WebDateMode = 'date';
  #dateFormat: WebDateFormat = 'dd/MM/yyyy';
  #showSeconds = false;
  #placeholder = '';
  #min = '';
  #max = '';

  public constructor(element: HTMLElement) {
    super(element);
    const existing = instances.get(element);
    if (existing !== undefined) return existing;
    const document = element.ownerDocument;
    element.classList.add('wr-webdate');
    this.#input = document.createElement('input');
    this.#input.type = 'text';
    this.#input.className = 'wr-date-input';
    this.#input.inputMode = 'numeric';
    this.#input.autocomplete = 'off';
    this.#input.spellcheck = false;
    this.#button = document.createElement('button');
    this.#button.type = 'button';
    this.#button.className = 'wr-date-button';
    this.#button.setAttribute('aria-label', 'Open calendar');
    this.#button.append(createWebRadIconElement(document, 'calendar'));
    element.replaceChildren(this.#input, this.#button);
    this.#calendar = new DateCalendar({
      host: element,
      anchor: this.#button,
      read: () => ({
        mode: this.mode,
        showSeconds: this.showSeconds,
        value: this.value,
        min: this.min,
        max: this.max,
        editable: this.enabled && !this.readOnly && this.visible,
      }),
      commit: (value) => {
        if (value === this.value && (value !== '' || this.text === '')) return;
        this.value = value;
        this.#input.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }),
        );
        this.#input.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    element.setAttribute('role', 'group');
    element.tabIndex = -1;
    this.#listen(this.#input, 'input', (event) => {
      if (event instanceof InputEvent && event.isComposing) return;
      this.#maskInput();
    });
    this.#listen(this.#input, 'compositionend', () => this.#maskInput());
    this.#listen(this.#input, 'beforeinput', (event) => this.#deleteMaskSeparator(event));
    this.#listen(this.#input, 'change', () => this.#syncValidity());
    for (const [nativeName, name] of [
      ['focusin', 'focus'],
      ['focusout', 'blur'],
    ] as const) {
      this.#listen(element, nativeName, (event) => {
        const relatedTarget = event instanceof FocusEvent ? event.relatedTarget : null;
        if (relatedTarget instanceof Node && element.contains(relatedTarget)) return;
        this.#syncValidity();
        element.dispatchEvent(
          new FocusEvent(name, {
            relatedTarget,
          }),
        );
      });
    }
    this.#listen(this.#input, 'keydown', (event) => {
      if (event instanceof KeyboardEvent && event.altKey && event.key === 'ArrowDown') {
        event.preventDefault();
        this.showPicker();
      }
    });
    this.#listen(this.#button, 'click', () => {
      if (this.#calendar.open) this.#calendar.close();
      else this.showPicker();
    });
    this.#refresh();
    instances.set(element, this);
  }

  #listen(target: HTMLElement, name: string, listener: EventListener): void {
    target.addEventListener(name, listener);
    this.#listeners.push(() => target.removeEventListener(name, listener));
  }

  #parsed(): Date | null {
    return parseDateText(this.text, this.mode, this.dateFormat, this.showSeconds);
  }

  #refresh(previous = this.#parsed()): void {
    if (previous !== null) {
      this.#input.value = formatDateText(previous, this.mode, this.dateFormat, this.showSeconds);
    } else if (this.text !== '') {
      this.#input.value = maskDateText(this.text, this.mask);
    }
    this.#input.placeholder = this.placeholder || this.mask;
    this.#input.maxLength = this.mask.length;
    this.#input.setAttribute(
      'aria-label',
      this.element.getAttribute('aria-label') || this.name || 'Date',
    );
    this.#syncValidity();
  }

  #effectiveLimit(value: string): string {
    const date = parseDateValue(value);
    return date === null ? '' : serializeDateValue(date, this.mode, this.showSeconds);
  }

  #maskInput(): void {
    const raw = this.text;
    const caret = this.#input.selectionStart ?? raw.length;
    const iso = parseDateValue(raw);
    const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
    this.#input.value =
      iso === null
        ? maskDateText(raw, this.mask)
        : formatDateText(iso, this.mode, this.dateFormat, this.showSeconds);
    let position = 0;
    let count = 0;
    while (position < this.text.length && count < digitsBefore) {
      if (/\d/.test(this.text[position] ?? '')) count++;
      position++;
    }
    while (position < this.text.length && /\D/.test(this.text[position] ?? '')) position++;
    this.#input.setSelectionRange(
      iso === null ? position : this.text.length,
      iso === null ? position : this.text.length,
    );
    this.#syncValidity();
  }

  #deleteMaskSeparator(event: Event): void {
    if (!(event instanceof InputEvent) || this.readOnly || !this.enabled) return;
    const start = this.#input.selectionStart ?? 0;
    const end = this.#input.selectionEnd ?? start;
    if (start !== end) return;
    const backward = event.inputType === 'deleteContentBackward';
    const forward = event.inputType === 'deleteContentForward';
    const index = backward ? start - 1 : start;
    if (
      (!backward && !forward) ||
      index < 0 ||
      index >= this.text.length ||
      /\d/.test(this.text[index] ?? '')
    )
      return;
    event.preventDefault();
    let digit = index;
    while (digit >= 0 && digit < this.text.length && /\D/.test(this.text[digit] ?? ''))
      digit += backward ? -1 : 1;
    if (digit < 0 || digit >= this.text.length) return;
    this.#input.value = this.text.slice(0, digit) + this.text.slice(digit + 1);
    this.#input.setSelectionRange(digit, digit);
    this.#input.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: event.inputType }),
    );
  }

  #syncValidity(): void {
    const parsed = this.#parsed();
    const value = parsed === null ? '' : serializeDateValue(parsed, this.mode, this.showSeconds);
    const min = this.#effectiveLimit(this.min);
    const max = this.#effectiveLimit(this.max);
    const message =
      this.text === ''
        ? this.required
          ? 'Enter a date.'
          : ''
        : parsed === null
          ? `Enter a valid ${this.mask} value.`
          : min !== '' && value < min
            ? `Enter a value on or after ${min}.`
            : max !== '' && value > max
              ? `Enter a value on or before ${max}.`
              : '';
    this.#input.setCustomValidity(message);
    const invalid = this.enabled && !this.readOnly && message !== '';
    this.#input.setAttribute('aria-invalid', String(invalid));
    this.element.setAttribute('aria-invalid', String(invalid));
    this.#calendar.refresh();
  }

  public get mode(): WebDateMode {
    return this.#mode;
  }
  public set mode(value: WebDateMode) {
    if (value !== 'date' && value !== 'datetime')
      throw new TypeError('mode must be date or datetime.');
    const previous = this.#parsed();
    this.#mode = value;
    this.#refresh(previous);
  }

  public get dateFormat(): WebDateFormat {
    return this.#dateFormat;
  }
  public set dateFormat(value: WebDateFormat) {
    if (!['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'].includes(value))
      throw new TypeError('Unsupported date format.');
    const previous = this.#parsed();
    this.#dateFormat = value;
    this.#refresh(previous);
  }

  public get showSeconds(): boolean {
    return this.#showSeconds;
  }
  public set showSeconds(value: boolean) {
    const previous = this.#parsed();
    this.#showSeconds = value;
    this.#refresh(previous);
  }

  public get mask(): string {
    return dateMask(this.mode, this.dateFormat, this.showSeconds);
  }
  /** Canonical YYYY-MM-DD or YYYY-MM-DDTHH:mm[:ss]; empty while incomplete/invalid. */
  public get value(): string {
    const date = this.#parsed();
    return date === null ? '' : serializeDateValue(date, this.mode, this.showSeconds);
  }
  public set value(value: string) {
    if (value === '') {
      this.#input.value = '';
      this.#syncValidity();
      return;
    }
    const date = parseDateValue(value);
    if (date === null)
      throw new RangeError('Use YYYY-MM-DD or a local YYYY-MM-DDTHH:mm[:ss] value.');
    this.#input.value = formatDateText(date, this.mode, this.dateFormat, this.showSeconds);
    this.#syncValidity();
  }

  /** Display text, including an incomplete or invalid draft. */
  public get text(): string {
    return this.#input.value;
  }
  public set text(value: string) {
    this.#input.value = maskDateText(value, this.mask);
    this.#syncValidity();
  }

  /** A fresh Date at the start of the local day; null for an empty/incomplete/impossible date. */
  public get date(): Date | null {
    const date = this.#parsed();
    return date === null ? null : parseDateValue(serializeDateValue(date, 'date', false));
  }
  public set date(value: Date | null) {
    this.value = value === null ? '' : serializeDateValue(value, 'date', false);
  }
  /** A fresh local Date including time; date mode returns the start of the local day. */
  public get datetime(): Date | null {
    return this.#parsed();
  }
  public set datetime(value: Date | null) {
    this.value = value === null ? '' : serializeDateValue(value, this.mode, this.showSeconds);
  }

  public get min(): string {
    return this.#min;
  }
  public set min(value: string) {
    if (value !== '' && parseDateValue(value) === null)
      throw new RangeError('Invalid minimum date.');
    this.#min = value;
    this.#refresh();
  }
  public get max(): string {
    return this.#max;
  }
  public set max(value: string) {
    if (value !== '' && parseDateValue(value) === null)
      throw new RangeError('Invalid maximum date.');
    this.#max = value;
    this.#refresh();
  }
  public get required(): boolean {
    return this.#input.required;
  }
  public set required(value: boolean) {
    this.#input.required = value;
    this.#syncValidity();
  }
  public get readOnly(): boolean {
    return this.#input.readOnly;
  }
  public set readOnly(value: boolean) {
    this.#input.readOnly = value;
    this.#button.disabled = value || !this.enabled;
    this.#button.setAttribute('aria-disabled', String(value || !this.enabled));
    this.#syncValidity();
  }
  public get placeholder(): string {
    return this.#placeholder;
  }
  public set placeholder(value: string) {
    this.#placeholder = value;
    this.#refresh();
  }
  public get accessibleLabel(): string {
    return this.element.getAttribute('aria-label') ?? '';
  }
  public set accessibleLabel(value: string) {
    this.element.setAttribute('aria-label', value || this.name || 'Date');
    this.#input.setAttribute('aria-label', value || this.name || 'Date');
  }
  public get showCalendar(): boolean {
    return !this.#button.hidden;
  }
  public set showCalendar(value: boolean) {
    this.#button.hidden = !value;
    if (!value) this.#calendar.close(false);
  }
  public override get visible(): boolean {
    return super.visible;
  }
  public override set visible(value: boolean) {
    super.visible = value;
    if (!value) this.#calendar.close(false);
  }
  public override get enabled(): boolean {
    return !this.#input.disabled;
  }
  public override set enabled(value: boolean) {
    super.enabled = value;
    this.#input.disabled = !value;
    this.#button.disabled = !value || this.readOnly;
    this.#button.setAttribute('aria-disabled', String(!value || this.readOnly));
    this.#syncValidity();
  }
  public override get tabIndex(): number {
    return this.#input.tabIndex;
  }
  public override set tabIndex(value: number) {
    this.#input.tabIndex = value;
    this.#button.tabIndex = value < 0 ? -1 : 0;
  }
  public override focus(options?: FocusOptions): void {
    this.#input.focus(options);
  }
  public get valid(): boolean {
    this.#syncValidity();
    return this.#input.validity.valid || !this.enabled || this.readOnly;
  }
  public get validationMessage(): string {
    return this.valid ? '' : this.#input.validationMessage;
  }
  public checkValidity(): boolean {
    this.#syncValidity();
    return this.#input.checkValidity();
  }
  public reportValidity(): boolean {
    this.#syncValidity();
    return this.#input.reportValidity();
  }
  public clear(): void {
    this.value = '';
  }
  public setNow(): void {
    this.datetime = new Date();
  }
  /** Opens the calendar aligned to the field, with a minimum popup width of 260px. */
  public showPicker(): boolean {
    return this.#calendar.show();
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
    this.#calendar.dispose();
    instances.delete(this.element);
    super.dispose();
  }
}
