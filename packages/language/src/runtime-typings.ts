const RUNTIME_TYPINGS = `declare module '@webrad/runtime' {
  /** Handler used by every WebRAD component event. */
  export type WebComponentEventHandler<TSender extends WebComponent = WebComponent> = (
    sender: TSender,
    event: Event,
  ) => void | Promise<void>;

  /** Converts a WebRAD event name, such as OnClick, to its browser event name. */
  export function runtimeEventName(eventName: string): string;

  /** Base browser-side wrapper shared by every WebRAD component. */
  export class WebComponent<TElement extends HTMLElement = HTMLElement> {
    readonly element: TElement;
    constructor(element: TElement);
    readonly id: string;
    readonly name: string;
    visible: boolean;
    enabled: boolean;
    focus(options?: FocusOptions): void;
    show(): void;
    hide(): void;
    bindEvent(eventName: string, handler: WebComponentEventHandler<this> | null): () => void;
    emit(eventName: string, detail?: unknown): boolean;
    dispose(): void;
  }

  /** Visual container used to group controls. */
  export class WebPanel extends WebComponent<HTMLElement> {}

  export interface CloseFormOptions {
    /** Remove the form element from the document instead of hiding it. */
    readonly remove?: boolean;
  }

  /** Base class for generated and user-authored forms. */
  export class WebForm extends WebPanel {
    show(): void;
    close(options?: CloseFormOptions): void;
    requireComponentElement(componentId: string): HTMLElement;
    protected bindGeneratedEvent(
      component: WebComponent,
      eventName: string,
      handlerName: string,
    ): void;
    dispose(): void;
  }

  export class WebLabel extends WebComponent<HTMLElement> {
    caption: string;
    text: string;
  }

  export class WebEdit extends WebComponent<HTMLInputElement> {
    constructor(element: HTMLElement);
    value: string;
    placeholder: string;
    readOnly: boolean;
    clear(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onInput(handler: WebComponentEventHandler<this> | null);
  }

  export class WebTextArea extends WebComponent<HTMLTextAreaElement> {
    constructor(element: HTMLElement);
    value: string;
    placeholder: string;
    readOnly: boolean;
    clear(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onInput(handler: WebComponentEventHandler<this> | null);
  }

  export class WebButton extends WebComponent<HTMLButtonElement> {
    constructor(element: HTMLElement);
    caption: string;
    click(): void;
    set onClick(handler: WebComponentEventHandler<this> | null);
  }

  export class WebCheckBox extends WebComponent<HTMLElement> {
    constructor(element: HTMLElement);
    checked: boolean;
    caption: string;
    enabled: boolean;
    set onChange(handler: WebComponentEventHandler<this> | null);
  }

  export interface WebSelectItem {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
  }

  export class WebComboBox extends WebComponent<HTMLSelectElement> {
    constructor(element: HTMLElement);
    value: string;
    selectedIndex: number;
    get items(): readonly WebSelectItem[];
    set items(items: readonly (string | WebSelectItem)[]);
    set onChange(handler: WebComponentEventHandler<this> | null);
  }

  export class WebImage extends WebComponent<HTMLImageElement> {
    constructor(element: HTMLElement);
    src: string;
    alt: string;
  }

  export class WebListBox extends WebComponent<HTMLSelectElement> {
    constructor(element: HTMLElement);
    value: string;
    get items(): readonly WebSelectItem[];
    set items(items: readonly (string | WebSelectItem)[]);
    selectedValues: readonly string[];
    set onChange(handler: WebComponentEventHandler<this> | null);
  }

  export interface NavigateOptions {
    readonly replace?: boolean;
    readonly newWindow?: boolean;
    readonly target?: string;
  }

  /** Shows a browser message to the application user. */
  export function Message(message: unknown): void;
  /** Asks the application user to confirm an action. */
  export function Confirm(message: unknown): boolean;
  /** Navigates the application or opens a destination in another window. */
  export function Navigate(destination: string | URL, options?: NavigateOptions): void;
  export const message: typeof Message;
  export const confirm: typeof Confirm;
  export const navigate: typeof Navigate;

  export type QueryValue = string | number | boolean | null | undefined;

  export interface WebApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
    readonly body?: unknown;
    readonly headers?: HeadersInit;
    readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
  }

  export interface WebApiClientOptions {
    readonly baseUrl?: string;
    readonly headers?: HeadersInit;
    readonly fetch?: typeof globalThis.fetch;
  }

  export class WebApiError<TBody = unknown> extends Error {
    constructor(
      message: string,
      status: number,
      statusText: string,
      url: string,
      body: TBody,
      response: Response,
    );
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    readonly body: TBody;
    readonly response: Response;
  }

  /** Fetch-based HTTP client with JSON bodies, query parameters, and typed responses. */
  export class WebApiClient {
    constructor(options?: WebApiClientOptions | string);
    request<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    get<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    delete<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
  }

  export interface RuntimeBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  export interface RuntimeComponentNode {
    readonly id: string;
    readonly type: string;
    readonly name: string;
    readonly parentId: string | null;
    readonly bounds: RuntimeBounds;
    readonly props: Readonly<Record<string, unknown>>;
    readonly children: readonly string[];
  }

  export interface RuntimeFormModel {
    readonly id: string;
    readonly name: string;
    readonly caption: string;
    readonly width: number;
    readonly height: number;
    readonly layoutMode: 'absolute' | 'flex' | 'grid';
    readonly components: readonly RuntimeComponentNode[];
    readonly rootComponentId: string;
  }

  export interface RuntimeComponentAdapter<T extends WebComponent = WebComponent> {
    readonly createElement: (document: Document, node: RuntimeComponentNode) => HTMLElement;
    readonly createComponent: (element: HTMLElement) => T;
    readonly applyProperties?: (component: T, node: RuntimeComponentNode) => void;
  }

  export class RuntimeComponentRegistry {
    register<T extends WebComponent>(type: string, adapter: RuntimeComponentAdapter<T>): this;
    has(type: string): boolean;
    require(type: string): RuntimeComponentAdapter;
    create(document: Document, node: RuntimeComponentNode): WebComponent;
  }

  export const runtimeComponentRegistry: RuntimeComponentRegistry;

  export interface MountedRuntimeForm {
    readonly element: HTMLElement;
    readonly form: WebForm;
    readonly components: ReadonlyMap<string, WebComponent>;
  }

  export interface MountFormOptions {
    readonly replaceHostContents?: boolean;
    readonly registry?: RuntimeComponentRegistry;
  }

  export function mountForm(
    model: RuntimeFormModel,
    host?: HTMLElement,
    options?: MountFormOptions,
  ): MountedRuntimeForm;

  export interface VisualPropertySource {
    readonly props: Readonly<Record<string, unknown>>;
  }

  export interface VisualComponentSource extends VisualPropertySource {
    readonly type: string;
    readonly bounds: {
      readonly width: number;
      readonly height: number;
    };
  }

  export type VisualSizingMode = 'bounds' | 'fill';

  export interface ComponentVisualStyle {
    readonly width: string;
    readonly height: string;
    readonly backgroundColor?: string;
    readonly color?: string;
    readonly borderColor?: string;
    readonly borderStyle?: 'solid';
    readonly borderWidth?: string;
  }

  export interface ComponentVisualProjection {
    readonly classNames: readonly [base: 'wr-component', type: string];
    readonly style: ComponentVisualStyle;
    readonly visible: boolean;
    readonly enabled: boolean;
    readonly title?: string;
    readonly tabIndex?: number;
  }

  export function readStringProperty(
    source: VisualPropertySource,
    name: string,
    fallback?: string,
  ): string;
  export function readBooleanProperty(
    source: VisualPropertySource,
    name: string,
    fallback?: boolean,
  ): boolean;
  export function readIntegerProperty(
    source: VisualPropertySource,
    name: string,
  ): number | undefined;
  export function readIntegerProperty(
    source: VisualPropertySource,
    name: string,
    fallback: number,
  ): number;
  export function readStringListProperty(
    source: VisualPropertySource,
    name: string,
  ): readonly string[];
  export function projectComponentVisual(
    source: VisualComponentSource,
    sizing?: VisualSizingMode,
  ): ComponentVisualProjection;
  export const WEBRAD_COMPONENT_CSS: string;
}

/** Globally available WebRAD dialog helper. */
declare const Message: typeof import('@webrad/runtime').Message;
/** Globally available WebRAD confirmation helper. */
declare const Confirm: typeof import('@webrad/runtime').Confirm;
/** Globally available WebRAD navigation helper. */
declare const Navigate: typeof import('@webrad/runtime').Navigate;
`;

/** Ambient declarations suitable for Monaco's `addExtraLib`. */
export function generateRuntimeTypings(): string {
  return RUNTIME_TYPINGS;
}

export const runtimeTypings = RUNTIME_TYPINGS;
