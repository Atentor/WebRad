/** Internal browser integration hook; plain pages do not import an SDK. */
export interface PageEventTarget {
  readonly element: HTMLElement;
  emit(eventName: string, detail?: unknown): boolean;
}

type PageEventBinder = (page: PageEventTarget) => () => void;
let bindEvents: PageEventBinder | undefined;

export function setPageEventBinder(binder: PageEventBinder): void {
  bindEvents = binder;
}

export function bindPageIntegrationEvents(page: PageEventTarget): () => void {
  return bindEvents?.(page) ?? (() => {});
}
