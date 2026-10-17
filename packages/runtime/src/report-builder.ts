import type { WebApiClient } from './api-client.js';
import { WebNonvisualComponent, type WebNonvisualComponentOptions } from './component.js';
import { generateReportPdf, type ReportDataSnapshot } from './report-pdf.js';
import {
  createDefaultReportTemplate,
  parseReportTemplate,
  serializeReportTemplate,
  validateReportParameterValue,
  type WebReportParameterValue,
  type WebReportElement,
  type WebReportTemplate,
} from './report-template.js';

export type WebReportPreviewMode = 'modal' | 'new-tab' | 'download';
export interface WebReportBuilderConfiguration extends WebNonvisualComponentOptions {
  readonly reportTemplate?: WebReportTemplate;
  readonly template?: WebReportTemplate;
  readonly previewMode?: WebReportPreviewMode;
  readonly fileName?: string;
}
export interface WebReportGenerationOptions {
  readonly parameters?: Readonly<Record<string, WebReportParameterValue>>;
  readonly previewMode?: WebReportPreviewMode;
  readonly fileName?: string;
  readonly signal?: AbortSignal;
}
export interface WebReportResult {
  readonly blob: Blob;
  readonly pageCount: number;
  readonly fileName: string;
}
export type WebReportEventHandler<TSender, TDetail> = (
  sender: TSender,
  event: CustomEvent<TDetail>,
) => void | Promise<void>;
export type WebReportParameterValues = Record<string, WebReportParameterValue>;

/** Typed parameter overrides are independent of the immutable template defaults. */
export class WebReportParameters<
  TValues extends WebReportParameterValues = WebReportParameterValues,
