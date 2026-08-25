import { WebComponent, type WebComponentEventHandler } from './component.js';

function textContentElement(element: HTMLElement): HTMLElement | null {
  return element.querySelector<HTMLElement>('[data-webrad-text-content]');
}

function textFrom(element: HTMLElement): string {
  return textContentElement(element)?.textContent ?? element.textContent ?? '';
}

function setText(element: HTMLElement, value: string): void {
  const textContent = textContentElement(element);
  if (textContent === null) element.textContent = value;
  else textContent.textContent = value;
}

export class WebLabel extends WebComponent<HTMLElement> {
  public get caption(): string {
    return textFrom(this.element);
  }

  public set caption(value: string) {
    setText(this.element, value);
  }

  public get text(): string {
    return this.caption;
  }

  public set text(value: string) {
    this.caption = value;
  }

  public get autoSize(): boolean {
    return this.element.dataset.webradAutoSize === 'true';
  }

  public set autoSize(value: boolean) {
    if (value === this.autoSize) return;
    if (value) {
      this.element.dataset.webradAutoSizeWidth = this.element.style.width;
      this.element.dataset.webradAutoSizeHeight = this.element.style.height;
      this.element.dataset.webradAutoSize = 'true';
      this.element.style.width = 'fit-content';
      this.element.style.height = 'fit-content';
      return;
    }

    this.element.style.width = this.element.dataset.webradAutoSizeWidth ?? '';
    this.element.style.height = this.element.dataset.webradAutoSizeHeight ?? '';
    delete this.element.dataset.webradAutoSizeWidth;
    delete this.element.dataset.webradAutoSizeHeight;
    this.element.dataset.webradAutoSize = 'false';
  }
}

export type WebInputType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';

function inputElement(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement))
    throw new TypeError('WebEdit requires an input element.');
  return element;
}

export class WebEdit extends WebComponent<HTMLInputElement> {
  public constructor(element: HTMLElement) {
    super(inputElement(element));
  }

  public get value(): string {
    return this.element.value;
  }

  public set value(value: string) {
    this.element.value = value;
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
    return this.element.type as WebInputType;
  }

  public set inputType(value: WebInputType) {
    this.element.type = value;
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
}

export class WebTextArea extends WebComponent<HTMLTextAreaElement> {
  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLTextAreaElement)) {
      throw new TypeError('WebTextArea requires a textarea element.');
    }
    super(element);
  }

  public get value(): string {
    return this.element.value;
  }

  public set value(value: string) {
    this.element.value = value;
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

  public get rows(): number {
    return this.element.rows;
  }

  public set rows(value: number) {
    this.element.rows = value;
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
}

export class WebButton extends WebComponent<HTMLButtonElement> {
  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLButtonElement)) {
      throw new TypeError('WebButton requires a button element.');
    }
    super(element);
  }

  public get caption(): string {
    return textFrom(this.element);
  }

  public set caption(value: string) {
    setText(this.element, value);
  }

  public click(): void {
    this.element.click();
  }

  public set onClick(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnClick', handler);
  }
}

function checkboxInput(element: HTMLElement): HTMLInputElement {
  if (element instanceof HTMLInputElement) return element;
  const input = element.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (input === null) throw new TypeError('WebCheckBox requires a checkbox input.');
  return input;
}

export class WebCheckBox extends WebComponent<HTMLElement> {
  readonly #input: HTMLInputElement;

  public constructor(element: HTMLElement) {
    super(element);
    this.#input = checkboxInput(element);
  }

  public get checked(): boolean {
    return this.#input.checked;
  }

  public set checked(value: boolean) {
    this.#input.checked = value;
  }

  public get caption(): string {
    return this.element.dataset.webradCaption ?? this.element.textContent?.trim() ?? '';
  }

