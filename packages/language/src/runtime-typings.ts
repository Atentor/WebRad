import reportBuilderTypings from './report-builder-typings.generated.json';
import apiClientTypings from './api-client-typings.generated.json';
import videoUploadTypings from './video-upload-typings.generated.json';
import videoPlayerTypings from './video-player-typings.generated.json';
import repeatingGroupTypings from './repeating-group-typings.generated.json';
import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';

import restGoTypings from './restgo-typings.generated.json';

const WEB_BUTTON_ICON_TYPINGS = WEBRAD_ICON_NAMES.map((icon) => `    | '${icon}'`).join('\n');

const RUNTIME_TYPINGS = `declare module '@webrad/runtime' {
${reportBuilderTypings.source}
${repeatingGroupTypings.source}
  export interface RestGoRuntimeConfiguration {
    readonly enabled: boolean;
    readonly baseUrl: string;
    readonly apiToken?: string;
    readonly apiVersion: number;
    readonly defaultDatabase: string;
    readonly persistSession: boolean;
    readonly sessionStorage: 'local' | 'session' | 'memory';
    readonly storageKey: string;
  }
  export class RestGoNotConfiguredError extends Error {
    constructor();
  }
  export function configureRestGo(configuration: RestGoRuntimeConfiguration): import('@webrad/restgo-sdk').RestGoClient | null;
  export function getRestGoClient(): import('@webrad/restgo-sdk').RestGoClient;
  export const RestGO: import('@webrad/restgo-sdk').RestGoClient;

  /** Handler used by every WebRAD component event. */
  export type WebComponentEventHandler<TSender = WebComponent> = (
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
    bindEvent(eventName: string, handler: WebComponentEventHandler<this> | null): () => void;
    emit(eventName: string, detail?: unknown): boolean;
    dispose(): void;
  }

  export const WEB_DATA_GRID_CELL_KINDS: readonly ['text', 'image', 'button', 'checkbox', 'toggle'];
  export type WebDataGridCellKind = (typeof WEB_DATA_GRID_CELL_KINDS)[number];

  export const WEB_DATA_GRID_COLUMN_WIDTH_MODES: readonly ['fixed', 'dynamic'];
  export type WebDataGridColumnWidthMode = (typeof WEB_DATA_GRID_COLUMN_WIDTH_MODES)[number];

  export const WEB_DATA_GRID_ROW_HEIGHT_MODES: readonly ['fixed', 'dynamic'];
  export type WebDataGridRowHeightMode = (typeof WEB_DATA_GRID_ROW_HEIGHT_MODES)[number];

  export const WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS: readonly ['start', 'center', 'end'];
  export type WebDataGridHorizontalAlignment = (typeof WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS)[number];

  export interface WebDataGridColumn {
    readonly id: string;
    readonly header: string;
    readonly fieldPath: string;
    readonly cellKind: WebDataGridCellKind;
    readonly fixedCaption: string;
    readonly buttonIcon: WebButtonIcon | null;
    readonly footer: string;
    readonly widthMode: WebDataGridColumnWidthMode;
    readonly width: number;
    readonly minWidth: number;
    readonly maxWidth: number | null;
    readonly flex: number;
    readonly headerAlign: WebDataGridHorizontalAlignment;
    readonly cellAlign: WebDataGridHorizontalAlignment;
  }

  export interface WebDataGridConfiguration {
    readonly schemaVersion: number;
    readonly apiClientId: string | null;
    readonly operationId: string | null;
    readonly listPath: string;
    readonly columnCount: number;
    readonly showHeader: boolean;
    readonly stickyHeader: boolean;
    readonly showFooter: boolean;
    readonly stickyFooter: boolean;
    readonly rowHeightMode: WebDataGridRowHeightMode;
    readonly fixedRowHeight: number;
    readonly minRowHeight: number;
    readonly maxRowHeight: number | null;
    readonly cellPaddingHorizontal: number;
    readonly cellPaddingVertical: number;
    readonly wrapText: boolean;
    readonly stripedRows: boolean;
    readonly showHorizontalLines: boolean;
    readonly showVerticalLines: boolean;
    readonly emptyMessage: string;
    readonly columns: readonly WebDataGridColumn[];
  }

  export interface WebDataGridCellEventDetail {
    readonly rowIndex: number;
    readonly columnIndex: number;
    readonly row: unknown;
    readonly column: WebDataGridColumn;
    readonly value: unknown;
    readonly getValue: <T = unknown>(fieldNameOrPath: string) => T | undefined;
  }

  export function normalizeWebDataGridConfiguration(value: unknown): WebDataGridConfiguration;

  export class WebDataGrid extends WebComponent<HTMLDivElement> {
    constructor(element: HTMLElement);
    configuration: WebDataGridConfiguration;
    dataGridConfig: WebDataGridConfiguration;
    bindApiClient(apiClient: WebApiClient | null): void;
  }

  /** Base browser-side wrapper shared by every visual WebRAD component. */
  export interface WebCurrentRowBinding {
    readonly property: string;
    readonly fieldPath: string;
  }

  export class WebComponent<TElement extends HTMLElement = HTMLElement> {
    currentRowBindings: readonly WebCurrentRowBinding[];
    readonly element: TElement;
    constructor(element: TElement);
    readonly id: string;
    readonly name: string;
    visible: boolean;
    collapseWhenHidden: boolean;
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Outer spacing on all four sides, in pixels. */
    margin: number;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    alignSelf: RuntimeLayoutAlignSelf;
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
  export type WebPanelBackgroundSize = 'cover' | 'contain' | 'auto' | 'stretch';
  export type WebPanelBackgroundPosition = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'left top' | 'right top' | 'left bottom' | 'right bottom';
  export type WebPanelBackgroundRepeat = 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
  export const PANEL_BACKGROUND_SIZES: readonly ['cover', 'contain', 'auto', 'stretch'];
  export const PANEL_BACKGROUND_POSITIONS: readonly ['center', 'top', 'bottom', 'left', 'right', 'left top', 'right top', 'left bottom', 'right bottom'];
  export const PANEL_BACKGROUND_REPEATS: readonly ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'];
  export class WebPanel extends WebComponent<HTMLElement> {
    caption: string;
    progressEnabled: boolean;
    progressValue: number;
    readonly progressVisible: boolean;
    backgroundImage: string;
    backgroundSize: WebPanelBackgroundSize;
    backgroundPosition: WebPanelBackgroundPosition;
    backgroundRepeat: WebPanelBackgroundRepeat;
  }
  export class WebGroup extends WebPanel {}


  /** Browser-native floating child container that can be shown or closed from page code. */
  export class WebPopup extends WebComponent<HTMLDialogElement> {
    constructor(element: HTMLElement);
    modal: boolean;
    readonly open: boolean;
    returnValue: string;
    show(): void;
    hide(): void;
    close(returnValue?: string): void;
  }

  /** One instance of a shared reusable component definition. */
  export class WebReusableElement extends WebPanel {
    reusableElementId: string;
    placement: 'in-flow' | 'floating';
    floatingHorizontalAnchor: 'left' | 'center' | 'right';
    floatingVerticalAnchor: 'top' | 'center' | 'bottom';
    floatingZIndex: number;
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
  export type RuntimeLayoutAlignSelf = 'auto' | RuntimeLayoutAlignItems;

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
    readonly alignSelf?: RuntimeLayoutAlignSelf;
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
    readonly props?: Readonly<Record<string, unknown>>;
    readonly layout?: RuntimeComponentLayout;
  }

  export interface RuntimeLayoutProjection {
    readonly container: Readonly<Record<string, string>>;
    readonly item: Readonly<Record<string, string>>;
  }

  export interface ApplyRuntimeLayoutOptions {
    readonly isPageRoot?: boolean;
    readonly isReusableRoot?: boolean;
    readonly reusableRootFitContent?: {
      readonly width: boolean;
      readonly height: boolean;
      readonly hasMaxWidth: boolean;
      readonly hasMaxHeight: boolean;
    };
  }

  export interface RuntimeFitContentSize {
    readonly width?: number;
    readonly height?: number;
  }

  export interface RuntimeFitContentMeasurementOptions {
    readonly scale?: number;
    readonly isLayoutChild?: (child: HTMLElement) => boolean;
  }

  export interface RuntimeFitContentBinding {
    refresh(): void;
    dispose(): void;
  }

  export function resolveRuntimeContainerLayout(
    layout: RuntimeComponentLayout | undefined,
  ): RuntimeContainerLayout;
  export function projectRuntimeLayout(
    node: RuntimeLayoutNode,
    parentContainer?: RuntimeContainerLayout,
  ): RuntimeLayoutProjection;
  export function setRuntimeLayoutAspectRatio(
    element: HTMLElement,
    ratio: 'none' | '16:9' | '9:16',
  ): void;
  export function measureRuntimeFitContentSize(
    target: HTMLElement,
    contentHost: HTMLElement,
    layout: RuntimeComponentLayout | undefined,
    options?: RuntimeFitContentMeasurementOptions,
  ): RuntimeFitContentSize;
  export function bindRuntimeFitContent(
    target: HTMLElement,
    contentHost: HTMLElement,
    layout: RuntimeComponentLayout | undefined,
    options?: RuntimeFitContentMeasurementOptions,
  ): RuntimeFitContentBinding;
  export function applyRuntimeContainerLayout(
    element: HTMLElement,
    node: RuntimeLayoutNode,
  ): RuntimeLayoutProjection;
  export function applyRuntimeLayout(
    element: HTMLElement,
    node: RuntimeLayoutNode,
    parentContainer?: RuntimeContainerLayout,
    options?: ApplyRuntimeLayoutOptions,
  ): RuntimeLayoutProjection;

  export type WebPageLayoutMode = RuntimeContainerLayoutMode;

  /** Shared event-binding and component lookup surface for authored scopes. */
  export class WebComponentScope extends WebPanel {
    constructor(element: HTMLElement, components?: ReadonlyMap<string, WebComponent>);
    requireComponentElement(componentId: string): HTMLElement;
    protected bindGeneratedEvent(
      component: WebComponent | WebNonvisualComponent,
      eventName: string,
      handlerName: string,
      currentRow?: WebRepeatingGroupCurrentRow,
    ): () => void;
    dispose(): void;
  }

  /** One isolated authored-code scope for a mounted reusable placement. */
  export class WebReusableElementInstance extends WebComponentScope {
    constructor(
      element: HTMLElement,
      instanceId: string,
      components: ReadonlyMap<string, WebComponent>,
      componentIds: ReadonlyMap<string, string>,
    );
    readonly instanceId: string;
    /** User-facing name of the page that contains this reusable placement. */
    readonly pageName: string;
    componentId(templateComponentId: string): string;
  }

  /** Current user delivered when a shown page receives an authenticated session. */
  export interface WebPageLoginEventDetail {
    readonly user: import('@webrad/restgo-sdk').RestGoUser;
    readonly restored: boolean;
  }

  export interface WebPageLogoutEventDetail {
    readonly user: import('@webrad/restgo-sdk').RestGoUser;
  }

  /** Base class for generated and user-authored pages. */
  export class WebPage extends WebComponentScope {
    layoutMode: WebPageLayoutMode;
    show(): void;
    close(options?: ClosePageOptions): void;
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

  export interface WebFileUploadOptions {
    readonly isPublic?: boolean;
    readonly name?: string;
    readonly signal?: AbortSignal;
  }

  export interface WebFileUploadConfiguration extends WebNonvisualComponentOptions {
    readonly accept?: string;
    readonly isPublic?: boolean;
    readonly enabled?: boolean;
  }

  export interface WebFileUploadSelection {
    readonly name: string;
    readonly path: string | null;
    readonly size: number;
    readonly extension: string;
  }

  export interface WebFileUploadResult extends Readonly<import('@webrad/restgo-sdk').RestGoStoredFile> {
    readonly url: string;
  }

  export type WebFileUploadChangeEventDetail = WebFileUploadSelection | null;

  export type WebFileUploadProgressEventDetail = import('@webrad/restgo-sdk').RestGoUploadProgress;

  export interface WebFileUploadCompleteEventDetail {
    readonly result: WebFileUploadResult | null;
    readonly error: Error | null;
  }

  /** Selects a local file and uploads it through the configured RestGO client. */
  export class WebFileUpload extends WebNonvisualComponent {
    constructor(configuration?: WebFileUploadConfiguration);
    accept: string;
    isPublic: boolean;
    enabled: boolean;
    readonly selectedFile: File | null;
    readonly selection: WebFileUploadSelection | null;
    readonly fileName: string;
    readonly uploading: boolean;
    readonly progress: number | null;
    readonly result: WebFileUploadResult | null;
    readonly lastError: Error | null;
    OpenFile(): Promise<WebFileUploadSelection | null>;
    SendToRestGO(options?: WebFileUploadOptions): Promise<WebFileUploadResult>;
    Clear(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onSuccess(handler: WebComponentEventHandler<this> | null);
    set onError(handler: WebComponentEventHandler<this> | null);
    set onComplete(handler: WebComponentEventHandler<this> | null);
    set onProgress(handler: WebComponentEventHandler<this> | null);
  }

  export class WebToggle extends WebComponent<HTMLButtonElement> {
    constructor(element: HTMLElement);
    checked: boolean;
    click(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
    set onClick(handler: WebComponentEventHandler<this> | null);
  }
  export type WebProgressBarFormat = 'bars' | 'dunnet' | 'circus';
  export class WebProgressBar extends WebComponent<HTMLElement> {
    constructor(element: HTMLElement);
    value: number;
    min: number;
    max: number;
    format: WebProgressBarFormat;
    showValue: boolean;
    readonly percentage: number;
    setRange(min: number, max: number): void;
    increment(amount?: number): void;
    reset(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
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

  export interface WebComboBoxConfiguration {
    readonly schemaVersion: 1;
    readonly apiClientId: string | null;
    readonly operationId: string | null;
    readonly listPath: string;
    readonly displayField: string;
    readonly keyField: string;
  }

  export class WebComboBox extends WebComponent<HTMLSelectElement> {
    constructor(element: HTMLElement);
    value: string;
    selectedIndex: number;
    get values(): readonly string[];
    set values(values: readonly string[]);
    get items(): readonly WebSelectItem[];
    set items(items: readonly (string | WebSelectItem)[]);
    comboBoxConfig: WebComboBoxConfiguration | null;
    bindApiClient(apiClient: WebApiClient | null): void;
    override dispose(): void;
    set onChange(handler: WebComponentEventHandler<this> | null);
  }

  export class WebImage extends WebComponent<HTMLImageElement> {
    constructor(element: HTMLElement);
    get src(): string;
    set src(value: string | null);
    placeholder: WebImagePlaceholder;
    alt: string;
    objectFit: WebImageObjectFit;
  }

  export type WebImageObjectFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  export type WebImagePlaceholder = 'image' | 'user';

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
  /**
   * Navigates an internal project page when its name or ID is provided by a
   * compiled app; otherwise navigates the browser or opens another window.
   */
  export function Navigate(destination: string | URL, options?: NavigateOptions): void;
  export const message: typeof Message;
  export const confirm: typeof Confirm;
  export const navigate: typeof Navigate;

  ${apiClientTypings.source}
  ${videoUploadTypings.source}
  ${videoPlayerTypings.source}
  export interface RuntimeBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  export interface RuntimeComponentNode {
    readonly id: string;
    readonly templateId?: string;
    readonly reusableRoot?: boolean;
    readonly reusableDefinitionId?: string;
    readonly reusableInstanceId?: string;
    readonly type: string;
    readonly name: string;
    readonly parentId: string | null;
    readonly layout: RuntimeComponentLayout;
    readonly bounds: RuntimeBounds;
    readonly props: Readonly<Record<string, unknown>>;
    readonly children: readonly string[];
    readonly styleClassName?: string;
  }

  export interface RuntimeReusableElementModel {
    readonly id: string;
    readonly name: string;
    readonly caption: string;
    readonly width: number;
    readonly height: number;
    readonly components: readonly RuntimeComponentNode[];
    readonly rootComponentId: string;
  }

  export interface RuntimePageModel {
    readonly id: string;
    readonly name: string;
    readonly caption: string;
    readonly width: number;
    readonly height: number;
    readonly components: readonly RuntimeComponentNode[];
    readonly rootComponentId: string;
    readonly reusableElements?: readonly RuntimeReusableElementModel[];
  }

  export interface RuntimeComponentAdapter<T extends WebComponent = WebComponent> {
    readonly createElement: (document: Document, node: RuntimeComponentNode) => HTMLElement;
    readonly createComponent: (element: HTMLElement) => T;
    readonly applyProperties?: (component: T, node: RuntimeComponentNode) => void;
    readonly getChildrenHost?: (component: T, node: RuntimeComponentNode) => HTMLElement;
    readonly participatesInLayout?: boolean;
  }

  export class RuntimeComponentRegistry {
    register<T extends WebComponent>(type: string, adapter: RuntimeComponentAdapter<T>): this;
    has(type: string): boolean;
    require(type: string): RuntimeComponentAdapter;
    create(document: Document, node: RuntimeComponentNode): WebComponent;
  }

  export const runtimeComponentRegistry: RuntimeComponentRegistry;

  export function expandReusableElements(model: RuntimePageModel): RuntimePageModel;

  export interface MountedRuntimePage {
    readonly element: HTMLElement;
    readonly page: WebPage;
    readonly components: ReadonlyMap<string, WebComponent>;
    readonly reusableInstances: readonly MountedReusableElementInstance[];
    dispose(): void;
  }

  export interface MountedReusableElementInstance {
    readonly instanceId: string;
    readonly reusableElementId: string;
    readonly element: HTMLElement;
    readonly componentIds: ReadonlyMap<string, string>;
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

  /** Creates the authored wrapper for a page after its visual DOM is mounted. */
  export type RuntimePageFactory = (element: HTMLElement) => WebPage;

  /** Creates authored classes for reusable placements after a page is mounted. */
  export type RuntimeReusableElementFactory = (
    mounted: MountedRuntimePage,
  ) => readonly WebReusableElementInstance[];

  /** One route that can be mounted by the browser-side page router. */
  export interface RuntimePageRoute {
    readonly id: string;
    readonly name: string;
    readonly model: RuntimePageModel;
    readonly createPage: RuntimePageFactory;
    readonly createReusableElements?: RuntimeReusableElementFactory;
  }

  /** Mounts one authored project page at a time and resolves IDs or page names. */
  export class WebPageRouter {
    constructor(routes: readonly RuntimePageRoute[], host?: HTMLElement);
    readonly activePage: WebPage | null;
    readonly activeRoute: RuntimePageRoute | null;
    findRoute(destination: string): RuntimePageRoute | undefined;
    start(entryDestination: string): WebPage;
    navigateBrowser(destination: string | URL, options?: NavigateOptions): void;
    navigate(destination: string): WebPage;
    dispose(): void;
  }

  export interface VisualPropertySource {
    readonly props: Readonly<Record<string, unknown>>;
  }

  export function projectPanelBackground(props: Readonly<Record<string, unknown>>, styled?: boolean): {
    '--wr-panel-background-image': string;
    backgroundImage: string;
    backgroundSize: string;
    backgroundPosition: string;
    backgroundRepeat: string;
  };

  export interface VisualComponentSource extends VisualPropertySource {
    readonly type: string;
    readonly bounds: {
      readonly width: number;
      readonly height: number;
    };
  }

  export interface DataGridColumnTrackSource {
    readonly widthMode: 'fixed' | 'dynamic';
    readonly width: number;
    readonly minWidth: number;
    readonly maxWidth: number | null;
    readonly flex: number;
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
    readonly componentType?: string;
    readonly states: Readonly<Record<ComponentStyleStateName, TailwindStyleProperties>>;
  }

  export function tokenizeTailwindClasses(value: string): readonly string[];
  export function paletteColorId(value: unknown): string | undefined;
  export function paletteColorReference(id: string): string;
  export function resolveDataGridColumnTrackWidths(
    columns: readonly DataGridColumnTrackSource[],
    availableWidth: number,
  ): readonly number[];
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
    readonly collapseWhenHidden: boolean;
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
  export const WEBRAD_PROJECT_CSS: string;
}

declare module '@webrad/runtime/image-display' {
  export type WebImagePlaceholder = 'image' | 'user';
  export function imagePlaceholderSource(placeholder: WebImagePlaceholder): string;
  export function bindImageResampling(element: HTMLImageElement): () => void;
}

/** Globally available WebRAD dialog helper. */
declare const Message: typeof import('@webrad/runtime').Message;
/** Globally available WebRAD confirmation helper. */
declare const Confirm: typeof import('@webrad/runtime').Confirm;
/** Globally available WebRAD navigation helper. */
declare const Navigate: typeof import('@webrad/runtime').Navigate;
/** The RestGO client configured in Project Settings, shared by all pages. */
declare const RestGO: import('@webrad/restgo-sdk').RestGoClient;
`;

const COMPLETE_RUNTIME_TYPINGS = `${RUNTIME_TYPINGS}\n${restGoTypings}`;

/** Ambient declarations suitable for Monaco's `addExtraLib`. */
export function generateRuntimeTypings(): string {
  return COMPLETE_RUNTIME_TYPINGS;
}

export const runtimeTypings = COMPLETE_RUNTIME_TYPINGS;
