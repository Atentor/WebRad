import { WebComponent, type WebComponentEventHandler } from './component.js';
import {
  disposePanelProgress,
  projectPanelProgress,
  renderPanelProgress,
} from './panel-progress.js';
import {
  projectPanelBackground,
  type WebPanelBackgroundSize,
  type WebPanelBackgroundPosition,
  type WebPanelBackgroundRepeat,
} from './visual.js';
import type { WebApiClient } from './api-client.js';
import {
  comboBoxItemText,
  normalizeWebComboBoxConfiguration,
  type WebComboBoxConfiguration,
} from './combo-box-data.js';
import {
  bindImageResampling,
  imagePlaceholderSource,
  type WebImagePlaceholder,
} from './image-display.js';
export type { WebImagePlaceholder } from './image-display.js';
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

  public get spellCheck(): boolean {
    return this.element.spellcheck;
  }

  public set spellCheck(value: boolean) {
    this.element.spellcheck = value;
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

/** A label-free native button with accessible switch semantics. */
interface ToggleActivation {
  references: number;
  readonly listener: EventListener;
}

// Mounting and generated code may wrap the same DOM element independently.
const toggleActivations = new WeakMap<HTMLButtonElement, ToggleActivation>();

export class WebToggle extends WebComponent<HTMLButtonElement> {
  #disposed = false;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLButtonElement))
      throw new TypeError('WebToggle requires a button element.');
    super(element);
    element.type = 'button';
    element.setAttribute('role', 'switch');
    if (!element.hasAttribute('aria-checked')) element.setAttribute('aria-checked', 'false');
    const activation = toggleActivations.get(element);
    if (activation !== undefined) {
      activation.references += 1;
      return;
    }
    const listener: EventListener = () => {
      if (element.disabled) return;
      element.setAttribute('aria-checked', String(element.getAttribute('aria-checked') !== 'true'));
      const ChangeEvent = element.ownerDocument.defaultView?.Event ?? Event;
      element.dispatchEvent(new ChangeEvent('change', { bubbles: true }));
    };
    toggleActivations.set(element, { references: 1, listener });
    element.addEventListener('click', listener);
  }

  public get checked(): boolean {
    return this.element.getAttribute('aria-checked') === 'true';
  }
  public set checked(value: boolean) {
    this.element.setAttribute('aria-checked', String(value));
  }
  public click(): void {
    this.element.click();
  }
  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }
  public set onClick(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnClick', handler);
  }
  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const activation = toggleActivations.get(this.element);
    if (activation !== undefined && --activation.references === 0) {
      this.element.removeEventListener('click', activation.listener);
      toggleActivations.delete(this.element);
    }
    super.dispose();
  }
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
  #configuration: WebComboBoxConfiguration | null = null;
  #apiClient: WebApiClient | null = null;
  #unsubscribe: (() => void) | null = null;
  #requestedValue: string;
  #staticItems: readonly WebSelectItem[];

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLSelectElement)) {
      throw new TypeError('WebComboBox requires a select element.');
    }
    super(element);
    this.#requestedValue = element.value;
    this.#staticItems = this.items;
  }

  public get value(): string {
    return this.element.value;
  }

  public set value(value: string) {
    this.#requestedValue = value;
    this.element.value = value;
  }

  public get selectedIndex(): number {
    return this.element.selectedIndex;
  }

  public set selectedIndex(value: number) {
    this.element.selectedIndex = value;
    this.#requestedValue = this.element.value;
  }

  public set items(items: readonly (string | WebSelectItem)[]) {
    this.#staticItems = normalizeItems(items);
    replaceOptions(this.element, items);
  }

  public get items(): readonly WebSelectItem[] {
    return [...this.element.options].map((item) => ({
      value: item.value,
      label: item.text,
      disabled: item.disabled,
    }));
  }

  public get values(): readonly string[] {
    return this.items.map((item) => item.value);
  }

  public set values(values: readonly string[]) {
    const items = this.items;
    if (values.length !== 0 && values.length !== items.length) {
      throw new RangeError('ComboBox Values must have one value per item.');
    }
    const selectedIndex = this.selectedIndex;
    this.items = items.map((item, index) => ({ ...item, value: values[index] ?? item.label }));
    this.selectedIndex = selectedIndex;
  }

  public set onChange(handler: WebComponentEventHandler<this> | null) {
    this.bindEvent('OnChange', handler);
  }

  public get comboBoxConfig(): WebComboBoxConfiguration | null {
    return this.#configuration;
  }

  public set comboBoxConfig(value: WebComboBoxConfiguration | null) {
    this.#configuration = normalizeWebComboBoxConfiguration(value);
    this.#renderApiItems();
  }

  /** Observes results; requests remain under the control of authored page code. */
  public bindApiClient(apiClient: WebApiClient | null): void {
    this.#unsubscribe?.();
    this.#apiClient = apiClient;
    this.#unsubscribe = apiClient?.subscribe(() => this.#renderApiItems()) ?? null;
    this.#renderApiItems();
  }

  #renderApiItems(): void {
    const configuration = this.#configuration;
    if (this.element.selectedIndex >= 0) this.#requestedValue = this.element.value;
    if (configuration === null) {
      replaceOptions(this.element, this.#staticItems);
      this.element.value = this.#requestedValue;
      return;
    }
    const apiClient = this.#apiClient;
    const operation =
      apiClient !== null && apiClient.id === configuration.apiClientId
        ? apiClient.operations.find((candidate) => candidate.id === configuration.operationId)
        : undefined;
    const rows =
      operation === undefined || apiClient === null
        ? []
        : apiClient.getList<unknown>(operation.name, configuration.listPath);
    const items: WebSelectItem[] = [];
    for (const row of rows) {
      const value = comboBoxItemText(row, configuration.keyField);
      const label = comboBoxItemText(row, configuration.displayField);
      if (value !== undefined && label !== undefined) items.push({ value, label });
    }
    // Loading or unrelated operations should not recreate identical options.
    const current = this.items;
    if (
      current.length !== items.length ||
      current.some(
        (item, index) =>
          item.value !== items[index]?.value || item.label !== items[index]?.label || item.disabled,
      )
    ) {
      replaceOptions(this.element, items);
      this.element.value = this.#requestedValue;
    }
  }

  public override dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#apiClient = null;
    super.dispose();
  }
}

