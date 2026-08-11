const RUNTIME_TYPINGS = `declare module '@webrad/runtime' {
  export type WebComponentEventHandler<TSender extends WebComponent = WebComponent> = (
    sender: TSender,
    event: Event,
  ) => void | Promise<void>;

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

  export class WebPanel extends WebComponent<HTMLElement> {}

  export class WebForm extends WebPanel {
    show(): void;
    close(options?: { readonly remove?: boolean }): void;
    requireComponentElement(componentId: string): HTMLElement;
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
    onChange: WebComponentEventHandler<this> | null;
    onInput: WebComponentEventHandler<this> | null;
  }

  export class WebTextArea extends WebComponent<HTMLTextAreaElement> {
    constructor(element: HTMLElement);
    value: string;
    placeholder: string;
    readOnly: boolean;
    clear(): void;
    onChange: WebComponentEventHandler<this> | null;
    onInput: WebComponentEventHandler<this> | null;
  }

  export class WebButton extends WebComponent<HTMLButtonElement> {
    constructor(element: HTMLElement);
    caption: string;
    click(): void;
    onClick: WebComponentEventHandler<this> | null;
  }

  export class WebCheckBox extends WebComponent<HTMLElement> {
    checked: boolean;
    caption: string;
    onChange: WebComponentEventHandler<this> | null;
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
    items: readonly (string | WebSelectItem)[];
    onChange: WebComponentEventHandler<this> | null;
  }

  export class WebImage extends WebComponent<HTMLImageElement> {
    constructor(element: HTMLElement);
    src: string;
    alt: string;
  }

  export class WebListBox extends WebComponent<HTMLSelectElement> {
    constructor(element: HTMLElement);
    value: string;
    items: readonly (string | WebSelectItem)[];
    selectedValues: readonly string[];
    onChange: WebComponentEventHandler<this> | null;
  }

  export interface NavigateOptions {
    readonly replace?: boolean;
    readonly newWindow?: boolean;
    readonly target?: string;
  }

  export function Message(message: unknown): void;
  export function Confirm(message: unknown): boolean;
  export function Navigate(destination: string | URL, options?: NavigateOptions): void;

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
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    readonly body: TBody;
    readonly response: Response;
  }
  export class WebApiClient {
    constructor(options?: WebApiClientOptions | string);
    request<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    get<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: WebApiRequestOptions): Promise<T>;
    delete<T>(path: string, options?: WebApiRequestOptions): Promise<T>;
  }
}

declare const Message: typeof import('@webrad/runtime').Message;
declare const Confirm: typeof import('@webrad/runtime').Confirm;
declare const Navigate: typeof import('@webrad/runtime').Navigate;
`;

/** Ambient declarations suitable for Monaco's `addExtraLib`. */
export function generateRuntimeTypings(): string {
  return RUNTIME_TYPINGS;
}

export const runtimeTypings = RUNTIME_TYPINGS;