  public set caption(value: string) {
    this.element.dataset.webradCaption = value;
    const caption = this.element.querySelector<HTMLElement>('[data-webrad-checkbox-caption]');
    if (caption !== null) caption.textContent = value;
    else this.#input.setAttribute('aria-label', value);
  }

  public override get enabled(): boolean {
    return !this.#input.disabled;
  }

  public override set enabled(value: boolean) {
    this.#input.disabled = !value;
    this.element.setAttribute('aria-disabled', String(!value));
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
}

export interface WebSelectItem {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

function normalizeItems(items: readonly (string | WebSelectItem)[]): readonly WebSelectItem[] {
  return items.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : { ...item },
  );
}

function replaceOptions(
  element: HTMLSelectElement,
  items: readonly (string | WebSelectItem)[],
): void {
  element.replaceChildren(
    ...normalizeItems(items).map((item) => {
      const option = element.ownerDocument.createElement('option');
      option.value = item.value;
      option.textContent = item.label;
      option.disabled = item.disabled ?? false;
      return option;
    }),
  );
}

export class WebComboBox extends WebComponent<HTMLSelectElement> {
  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLSelectElement)) {
      throw new TypeError('WebComboBox requires a select element.');
    }
    super(element);
  }

  public get value(): string {
    return this.element.value;
  }

  public set value(value: string) {
    this.element.value = value;
  }

  public get selectedIndex(): number {
    return this.element.selectedIndex;
  }

  public set selectedIndex(value: number) {
    this.element.selectedIndex = value;
  }

  public set items(items: readonly (string | WebSelectItem)[]) {
    replaceOptions(this.element, items);
  }

  public get items(): readonly WebSelectItem[] {
    return [...this.element.options].map((item) => ({
      value: item.value,
      label: item.text,
      disabled: item.disabled,
    }));
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
}

export class WebImage extends WebComponent<HTMLImageElement> {
  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLImageElement)) {
      throw new TypeError('WebImage requires an image element.');
    }
    super(element);
  }

  public get src(): string {
    return this.element.src;
  }

  public set src(value: string) {
    this.element.src = value;
  }

  public get alt(): string {
    return this.element.alt;
  }

  public set alt(value: string) {
    this.element.alt = value;
  }

  public get objectFit(): WebImageObjectFit {
    return (this.element.style.objectFit || 'contain') as WebImageObjectFit;
  }

  public set objectFit(value: WebImageObjectFit) {
    this.element.style.objectFit = value;
  }
}

export type WebImageObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

export class WebListBox extends WebComponent<HTMLSelectElement> {
  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLSelectElement)) {
      throw new TypeError('WebListBox requires a select element.');
    }
    super(element);
  }

  public get value(): string {
    return this.element.value;
  }

  public set value(value: string) {
    this.element.value = value;
  }

  public get selectedIndex(): number {
    return this.element.selectedIndex;
  }

  public set selectedIndex(value: number) {
    this.element.selectedIndex = value;
  }

  public get multiple(): boolean {
    return this.element.multiple;
  }

  public set multiple(value: boolean) {
    this.element.multiple = value;
  }

  public set items(items: readonly (string | WebSelectItem)[]) {
    replaceOptions(this.element, items);
  }

  public get items(): readonly WebSelectItem[] {
    return [...this.element.options].map((item) => ({
      value: item.value,
      label: item.text,
      disabled: item.disabled,
    }));
  }

  public get selectedValues(): readonly string[] {
    return [...this.element.selectedOptions].map((option) => option.value);
  }

  public set selectedValues(values: readonly string[]) {
    const selected = new Set(values);
    for (const option of this.element.options) option.selected = selected.has(option.value);
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
}

export class WebPanel extends WebComponent<HTMLElement> {
  public get caption(): string {
    return this.element.dataset.webradCaption ?? this.element.getAttribute('aria-label') ?? '';
  }

  public set caption(value: string) {
    this.element.dataset.webradCaption = value;
    this.element.setAttribute('aria-label', value);
  }
}
