import { WebComponent, type WebComponentEventHandler } from './component.js';
import {
  createWebRadIconElement,
  isWebRadIconName,
  setWebRadIconElementContent,
  type WebRadIconName,
} from './icons.js';

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

function ensureButtonTextContentElement(element: HTMLButtonElement): HTMLElement {
  const existing = textContentElement(element);
  if (existing !== null) return existing;
  const text = element.ownerDocument.createElement('span');
  text.classList.add('wr-button-text');
  text.dataset.webradTextContent = '';
  element.append(text);
  return text;
}

function ensureButtonIconElement(element: HTMLButtonElement): SVGSVGElement {
  const existing = element.querySelector<SVGSVGElement>('[data-webrad-button-icon]');
  if (existing !== null) return existing;
  const icon = createWebRadIconElement(element.ownerDocument, 'add');
  icon.classList.add('wr-button-icon');
  icon.dataset.webradButtonIcon = '';
  element.insertBefore(icon, textContentElement(element));
  return icon;
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

/** Closed icon catalogue accepted by the Button Inspector and browser runtime. */
export type WebButtonIcon = WebRadIconName;

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
    ensureButtonTextContentElement(this.element).textContent = value;
    this.element.setAttribute('aria-label', value);
  }

  public get icon(): WebButtonIcon {
    const value = this.element.dataset.webradButtonIcon;
    return isWebRadIconName(value) ? value : 'add';
  }

  public set icon(value: WebButtonIcon) {
    const icon = ensureButtonIconElement(this.element);
    const normalized = isWebRadIconName(value) ? value : 'add';
    setWebRadIconElementContent(icon, normalized);
    this.element.dataset.webradButtonIcon = normalized;
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

function popupElement(element: HTMLElement): HTMLDialogElement {
  if (element.tagName !== 'DIALOG') {
    throw new TypeError('WebPopup requires a dialog element.');
  }
  return element as HTMLDialogElement;
}

function popupContentElement(element: HTMLDialogElement): HTMLElement {
  const existing = element.querySelector<HTMLElement>('[data-webrad-popup-content]');
  if (existing !== null) return existing;

  const content = element.ownerDocument.createElement('div');
  content.classList.add('wr-popup-content');
  content.dataset.webradPopupContent = '';

  const caption = element.ownerDocument.createElement('h2');
  caption.classList.add('wr-popup-caption');
  caption.dataset.webradPopupCaption = '';

  const message = element.ownerDocument.createElement('p');
  message.classList.add('wr-popup-message');
  message.dataset.webradPopupMessage = '';

  content.append(caption, message);
  element.append(content);
  return content;
}

function popupTextElement(
  element: HTMLDialogElement,
  dataAttribute: 'webradPopupCaption' | 'webradPopupMessage',
): HTMLElement {
  popupContentElement(element);
  const selector =
    dataAttribute === 'webradPopupCaption'
      ? '[data-webrad-popup-caption]'
      : '[data-webrad-popup-message]';
  const text = element.querySelector<HTMLElement>(selector);
  if (text === null) throw new Error('WebPopup content could not be created.');
  return text;
}

type DialogMethod = (returnValue?: string) => void;

function dialogMethod(
  element: HTMLDialogElement,
  name: 'show' | 'showModal' | 'close',
): DialogMethod | undefined {
  const candidate = Reflect.get(element, name);
  return typeof candidate === 'function' ? (candidate as DialogMethod) : undefined;
}

/**
 * A browser-native dialog with the same DOM-backed API as other visual
 * components. The native dialog enters the top layer when modal, preventing
 * parent clipping or stacking contexts from trapping it below the page.
 */
export class WebPopup extends WebComponent<HTMLDialogElement> {
  #showQueued = false;
  #connectionObserver: MutationObserver | null = null;
  readonly #onNativeClose = (): void => {
    this.#stopWaitingForConnection();
    const wasVisible = super.visible;
    super.visible = false;
    if (wasVisible) this.emit('OnHide');
  };

  public constructor(element: HTMLElement) {
    super(popupElement(element));
    this.element.addEventListener('close', this.#onNativeClose);
  }

  public get caption(): string {
    return this.element.dataset.webradCaption ?? this.element.getAttribute('aria-label') ?? '';
  }

  public set caption(value: string) {
    this.element.dataset.webradCaption = value;
    this.element.setAttribute('aria-label', value);
    popupTextElement(this.element, 'webradPopupCaption').textContent = value;
  }

  public get message(): string {
    return this.element.dataset.webradMessage ?? '';
  }

  public set message(value: string) {
    this.element.dataset.webradMessage = value;
    popupTextElement(this.element, 'webradPopupMessage').textContent = value;
  }

  /** Whether show() opens the dialog in the browser's modal top layer. */
  public get modal(): boolean {
    return this.element.dataset.webradPopupModal !== 'false';
  }

  public set modal(value: boolean) {
    this.element.dataset.webradPopupModal = String(value);
  }

  /** True while the underlying browser dialog is open. */
  public get open(): boolean {
    return this.element.open;
  }

  public get returnValue(): string {
    return this.element.returnValue ?? '';
  }

  public set returnValue(value: string) {
    this.element.returnValue = value;
  }

  public override get visible(): boolean {
    return super.visible;
  }

  public override set visible(value: boolean) {
    if (value) this.show();
    else this.hide();
  }

  public override show(): void {
    if (this.element.open) {
      this.#stopWaitingForConnection();
      super.visible = true;
      return;
    }

    // Apply the shared visibility contract before opening. The base setter
    // intentionally owns hidden/ARIA/display, while the dialog owns top-layer
    // placement.
    super.visible = true;
    if (this.modal && !this.element.isConnected) {
      // mountPage applies model properties before appending the branch to its
      // host. showModal() rejects a detached dialog, so defer the first modal
      // opening until its host is connected. Most mounts finish synchronously,
      // but a caller may deliberately mount into a detached host and attach it
      // later.
      this.#queueShowAfterMount();
      return;
    }
    this.#stopWaitingForConnection();
    const method = this.modal
      ? dialogMethod(this.element, 'showModal')
      : dialogMethod(this.element, 'show');
    if (method === undefined) {
      // JSDOM and older engines implement HTMLDialogElement without its modal
      // methods. Keeping an attribute fallback makes the browser-safe runtime
      // testable without changing real-browser behavior.
      this.element.open = true;
    } else {
      try {
        method.call(this.element);
      } catch {
        // A detached dialog cannot enter the modal top layer. It can still
        // retain correct component state until its host is connected.
        if (this.modal && !this.element.isConnected) {
          this.#queueShowAfterMount();
          return;
        }
        this.element.open = true;
      }
    }
    this.emit('OnShow');
  }

  public override hide(): void {
    this.close();
  }

  public close(returnValue?: string): void {
    this.#stopWaitingForConnection();
    if (returnValue !== undefined) this.element.returnValue = returnValue;

    if (!this.element.open) {
      super.visible = false;
      return;
    }

    const close = dialogMethod(this.element, 'close');
    if (close === undefined) {
      this.element.open = false;
      this.element.dispatchEvent(new Event('close'));
      return;
    }

    close.call(this.element, returnValue);
  }

  public override dispose(): void {
    this.#stopWaitingForConnection();
    this.element.removeEventListener('close', this.#onNativeClose);
    super.dispose();
    if (!this.element.open) return;

    // Closing during teardown releases an open dialog from the browser's top
    // layer. Event listeners were removed first, so disposal cannot call
    // authored handlers after their page has begun to unmount.
    const close = dialogMethod(this.element, 'close');
    if (close === undefined) {
      this.element.open = false;
      return;
    }
    try {
      close.call(this.element);
    } catch {
      this.element.open = false;
    }
  }

  #queueShowAfterMount(): void {
    if (this.#showQueued) return;
    this.#showQueued = true;
    queueMicrotask(() => {
      if (!this.#showQueued) return;
      this.#showQueued = false;
      this.#showWhenConnected();
    });
  }

  #showWhenConnected(): void {
    if (!this.visible || this.open) {
      this.#stopWaitingForConnection();
      return;
    }
    if (this.element.isConnected) {
      this.#stopWaitingForConnection();
      this.show();
      return;
    }
    this.#observeConnection();
  }

  #observeConnection(): void {
    if (this.#connectionObserver !== null) return;
    const MutationObserverConstructor = this.element.ownerDocument.defaultView?.MutationObserver;
    if (MutationObserverConstructor === undefined) return;

    const connectionObserver = new MutationObserverConstructor(() => {
      if (this.#connectionObserver !== connectionObserver) return;
      this.#showWhenConnected();
    });
    this.#connectionObserver = connectionObserver;
    connectionObserver.observe(this.element.ownerDocument, { childList: true, subtree: true });

    // The document can change between the connection check above and observer
    // registration, so resolve that narrow race without waiting for another
    // DOM mutation.
    this.#showWhenConnected();
  }

  #stopWaitingForConnection(): void {
    this.#showQueued = false;
    this.#connectionObserver?.disconnect();
    this.#connectionObserver = null;
  }
}

/**
 * Wrapper for one placement of a project reusable definition. The definition
 * is expanded by mountPage(), while this component owns the instance element
 * that generated page code can address.
 */
export class WebReusableElement extends WebPanel {
  public get reusableElementId(): string {
    return this.element.dataset.webradReusableElementId ?? '';
  }

  public set reusableElementId(value: string) {
    this.element.dataset.webradReusableElementId = value;
  }

  public get placement(): 'in-flow' | 'floating' {
    return this.element.dataset.webradReusablePlacement === 'floating' ? 'floating' : 'in-flow';
  }

  public set placement(value: 'in-flow' | 'floating') {
    this.element.dataset.webradReusablePlacement = value;
  }

  public get floatingHorizontalAnchor(): 'left' | 'center' | 'right' {
    const value = this.element.dataset.webradFloatingHorizontalAnchor;
    return value === 'center' || value === 'right' ? value : 'left';
  }

  public set floatingHorizontalAnchor(value: 'left' | 'center' | 'right') {
    this.element.dataset.webradFloatingHorizontalAnchor = value;
  }

  public get floatingVerticalAnchor(): 'top' | 'center' | 'bottom' {
    const value = this.element.dataset.webradFloatingVerticalAnchor;
    return value === 'center' || value === 'bottom' ? value : 'top';
  }

  public set floatingVerticalAnchor(value: 'top' | 'center' | 'bottom') {
    this.element.dataset.webradFloatingVerticalAnchor = value;
  }

  public get floatingZIndex(): number {
    const value = Number(this.element.dataset.webradFloatingZIndex);
    return Number.isFinite(value) ? value : 100;
  }

  public set floatingZIndex(value: number) {
    if (!Number.isFinite(value)) throw new TypeError('floatingZIndex must be finite.');
    this.element.dataset.webradFloatingZIndex = String(Math.trunc(value));
  }
}