> {
  readonly #overrides = new Map<string, WebReportParameterValue>();
  public constructor(readonly template: () => WebReportTemplate) {}
  public Set<K extends keyof TValues & string>(name: K, value: TValues[K]): void {
    this.SetValue(name, value);
  }
  /** Dynamic names for externally loaded templates; values still follow their declared types. */
  public SetValue(name: string, value: WebReportParameterValue): void {
    const parameter = this.template().parameters.find((item) => item.name === name);
    if (!parameter) throw new TypeError(`Unknown report parameter "${name}".`);
    this.#overrides.set(name, validateReportParameterValue(parameter, value));
  }
  public Get<K extends keyof TValues & string>(name: K): TValues[K] {
    return this.GetValue(name) as TValues[K];
  }
  public GetValue(name: string): WebReportParameterValue {
    const parameter = this.template().parameters.find((item) => item.name === name);
    if (!parameter) throw new TypeError(`Unknown report parameter "${name}".`);
    return this.#overrides.has(name) ? this.#overrides.get(name)! : parameter.defaultValue;
  }
  public Clear(name?: keyof TValues & string): void {
    if (name === undefined) this.#overrides.clear();
    else this.#overrides.delete(name);
  }
  public get values(): Readonly<TValues> {
    const values = Object.create(null) as WebReportParameterValues;
    for (const parameter of this.template().parameters)
      values[parameter.name] = this.#overrides.has(parameter.name)
        ? this.#overrides.get(parameter.name)!
        : parameter.defaultValue;
    return Object.freeze(values) as Readonly<TValues>;
  }
  /** Retains only overrides whose names and declared types survive a template replacement. */
  public reconcile(previous: WebReportTemplate, next: WebReportTemplate): void {
    for (const name of this.#overrides.keys()) {
      const before = previous.parameters.find((parameter) => parameter.name === name);
      const after = next.parameters.find((parameter) => parameter.name === name);
      if (!before || !after || before.type !== after.type) this.#overrides.delete(name);
    }
  }
}
function previewMode(value: WebReportPreviewMode): WebReportPreviewMode {
  if (value !== 'modal' && value !== 'new-tab' && value !== 'download')
    throw new TypeError('Report previewMode must be modal, new-tab or download.');
  return value;
}
function fileName(value: string): string {
  const printable = Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');
  const safe = printable
    .trim()
    .replace(/[<>:"/\\|?*]/gu, '_')
    .replace(/[. ]+$/gu, '');
  return (safe || 'report').replace(/\.pdf$/iu, '') + '.pdf';
}
function combineSignals(
  first: AbortSignal,
  second?: AbortSignal,
): { readonly signal: AbortSignal; readonly dispose: () => void } {
  const controller = new AbortController();
  const abortFirst = (): void => controller.abort(first.reason);
  const abortSecond = (): void => controller.abort(second?.reason);
  if (first.aborted) abortFirst();
  else first.addEventListener('abort', abortFirst, { once: true });
  if (second?.aborted) abortSecond();
  else second?.addEventListener('abort', abortSecond, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      first.removeEventListener('abort', abortFirst);
      second?.removeEventListener('abort', abortSecond);
    },
  };
}

/** Nonvisual browser report service. It reads loaded ApiClient state and never executes requests. */
export class WebReportBuilder<
  TParameters extends WebReportParameterValues = WebReportParameterValues,
> extends WebNonvisualComponent {
  #template: WebReportTemplate;
  #previewMode: WebReportPreviewMode = 'modal';
  #fileName = 'report.pdf';
  #disposed = false;
  #busy = false;
  #loadVersion = 0;
  readonly #lifetime = new AbortController();
  readonly #clients = new Map<string, WebApiClient>();
  readonly #urls = new Set<string>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  #closeModal: (() => void) | null = null;
  #modalUrl: string | null = null;
  #onGenerate: WebReportEventHandler<this, WebReportGenerationOptions> | null = null;
  #onSuccess: WebReportEventHandler<this, WebReportResult> | null = null;
  #onError: WebReportEventHandler<this, Error> | null = null;
  public readonly Parameters: WebReportParameters<TParameters>;

  public constructor(configuration: WebReportBuilderConfiguration = {}) {
    super(configuration);
    this.#template = parseReportTemplate(
      configuration.reportTemplate ?? configuration.template ?? createDefaultReportTemplate(),
    );
    this.Parameters = new WebReportParameters(() => this.#template);
    this.previewMode = configuration.previewMode ?? 'modal';
    this.fileName = configuration.fileName ?? 'report.pdf';
  }
  public get template(): WebReportTemplate {
    return parseReportTemplate(this.#template);
  }
  public set template(value: WebReportTemplate) {
    this.#assertActive();
    const next = parseReportTemplate(value);
    this.Parameters.reconcile(this.#template, next);
    this.#template = next;
    this.#loadVersion++;
  }
  public get reportTemplate(): WebReportTemplate {
    return this.template;
  }
  public set reportTemplate(value: WebReportTemplate) {
    this.template = value;
  }
  public get previewMode(): WebReportPreviewMode {
    return this.#previewMode;
  }
  public set previewMode(value: WebReportPreviewMode) {
    this.#previewMode = previewMode(value);
  }
  public get fileName(): string {
    return this.#fileName;
  }
  public set fileName(value: string) {
    this.#fileName = fileName(value);
  }
  public get busy(): boolean {
    return this.#busy;
  }
  public get OnGenerate(): WebReportEventHandler<this, WebReportGenerationOptions> | null {
    return this.#onGenerate;
  }
  public set OnGenerate(value: WebReportEventHandler<this, WebReportGenerationOptions> | null) {
    this.#onGenerate = value;
    this.bindEvent(
      'OnGenerate',
      value
        ? (sender, event) => value(sender, event as CustomEvent<WebReportGenerationOptions>)
        : null,
    );
  }
  public get OnSuccess(): WebReportEventHandler<this, WebReportResult> | null {
    return this.#onSuccess;
  }
  public set OnSuccess(value: WebReportEventHandler<this, WebReportResult> | null) {
    this.#onSuccess = value;
    this.bindEvent(
      'OnSuccess',
      value ? (sender, event) => value(sender, event as CustomEvent<WebReportResult>) : null,
    );
  }
  public get OnError(): WebReportEventHandler<this, Error> | null {
    return this.#onError;
  }
  public set OnError(value: WebReportEventHandler<this, Error> | null) {
    this.#onError = value;
    this.bindEvent(
      'OnError',
      value ? (sender, event) => value(sender, event as CustomEvent<Error>) : null,
    );
  }

  /** Generated code binds each component by stable model ID and by its authored name. */
  public bindApiClient(key: string, client: WebApiClient): void {
    this.#assertActive();
    this.#clients.set(key, client);
  }
  public SaveTemplate(): string {
    this.#assertActive();
    return serializeReportTemplate(this.#template);
  }
  public async LoadTemplate(value: WebReportTemplate | string | Blob): Promise<void> {
    this.#assertActive();
    const version = ++this.#loadVersion;
    let source: unknown = value;
    if (value instanceof Blob) {
      if (value.size > 5 * 1024 * 1024)
        throw new RangeError('Report templates must be smaller than 5 MiB.');
      source = await value.text();
    } else if (
      typeof value === 'string' &&
      !value.trimStart().startsWith('{') &&
      !value.trimStart().startsWith('[')
    ) {
      if (!value.trim()) throw new TypeError('Provide a report template URL or JSON document.');
      const url = new URL(value, globalThis.location?.href ?? 'https://localhost/');
      if (!['https:', 'http:', 'blob:'].includes(url.protocol))
        throw new TypeError('Report template URLs must use HTTP, HTTPS or blob.');
      const response = await fetch(url.href, { signal: this.#lifetime.signal });
      if (!response.ok)
        throw new Error(`Could not load report template (${String(response.status)}).`);
      source = await response.text();
    }
    if (typeof source === 'string' && source.length > 5 * 1024 * 1024)
      throw new RangeError('Report templates must be smaller than 5 MiB.');
    const next = parseReportTemplate(source);
    this.#assertActive();
    if (version !== this.#loadVersion)
      throw new DOMException('A newer template load replaced this operation.', 'AbortError');
    this.Parameters.reconcile(this.#template, next);
    this.#template = next;
  }
  public GeneratePDF(options: WebReportGenerationOptions = {}): Promise<WebReportResult> {
    return this.#generate(options, false);
  }
  public Generate(options: WebReportGenerationOptions = {}): Promise<WebReportResult> {
    return this.#generate(options, true);
  }
  public ClosePreview(): void {
    this.#closeModal?.();
  }
  public override dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifetime.abort(new DOMException('ReportBuilder was disposed.', 'AbortError'));
    this.ClosePreview();
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
    this.#clients.clear();
    super.dispose();
  }
  #assertActive(): void {
    if (this.#disposed) throw new Error('ReportBuilder has been disposed.');
  }
  #snapshot(options: WebReportGenerationOptions): ReportDataSnapshot {
    const parameters: WebReportParameterValues = { ...this.Parameters.values };
    for (const [name, value] of Object.entries(options.parameters ?? {})) {
      const parameter = this.#template.parameters.find((item) => item.name === name);
      if (!parameter) throw new TypeError(`Unknown report parameter "${name}".`);
      parameters[name] = validateReportParameterValue(parameter, value);
    }
    const snapshots = new Map<string, unknown>();
    const required = new Map<string, Set<string>>();
    const requireOperation = (apiClientId: string, operationId: string): void => {
      let operations = required.get(apiClientId);
      if (!operations) {
        operations = new Set();
        required.set(apiClientId, operations);
      }
      operations.add(operationId);
    };
    const visit = (element: WebReportElement): void => {
      if (element.type === 'group') {
        for (const child of element.children) visit(child);
      } else if (element.type === 'repeater') {
        if (element.source.scope !== 'row')
          requireOperation(element.source.apiClientId, element.source.operationId);
        for (const child of [
          ...(element.header?.elements ?? []),
          ...element.children,
          ...(element.footer?.elements ?? []),
        ])
          visit(child);
      } else if ('value' in element && element.value.kind === 'field') {
        requireOperation(element.value.apiClientId, element.value.operationId);
      }
    };
    for (const band of this.#template.bands) for (const element of band.elements) visit(element);
    for (const [key, client] of this.#clients) {
      const operations = required.get(key);
      if (!operations) continue;
      for (const operation of client.operations) {
        if (!operations.has(operation.id) && !operations.has(operation.name)) continue;
        const state = client.getOperationState(operation.name);
        if (state.status !== 'success') continue;
        const data: unknown = structuredClone(state.data);
        snapshots.set(JSON.stringify([key, operation.id]), data);
        snapshots.set(JSON.stringify([key, operation.name]), data);
      }
    }
    return {
      parameters,
      operation: (client, operation) => {
        const key = JSON.stringify([client, operation]);
        if (!snapshots.has(key))
          throw new Error(
            `ApiClient "${client}" operation "${operation}" has no successfully loaded response. Load it before generating the report.`,
          );
        return snapshots.get(key);
      },
    };
  }
  async #generate(options: WebReportGenerationOptions, present: boolean): Promise<WebReportResult> {
    let popup: Window | null = null;
    let reservationUrl: string | null = null;
    let signals: ReturnType<typeof combineSignals> | undefined;
    try {
      this.#assertActive();
      if (this.#busy) throw new Error('ReportBuilder is already generating a report.');
      const mode = previewMode(options.previewMode ?? this.previewMode);
      options.signal?.throwIfAborted();
      if (present && mode === 'new-tab') {
        reservationUrl = URL.createObjectURL(
          new Blob(
            [
              '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Preparando relatório</title><body><p>Preparando relatório…</p></body></html>',
            ],
            { type: 'text/html' },
          ),
        );
        this.#urls.add(reservationUrl);
        popup = window.open(reservationUrl, 'webrad-report');
        if (!popup)
          throw new Error(
            'The browser blocked the report tab. Generate it from a click or choose modal preview.',
          );
      }
      this.#busy = true;
      signals = combineSignals(this.#lifetime.signal, options.signal);
      if (!this.emit('OnGenerate', options))
        throw new DOMException('Report generation was cancelled.', 'AbortError');
      const template = this.#template;
      const data = this.#snapshot(options);
      const output = await generateReportPdf(template, data, signals.signal);
      const result: WebReportResult = {
        ...output,
        fileName: fileName(options.fileName ?? this.fileName),
      };
      signals.signal.throwIfAborted();
      if (present) {
        const url = URL.createObjectURL(result.blob);
        this.#urls.add(url);
        if (mode === 'modal') this.#showModal(url, result);
        else if (mode === 'new-tab') {
          if (!popup || popup.closed) {
            this.#revoke(url);
            throw new Error('The report tab was closed before generation completed.');
          }
          popup.location.replace(url);
          // A sandboxed Preview can navigate its own popup only while the
          // opener relationship exists. Disown it after requesting the PDF.
          popup.opener = null;
          this.#revokeLater(url, 10 * 60_000);
          popup = null;
        } else {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = result.fileName;
          anchor.hidden = true;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          this.#revokeLater(url, 60_000);
        }
      }
      this.emit('OnSuccess', result);
      return result;
    } catch (error) {
      popup?.close();
      const failure =
        error instanceof Error || error instanceof DOMException ? error : new Error(String(error));
      if (!this.#disposed) this.emit('OnError', failure);
      throw failure;
    } finally {
      if (reservationUrl) this.#revoke(reservationUrl);
      if (signals) {
        signals.dispose();
        this.#busy = false;
      }
    }
  }
  #revoke(url: string): void {
    if (this.#urls.delete(url)) URL.revokeObjectURL(url);
  }
  #revokeLater(url: string, milliseconds: number): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      this.#revoke(url);
    }, milliseconds);
    this.#timers.add(timer);
  }
  #showModal(url: string, result: WebReportResult): void {
    this.ClosePreview();
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.createElement('dialog');
    dialog.dataset.reportPreview = this.id;
    dialog.setAttribute('aria-label', this.#template.name);
    dialog.style.cssText =
      'position:fixed;inset:20px;width:calc(100vw - 40px);height:calc(100vh - 40px);max-width:none;max-height:none;padding:0;border:1px solid #334155;border-radius:12px;background:#0f172a;color:#e2e8f0;box-shadow:0 24px 80px #0008;';
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;gap:16px;height:56px;padding:0 18px;font:14px system-ui;border-bottom:1px solid #334155;box-sizing:border-box;';
    const title = document.createElement('strong');
    title.textContent = `${this.#template.name} · ${String(result.pageCount)} ${result.pageCount === 1 ? 'página' : 'páginas'}`;
    title.style.flex = '1';
    const download = document.createElement('a');
    download.href = url;
    download.download = result.fileName;
    download.textContent = 'Baixar PDF';
    download.style.cssText = 'color:#93c5fd;text-decoration:none;padding:8px;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Fechar';
    close.style.cssText =
      'border:1px solid #475569;background:#1e293b;color:inherit;border-radius:6px;padding:7px 12px;cursor:pointer;';
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'PDF do relatório';
    frame.style.cssText =
      'display:block;width:100%;height:calc(100% - 56px);border:0;background:#525659;';
    header.append(title, download, close);
    dialog.append(header, frame);
    this.#modalUrl = url;
    this.#closeModal = () => {
      this.#closeModal = null;
      dialog.remove();
      if (this.#modalUrl) this.#revoke(this.#modalUrl);
      this.#modalUrl = null;
      if (previous?.isConnected) previous.focus();
    };
    close.addEventListener('click', () => this.ClosePreview());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.ClosePreview();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.ClosePreview();
      }
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === download) {
          event.preventDefault();
          close.focus();
        } else if (!event.shiftKey && document.activeElement === close) {
          event.preventDefault();
          download.focus();
        }
      }
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    close.focus();
  }
}