export class WebImage extends WebComponent<HTMLImageElement> {
  readonly #disposeResampling: () => void;
  #source: string;
  #placeholder: WebImagePlaceholder = 'image';

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLImageElement)) {
      throw new TypeError('WebImage requires an image element.');
    }
    super(element);
    this.#source = element.getAttribute('src') ?? '';
    this.#updateSource();
    this.#disposeResampling = bindImageResampling(element);
  }

  public get src(): string {
    return this.#source.trim() === '' ? '' : this.element.src;
  }

  public set src(value: string | null) {
    this.#source = value ?? '';
    this.#updateSource();
  }

  public get placeholder(): WebImagePlaceholder {
    return this.#placeholder;
  }

  public set placeholder(value: WebImagePlaceholder) {
    this.#placeholder = value;
    this.#updateSource();
  }

  #updateSource(): void {
    const source =
      this.#source.trim() === '' ? imagePlaceholderSource(this.#placeholder) : this.#source;
    if (this.element.getAttribute('src') !== source) this.element.setAttribute('src', source);
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

  public override dispose(): void {
    this.#disposeResampling();
    super.dispose();
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
  #progressDisposed = false;

  public get progressEnabled(): boolean {
    return this.element.dataset.webradPanelProgressEnabled === 'true';
  }

  public set progressEnabled(value: boolean) {
    this.element.dataset.webradPanelProgressEnabled = String(value);
    if (!this.#progressDisposed) renderPanelProgress(this.element);
  }

  public get progressValue(): number {
    return projectPanelProgress({
      progressValue: Number(this.element.dataset.webradPanelProgressValue ?? 0),
    }).value;
  }

  public set progressValue(value: number) {
    if (!Number.isFinite(value)) throw new RangeError('Panel progress value must be finite.');
    this.element.dataset.webradPanelProgressValue = String(Math.max(0, Math.min(100, value)));
    if (!this.#progressDisposed) renderPanelProgress(this.element);
  }

  public get progressVisible(): boolean {
    return this.progressEnabled && this.progressValue > 0 && this.progressValue < 100;
  }

  public override dispose(): void {
    this.#progressDisposed = true;
    disposePanelProgress(this.element);
    super.dispose();
  }

  public get backgroundImage(): string {
    return this.element.dataset.webradBackgroundImage ?? '';
  }

  public set backgroundImage(value: string) {
    this.element.dataset.webradBackgroundImage = value;
    this.applyBackgroundImage();
  }

  public get backgroundSize(): WebPanelBackgroundSize {
    return (
      (this.element.dataset.webradBackgroundSize as WebPanelBackgroundSize | undefined) ?? 'cover'
    );
  }

  public set backgroundSize(value: WebPanelBackgroundSize) {
    this.element.dataset.webradBackgroundSize = value;
    this.applyBackgroundImage();
  }

  public get backgroundPosition(): WebPanelBackgroundPosition {
    return (
      (this.element.dataset.webradBackgroundPosition as WebPanelBackgroundPosition | undefined) ??
      'center'
    );
  }

  public set backgroundPosition(value: WebPanelBackgroundPosition) {
    this.element.dataset.webradBackgroundPosition = value;
    this.applyBackgroundImage();
  }

  public get backgroundRepeat(): WebPanelBackgroundRepeat {
    return (
      (this.element.dataset.webradBackgroundRepeat as WebPanelBackgroundRepeat | undefined) ??
      'no-repeat'
    );
  }

  public set backgroundRepeat(value: WebPanelBackgroundRepeat) {
    this.element.dataset.webradBackgroundRepeat = value;
    this.applyBackgroundImage();
  }

  private applyBackgroundImage(): void {
    const { '--wr-panel-background-image': image, ...style } = projectPanelBackground(
      {
        backgroundImage: this.backgroundImage,
        backgroundSize: this.backgroundSize,
        backgroundPosition: this.backgroundPosition,
        backgroundRepeat: this.backgroundRepeat,
      },
      this.element.dataset.webradPanelStyled === 'true',
    );
    if (image === '') this.element.style.removeProperty('--wr-panel-background-image');
    else this.element.style.setProperty('--wr-panel-background-image', image);
    Object.assign(this.element.style, style);
  }

  public get caption(): string {
    return this.element.dataset.webradCaption ?? this.element.getAttribute('aria-label') ?? '';
  }

  public set caption(value: string) {
    this.element.dataset.webradCaption = value;
    this.element.setAttribute('aria-label', value);
  }
}

/** Transparent structural container with the same runtime API as Panel. */
export class WebGroup extends WebPanel {}

function popupElement(element: HTMLElement): HTMLDialogElement {
  if (element.tagName !== 'DIALOG') {
    throw new TypeError('WebPopup requires a dialog element.');
  }
  return element as HTMLDialogElement;
}

function popupChildrenElement(element: HTMLDialogElement): HTMLElement {
  let children = element.querySelector<HTMLElement>('[data-webrad-popup-children]');
  if (children === null) {
    children = element.ownerDocument.createElement('div');
    children.classList.add('wr-popup-children');
    children.dataset.webradPopupChildren = '';
  }
  element.append(children);

  // An earlier Popup contract created a message-dialog shell around this host.
  // Move the one durable child host to the dialog root, then remove that old
  // shell so a programmatically reused dialog cannot retain obsolete caption
  // or message markup.
  for (const obsolete of element.querySelectorAll<HTMLElement>(
    '[data-webrad-popup-content], [data-webrad-popup-header], [data-webrad-popup-caption], [data-webrad-popup-message]',
  )) {
    obsolete.remove();
  }
  return children;
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
    popupChildrenElement(this.element);
    this.element.addEventListener('close', this.#onNativeClose);
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
