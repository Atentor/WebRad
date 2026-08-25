import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';

const WEB_BUTTON_ICON_TYPINGS = WEBRAD_ICON_NAMES.map((icon) => `    | '${icon}'`).join('\n');

const RUNTIME_TYPINGS = `declare module '@webrad/runtime' {
  /** Handler used by every WebRAD component event. */
  export type WebComponentEventHandler<TSender extends WebComponent = WebComponent> = (
    sender: TSender,
    event: Event,
  ) => void | Promise<void>;

  /** Converts a WebRAD event name, such as OnClick, to its browser event name. */
  export function runtimeEventName(eventName: string): string;

  export interface WebNonvisualComponentOptions {
    readonly id?: string;
    readonly name?: string;
  }

  /** Browser-safe identity shared by services that do not own a DOM element. */
  export class WebNonvisualComponent {
    constructor(options?: WebNonvisualComponentOptions);
    readonly id: string;
    readonly name: string;
  }

  /** Base browser-side wrapper shared by every visual WebRAD component. */
  export class WebComponent<TElement extends HTMLElement = HTMLElement> {
    readonly element: TElement;
    constructor(element: TElement);
    readonly id: string;
    readonly name: string;
    visible: boolean;
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    tabIndex: number;
    backgroundColor: string;
    color: string;
    borderColor: string;
    focus(options?: FocusOptions): void;
    show(): void;
    hide(): void;
    bindEvent(eventName: string, handler: WebComponentEventHandler<this> | null): () => void;
    emit(eventName: string, detail?: unknown): boolean;
    dispose(): void;
  }

  /** Visual container used to group controls. */
  export class WebPanel extends WebComponent<HTMLElement> {
    caption: string;
  }

  export interface ClosePageOptions {
    /** Remove the page element from the document instead of hiding it. */
    readonly remove?: boolean;
  }

  export type RuntimeContainerLayoutMode = 'fixed' | 'align-to-parent' | 'row' | 'column';
  export type RuntimeLayoutItemSizingMode = 'fixed' | 'stretch' | 'fit-content';
  export type RuntimeLayoutAnchor = 'start' | 'center' | 'end' | 'stretch';
  export type RuntimeLayoutJustifyContent =
    | 'start'
    | 'center'
    | 'end'
    | 'space-between'
    | 'space-around';
  export type RuntimeLayoutAlignItems = 'start' | 'center' | 'end' | 'stretch';

  export interface RuntimeContainerLayout {
    readonly mode: RuntimeContainerLayoutMode;
    readonly paddingTop: number;
    readonly paddingRight: number;
    readonly paddingBottom: number;
    readonly paddingLeft: number;
    readonly gap: number;
    readonly wrap: boolean;
    readonly justifyContent: RuntimeLayoutJustifyContent;
    readonly alignItems: RuntimeLayoutAlignItems;
  }

  export interface RuntimeLayoutItem {
    readonly width: RuntimeLayoutItemSizingMode;
    readonly height: RuntimeLayoutItemSizingMode;
    readonly minWidth: number;
    readonly maxWidth: number | null;
    readonly minHeight: number;
    readonly maxHeight: number | null;
    readonly grow: number;
    readonly shrink: boolean;
    readonly horizontalAnchor: RuntimeLayoutAnchor;
    readonly verticalAnchor: RuntimeLayoutAnchor;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  }

  export interface RuntimeComponentLayout {
    readonly container: RuntimeContainerLayout;
    readonly item: RuntimeLayoutItem;
  }

  export interface RuntimeLayoutBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  /** Structural node subset accepted by the browser-safe layout projector. */
  export interface RuntimeLayoutNode {
    readonly type?: string;
    readonly bounds: RuntimeLayoutBounds;
    readonly children?: readonly string[];
    readonly layout?: RuntimeComponentLayout;
  }

  export interface RuntimeLayoutProjection {
    readonly container: Readonly<Record<string, string>>;
    readonly item: Readonly<Record<string, string>>;
  }

  export interface ApplyRuntimeLayoutOptions {
    readonly isPageRoot?: boolean;
  }

  export function resolveRuntimeContainerLayout(
    layout: RuntimeComponentLayout | undefined,
  ): RuntimeContainerLayout;
  export function projectRuntimeLayout(
    node: RuntimeLayoutNode,
    parentContainer?: RuntimeContainerLayout,
  ): RuntimeLayoutProjection;
  export function applyRuntimeLayout(
    element: HTMLElement,
    node: RuntimeLayoutNode,
    parentContainer?: RuntimeContainerLayout,
    options?: ApplyRuntimeLayoutOptions,
  ): RuntimeLayoutProjection;

  export type WebPageLayoutMode = RuntimeContainerLayoutMode;

  /** Base class for generated and user-authored pages. */
  export class WebPage extends WebPanel {
    layoutMode: WebPageLayoutMode;
    show(): void;
    close(options?: ClosePageOptions): void;
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
    autoSize: boolean;
  }

  export type WebInputType = 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';

  export class WebEdit extends WebComponent<HTMLInputElement> {
    constructor(element: HTMLElement);
    value: string;
    placeholder: string;
    readOnly: boolean;
    inputType: WebInputType;
    clear(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onInput(handler: WebComponentEventHandler<this> | null);
  }

  export class WebTextArea extends WebComponent<HTMLTextAreaElement> {
    constructor(element: HTMLElement);
    value: string;
    placeholder: string;
    readOnly: boolean;
    rows: number;
    clear(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onInput(handler: WebComponentEventHandler<this> | null);
  }

  export type WebButtonIcon =
${WEB_BUTTON_ICON_TYPINGS};

  export class WebButton extends WebComponent<HTMLButtonElement> {
    constructor(element: HTMLElement);
    caption: string;
    icon: WebButtonIcon;
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
    objectFit: WebImageObjectFit;
  }

  export type WebImageObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

  export class WebListBox extends WebComponent<HTMLSelectElement> {
    constructor(element: HTMLElement);
    value: string;
    selectedIndex: number;
    multiple: boolean;
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

  export const WEB_API_RESPONSE_TYPES: readonly ['auto', 'json', 'text', 'blob', 'arrayBuffer'];
  export type WebApiResponseType = 'auto' | 'json' | 'text' | 'blob' | 'arrayBuffer';
  export type WebApiBodyKind = 'none' | 'json' | 'text' | 'form-urlencoded';
  export type WebApiCredentials = 'omit' | 'same-origin' | 'include';
  export type WebApiOperationStatus = 'idle' | 'loading' | 'success' | 'error';

  export interface WebApiParameter {
    readonly id: string;
    readonly name: string;
    readonly value: string;
    readonly enabled: boolean;
  }

  export interface WebApiRequestBody {
    readonly kind: WebApiBodyKind;
    readonly content: string;
  }

  export interface WebApiResponseSchemaNode {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly kind: 'field' | 'object' | 'list';
    readonly fieldType: string;
    readonly nullable: boolean;
    readonly children: readonly WebApiResponseSchemaNode[];
  }

  export interface WebApiResponseSchema {
    readonly version: 1;
    readonly root: WebApiResponseSchemaNode;
  }

  export interface WebApiOperation {
    readonly id: string;
    readonly name: string;
    readonly method: string;
    readonly path: string;
    readonly headers: readonly WebApiParameter[];
    readonly query: readonly WebApiParameter[];
    readonly body: WebApiRequestBody;
    readonly credentials: WebApiCredentials;
    readonly timeoutMs: number | null;
    readonly responseSchema: WebApiResponseSchema | null;
  }

  export interface WebApiClientConfiguration {
    readonly schemaVersion: number;
    readonly defaultHeaders: readonly WebApiParameter[];
    readonly timeoutMs: number;
    readonly operations: readonly WebApiOperation[];
  }

  export interface WebApiRequestOptions extends Omit<RequestInit, 'body' | 'headers' | 'signal'> {
    readonly body?: unknown;
    readonly headers?: HeadersInit;
    readonly query?: Readonly<Record<string, QueryValue | readonly QueryValue[]>>;
    readonly signal?: AbortSignal | null;
    readonly timeoutMs?: number | null;
    readonly responseType?: WebApiResponseType;
  }

  export interface WebApiClientOptions extends WebNonvisualComponentOptions {
    readonly baseUrl?: string;
    readonly headers?: HeadersInit;
    readonly fetch?: typeof globalThis.fetch;
    readonly apiClientConfig?: WebApiClientConfiguration;
  }

  export interface WebApiOperationState<T = unknown> {
    readonly status: WebApiOperationStatus;
    readonly data?: T;
    readonly error?: unknown;
    readonly updatedAt?: number;
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

  export class WebApiTimeoutError extends Error {
    constructor(timeoutMs: number, url: string);
    readonly timeoutMs: number;
    readonly url: string;
  }

  /** Fetch-based HTTP client with direct calls and typed configured operations. */
  export class WebApiClient<TOutputs extends object = Record<string, unknown>> extends WebNonvisualComponent {
    constructor(options?: WebApiClientOptions | string);
    baseUrl: string;
    readonly apiClientConfig: WebApiClientConfiguration;
    readonly operations: readonly WebApiOperation[];
    readonly data: Readonly<Partial<TOutputs>>;
    readonly status: WebApiOperationStatus;
    readonly error: unknown;
    getOperationState<T = unknown>(operationName: string): WebApiOperationState<T>;
    subscribe(listener: () => void): () => void;
    request<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    get<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    delete<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    execute<K extends keyof TOutputs & string>(
      operationName: K,
      options?: WebApiRequestOptions,
    ): Promise<TOutputs[K]>;
    execute<T = unknown>(operationName: string, options?: WebApiRequestOptions): Promise<T>;
    getOutputById<T = unknown>(operationName: string, schemaNodeIdOrPath: string): T | undefined;
    getList<T = unknown>(operationName: string, schemaNodeIdOrPath: string): readonly T[];
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
    readonly layout: RuntimeComponentLayout;
    readonly bounds: RuntimeBounds;
    readonly props: Readonly<Record<string, unknown>>;
    readonly children: readonly string[];
    readonly styleClassName?: string;
  }

  export interface RuntimePageModel {
    readonly id: string;
    readonly name: string;
    readonly caption: string;
    readonly width: number;
    readonly height: number;
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

  export interface MountedRuntimePage {
    readonly element: HTMLElement;
    readonly page: WebPage;
    readonly components: ReadonlyMap<string, WebComponent>;
  }

  export interface MountPageOptions {
    readonly replaceHostContents?: boolean;
    readonly registry?: RuntimeComponentRegistry;
  }

  export function mountPage(
    model: RuntimePageModel,
    host?: HTMLElement,
    options?: MountPageOptions,
  ): MountedRuntimePage;

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

  export type ComponentStyleStateName = 'base' | 'hover' | 'focus' | 'active' | 'disabled';
  export type StyleLengthUnit = 'px' | 'rem' | '%' | 'vw' | 'vh';

  export interface StyleLengthValue {
    readonly value: number;
    readonly unit: StyleLengthUnit;
  }

  export type LinearGradientDirection =
    | 'to-right'
    | 'to-bottom-right'
    | 'to-bottom'
    | 'to-bottom-left'
    | 'to-left'
    | 'to-top-left'
    | 'to-top'
    | 'to-top-right';

  export interface BackgroundGradientValue {
    readonly kind: 'linear';
    readonly direction: LinearGradientDirection;
    readonly from: string;
    readonly to: string;
  }

  export type StylePropertyValue = string | number | StyleLengthValue | BackgroundGradientValue;
  export type TailwindStyleProperties = Readonly<
    Record<string, StylePropertyValue | undefined>
  >;

  export interface TailwindStyleSource {
    readonly states: Readonly<Record<ComponentStyleStateName, TailwindStyleProperties>>;
  }

  export function tokenizeTailwindClasses(value: string): readonly string[];
  export function resolveStylePropertyCandidate(
    propertyName: string,
    value: StylePropertyValue,
  ): string | undefined;
  export function resolveComponentStyleStateClassNames(
    properties: TailwindStyleProperties | null | undefined,
  ): readonly string[];
  export function resolveComponentStyleClassNames(
    style: TailwindStyleSource | null | undefined,
  ): readonly string[];
  export function resolveComponentStyleClassName(
    style: TailwindStyleSource | null | undefined,
  ): string;
  export function resolveComponentStylePreviewClassName(
    style: TailwindStyleSource | null | undefined,
    stateName: ComponentStyleStateName,
  ): string;

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
    readonly classNames: readonly string[];
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
