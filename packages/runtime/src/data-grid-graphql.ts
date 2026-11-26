import type {
  WebGraphQLPage,
  WebGraphQLParameter,
  WebGraphQLRow,
  WebGraphQLRuntimeOperation,
  WebGraphQLSource,
  WebGraphQLValue,
} from './graphql.js';

export interface WebDataGridGraphQLConfiguration {
  readonly pageSize: number;
  readonly showPager: boolean;
  readonly crudEnabled: boolean;
  readonly insertOperationId: string | null;
  readonly updateOperationId: string | null;
  readonly deleteOperationId: string | null;
}

interface DataGridGraphQLSourceConfiguration extends WebDataGridGraphQLConfiguration {
  readonly apiClientId: string | null;
  readonly operationId: string | null;
}

export type WebDataGridMutationValues = Readonly<Record<string, WebGraphQLValue>>;
export type WebDataGridMutationKind = 'insert' | 'update' | 'delete';

export interface WebDataGridPendingChange {
  readonly id: number;
  readonly kind: WebDataGridMutationKind;
  readonly operationId: string;
  readonly row: WebGraphQLRow | null;
  readonly values: WebDataGridMutationValues;
  readonly outcome: 'pending' | 'uncertain';
}

export interface WebDataGridChangesEventDetail {
  readonly pendingChanges: readonly WebDataGridPendingChange[];
}

export interface WebDataGridSaveChangesEventDetail extends WebDataGridChangesEventDetail {
  readonly applied: number;
}

export interface WebDataGridSaveErrorEventDetail extends WebDataGridSaveChangesEventDetail {
  readonly change: WebDataGridPendingChange;
  readonly error: Error;
}

export type WebDataGridGraphQLEventHandler<TSender, TDetail> = (
  sender: TSender,
  event: CustomEvent<TDetail>,
) => void | Promise<void>;

type GridGraphQLEvents = {
  OnChangesChanged: WebDataGridChangesEventDetail;
  OnSaveChanges: WebDataGridSaveChangesEventDetail;
  OnSaveError: WebDataGridSaveErrorEventDetail;
};

interface PendingChange extends WebDataGridPendingChange {
  readonly overlay: WebGraphQLRow;
  readonly keys: Readonly<Record<string, WebGraphQLValue>>;
}

interface QueryPage {
  readonly result: WebGraphQLPage;
  readonly index: number;
}

type GridPageStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataGridGraphQLRow {
  readonly value: WebGraphQLRow;
  readonly original: WebGraphQLRow | null;
  readonly draft: WebDataGridPendingChange | null;
}

function tokens(path: string): readonly string[] {
  return path.startsWith('/')
    ? path.slice(1).split('/').map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    : [];
}

function fieldValue(row: WebGraphQLRow | null, path: string): WebGraphQLValue | undefined {
  let current: WebGraphQLValue | undefined = row ?? undefined;
  const parts = tokens(path);
  if (parts.length === 0) return undefined;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = (current as WebGraphQLRow)[part];
  }
  return current;
}

function withField(row: WebGraphQLRow, path: readonly string[], value: WebGraphQLValue): WebGraphQLRow {
  const [field, ...rest] = path;
  if (field === undefined) return row;
  if (rest.length === 0) return { ...row, [field]: value };
  const nested = row[field];
  if (typeof nested !== 'object' || nested === null || Array.isArray(nested)) return row;
  return { ...row, [field]: withField(nested as WebGraphQLRow, rest, value) };
}

function isRowKey(value: WebGraphQLValue | undefined): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number';
}

function matchesRow(change: PendingChange, row: WebGraphQLRow): boolean {
  const keys = Object.entries(change.keys);
  return keys.length > 0 && keys.every(([path, value]) => value === fieldValue(row, path));
}

function errorFrom(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

function publicChange(change: PendingChange): WebDataGridPendingChange {
  return structuredClone({
    id: change.id,
    kind: change.kind,
    operationId: change.operationId,
    row: change.row,
    values: change.values,
    outcome: change.outcome,
  });
}

function rowKeys(operation: WebGraphQLRuntimeOperation, row: WebGraphQLRow): WebDataGridMutationValues {
  return Object.fromEntries(operation.parameters.flatMap((parameter) => {
    if (parameter.source.role !== 'filter' || parameter.source.identityEligible !== true) return [];
    const value = fieldValue(row, parameter.source.fieldPath);
    return isRowKey(value) ? [[parameter.source.fieldPath, value]] : [];
  }));
}

export class DataGridGraphQL {
  #configuration: DataGridGraphQLSourceConfiguration | undefined;
  #source: WebGraphQLSource | null = null;
  #variables: WebDataGridMutationValues | undefined;
  #unsubscribe: (() => void) | undefined;
  #query: AbortController | undefined;
  #page: QueryPage | undefined;
  #after: (string | null)[] = [null];
  #pageSize = 20;
  #requestedPage = 0;
  #status: GridPageStatus = 'idle';
  #queryError: Error | undefined;
  #saveError: Error | undefined;
  #changes: PendingChange[] = [];
  #lastChangeId = 0;
  #save: Promise<void> | null = null;
  #generation = 0;
  #disposed = false;

  public constructor(
    private readonly render: () => void,
    private readonly emit: <T extends keyof GridGraphQLEvents>(name: T, detail: GridGraphQLEvents[T]) => void,
  ) {}

  public get enabled(): boolean {
    return this.#configuration !== undefined;
  }

  public get showPager(): boolean {
    return this.#configuration?.showPager === true && this.#queryOperation()?.pagination !== undefined;
  }

  public get generation(): number { return this.#generation; }
  public get authenticated(): boolean { return this.#source?.authenticated === true; }
  public get pageNumber(): number { return (this.#page?.index ?? 0) + 1; }
  public get pageSize(): number { return this.#pageSize; }
  public get defaultPageSize(): number { return this.#initialPageSize(); }
  public get totalCount(): number | null { return this.#page?.result.totalCount ?? null; }
  public get maxPageSize(): number { return this.#queryOperation()?.pagination?.maxSize ?? this.#pageSize; }
  public get loading(): boolean { return this.#status === 'loading'; }
  public get saving(): boolean { return this.#save !== null; }
  public get hasChanges(): boolean { return this.#changes.length > 0; }
  public get queryError(): Error | undefined { return this.#queryError; }
  public get saveError(): Error | undefined { return this.#saveError; }

  public get canGoBack(): boolean {
    return !this.loading && this.#page !== undefined && this.#page.index > 0;
  }

  public get canGoForward(): boolean {
    const info = this.#page?.result.pageInfo;
    return !this.loading && info?.hasNextPage === true && info.endCursor !== null;
  }

  public get pendingChanges(): readonly WebDataGridPendingChange[] {
    return this.#changes.map(publicChange);
  }

  public get rows(): readonly DataGridGraphQLRow[] {
    return [
      ...this.#changes.filter((draft) => draft.kind === 'insert').map((draft) => ({
        value: draft.overlay,
        original: null,
        draft,
      })),
      ...(this.#page?.result.rows ?? []).map((original) => {
        const draft = this.#changes.find((change) => matchesRow(change, original)) ?? null;
        return { value: draft?.overlay ?? original, original, draft };
      }),
    ];
  }

  public configure(configuration: DataGridGraphQLSourceConfiguration | undefined): void {
    if (JSON.stringify(configuration) === JSON.stringify(this.#configuration)) return;
    const previous = this.#configuration;
    this.#configuration = configuration;
    if (previous?.apiClientId !== configuration?.apiClientId ||
        previous?.operationId !== configuration?.operationId ||
        previous?.insertOperationId !== configuration?.insertOperationId ||
        previous?.updateOperationId !== configuration?.updateOperationId ||
        previous?.deleteOperationId !== configuration?.deleteOperationId ||
        previous?.crudEnabled !== configuration?.crudEnabled) {
      this.#resetChanges();
      this.#attach();
      return;
    }
    if (previous?.pageSize !== configuration?.pageSize) {
      this.#pageSize = this.#initialPageSize();
      void this.refresh();
    }
  }

  public bind(source: WebGraphQLSource | null): void {
    if (source === this.#source) return;
    this.#source = source;
    this.#resetChanges();
    this.#attach();
  }

  #resetChanges(): void {
    this.#generation += 1;
    this.#changes = [];
    this.#saveError = undefined;
  }

  #attach(): void {
    this.#unsubscribe?.();
    this.#variables = undefined;
    const source = this.#source;
    const operation = this.#queryOperation();
    this.#unsubscribe = operation === undefined ? undefined : source?.subscribe((change) => {
      if (change.operationId !== operation.id) return;
      if (change.kind === 'session') this.#resetChanges();
      if (change.kind === 'parameters' || change.kind === 'session') {
        this.#variables = undefined;
        void this.refresh();
      }
    });
    this.#pageSize = this.#initialPageSize();
    const generation = this.#generation;
    this.#resetPage();
    queueMicrotask(() => {
      if (generation === this.#generation && this.#status === 'idle') void this.#load(0);
    });
  }

  #queryOperation(): WebGraphQLRuntimeOperation | undefined {
    const operationId = this.#configuration?.operationId;
    if (!operationId) return undefined;
    const operation = this.#source?.getOperation(operationId);
    return operation?.kind === 'query' ? operation : undefined;
  }

  #initialPageSize(): number {
    const pagination = this.#queryOperation()?.pagination;
    return Math.min(this.#configuration?.pageSize ?? 20, pagination?.maxSize ?? 1_000);
  }

  #resetPage(): void {
    this.#query?.abort();
    this.#query = undefined;
    this.#page = undefined;
    this.#after = [null];
    this.#status = 'idle';
    this.#queryError = undefined;
  }

  public refresh(variables?: WebDataGridMutationValues): Promise<void> {
    if (this.#queryOperation() === undefined) return Promise.resolve();
    if (variables !== undefined) this.#variables = structuredClone(variables);
    this.#resetPage();
    return this.#load(0);
  }

  public setPageSize(size: number): Promise<void> {
    if (!Number.isInteger(size) || size < 1 || size > this.maxPageSize || size === this.#pageSize) {
      return Promise.resolve();
    }
    this.#pageSize = size;
    return this.refresh();
  }

  public nextPage(): Promise<void> {
    if (!this.canGoForward || this.#page === undefined) return Promise.resolve();
    const next = this.#page.index + 1;
    this.#after[next] = this.#page.result.pageInfo.endCursor;
    this.#after.length = next + 1;
    return this.#load(next);
  }

  public previousPage(): Promise<void> {
    if (!this.canGoBack || this.#page === undefined) return Promise.resolve();
    return this.#load(this.#page.index - 1);
  }

  public retryPage(): Promise<void> {
    return this.#load(this.#requestedPage);
  }

  #load(index: number): Promise<void> {
    const source = this.#source;
    const operation = this.#queryOperation();
    if (source === null || operation === undefined || !source.authenticated || this.#disposed) {
      if (!this.#disposed) this.render();
      return Promise.resolve();
    }
    this.#query?.abort();
    const request = new AbortController();
    this.#query = request;
    this.#requestedPage = index;
    this.#status = 'loading';
    this.#queryError = undefined;
    const pagination = operation.pagination === undefined ? {} : {
      first: this.#pageSize,
      after: this.#after[index] ?? null,
    };
    const variables = this.#variables;
    const read = Promise.resolve().then(() => source.executePageById(operation.id, {
      ...pagination,
      ...(variables === undefined ? {} : { variables }),
      publish: false,
      signal: request.signal,
    })).then((result) => {
      if (request.signal.aborted) return;
      this.#page = { index, result };
      this.#status = 'ready';
    }, (reason: unknown) => {
      if (request.signal.aborted) return;
      this.#queryError = errorFrom(reason);
      this.#status = 'error';
    }).finally(() => {
      if (this.#query !== request) return;
      this.#query = undefined;
      this.render();
    });
    this.render();
    return read;
  }

  public mutation(kind: WebDataGridMutationKind, row: WebGraphQLRow | null = null): WebGraphQLRuntimeOperation | undefined {
    const configuration = this.#configuration;
    if (configuration?.crudEnabled !== true || this.#source?.authenticated !== true) return undefined;
    const query = this.#queryOperation();
    const id = configuration[`${kind}OperationId`];
    const operation = id === null ? undefined : this.#source.getOperation(id);
    if (query === undefined || operation?.kind !== kind || operation.database !== query.database || operation.table !== query.table) {
      return undefined;
    }
    if (kind !== 'delete' && !operation.parameters.some((parameter) => parameter.source.role === 'input')) {
      return undefined;
    }
    if (kind !== 'insert' && (row === null || Object.keys(rowKeys(operation, row)).length === 0)) {
      return undefined;
    }
    return operation;
  }

  public inputValue(
    operation: WebGraphQLRuntimeOperation,
    parameter: WebGraphQLParameter,
    row: WebGraphQLRow | null,
    draft: WebDataGridPendingChange | null,
  ): WebGraphQLValue | undefined {
    if (draft !== null && Object.hasOwn(draft.values, parameter.name)) return draft.values[parameter.name];
    const value = fieldValue(row, parameter.source.fieldPath);
    if (value !== undefined) return value;
    return this.#source?.getVariables(operation.id)[parameter.name];
  }

  public get hasRowActions(): boolean {
    return this.#configuration?.crudEnabled === true &&
      (this.#configuration.updateOperationId !== null || this.#configuration.deleteOperationId !== null ||
        this.#configuration.insertOperationId !== null);
  }

  public stage(
    kind: WebDataGridMutationKind,
    row: WebGraphQLRow | null,
    input: WebDataGridMutationValues,
    previousId?: number,
  ): void {
    if (this.saving) throw new Error('Wait until the current save finishes.');
    const operation = this.mutation(kind, row);
    if (operation === undefined) throw new Error(`Configure a valid GraphQL ${kind} operation for this row.`);
    const inputNames = new Set(operation.parameters.filter((parameter) => parameter.source.role === 'input').map((parameter) => parameter.name));
    for (const name of Object.keys(input)) {
      if (!inputNames.has(name)) throw new Error(`Unknown input parameter "${name}".`);
    }
    const values = Object.create(null) as Record<string, WebGraphQLValue>;
    const base = this.#source?.getVariables(operation.id) ?? {};
    const previous = previousId === undefined
      ? this.#changes.find((draft) => row !== null && matchesRow(draft, row))
      : this.#changes.find((draft) => draft.id === previousId);
    if (previous?.outcome === 'uncertain') throw new Error('Review the uncertain save before editing this row.');
    let overlay: WebGraphQLRow = row ?? {};
    for (const parameter of operation.parameters) {
      let value = base[parameter.name];
      if (parameter.source.role === 'filter' && row !== null) {
        const fromRow = fieldValue(row, parameter.source.fieldPath);
        if (fromRow !== undefined) value = fromRow;
      } else if (parameter.source.role === 'input') {
        if (previous?.operationId === operation.id && Object.hasOwn(previous.values, parameter.name)) {
          value = previous.values[parameter.name];
        } else if (kind === 'update') {
          value = parameter.required ? fieldValue(row, parameter.source.fieldPath) ?? value : undefined;
        }
        if (Object.hasOwn(input, parameter.name)) value = input[parameter.name];
      }
      if (parameter.required && (value === undefined || value === null)) {
        throw new Error(`${parameter.name} is required.`);
      }
      if (value === undefined) continue;
      values[parameter.name] = value;
      if (parameter.source.role === 'input') {
        overlay = withField(overlay, tokens(parameter.source.fieldPath), value);
      }
    }
    if (kind === 'update' && !operation.parameters.some((parameter) =>
      parameter.source.role === 'input' && Object.hasOwn(values, parameter.name))) return;
    const keys = row === null ? {} : rowKeys(operation, row);
    const change: PendingChange = structuredClone({
      id: previous?.id ?? ++this.#lastChangeId,
      kind,
      operationId: operation.id,
      row,
      values,
      keys,
      overlay,
      outcome: 'pending',
    });
    this.#changes = previous === undefined
      ? [...this.#changes, change]
      : this.#changes.map((candidate) => candidate.id === change.id ? change : candidate);
    this.#changed();
  }

  public cancelChanges(id?: number): void {
    if (this.saving) throw new Error('Wait until the current save finishes.');
    const previousLength = this.#changes.length;
    this.#changes = id === undefined ? [] : this.#changes.filter((change) => change.id !== id);
    if (this.#changes.length !== previousLength) this.#changed();
  }

  #changed(): void {
    this.#saveError = undefined;
    this.render();
    this.emit('OnChangesChanged', { pendingChanges: this.pendingChanges });
  }

  public saveChanges(): Promise<void> {
    if (this.#save !== null) return this.#save;
    const source = this.#source;
    if (source === null || this.#changes.length === 0) return Promise.resolve();
    const generation = this.#generation;
    const changes = this.#changes;
    this.#saveError = undefined;
    this.#save = Promise.resolve().then(() => this.#applyChanges(source, generation, changes));
    this.render();
    return this.#save;
  }

  async #applyChanges(source: WebGraphQLSource, generation: number, changes: readonly PendingChange[]): Promise<void> {
    let applied = 0;
    let failure: { change: PendingChange; error: Error } | undefined;
    try {
      for (const change of changes) {
        if (generation !== this.#generation) return;
        let unexpectedCount = false;
        try {
          if (change.outcome === 'uncertain') throw new Error('Review the uncertain save before retrying.');
          const result = await source.executeMutationById(change.operationId, change.values, {
            mergeVariables: false,
          });
          if (generation !== this.#generation) return;
          if (result.affectedCount !== 1) {
            unexpectedCount = result.affectedCount !== 0;
            throw new Error('Expected one affected record. Refresh the grid and review the pending change.');
          }
          this.#changes = this.#changes.filter((candidate) => candidate.id !== change.id);
          applied += 1;
        } catch (reason) {
          if (generation !== this.#generation) return;
          const error = errorFrom(reason);
          const uncertain = unexpectedCount || ('outcome' in error && error.outcome === 'unknown');
          const failed: PendingChange = uncertain ? { ...change, outcome: 'uncertain' } : change;
          this.#changes = this.#changes.map((candidate) => candidate.id === failed.id ? failed : candidate);
          failure = { change: failed, error };
          break;
        }
      }
    } finally {
      this.#save = null;
      if (generation !== this.#generation && !this.#disposed) this.render();
    }
    if (generation !== this.#generation) return;
    this.#saveError = failure?.error;
    if (applied > 0) void this.refresh();
    this.render();
    const detail = { applied, pendingChanges: this.pendingChanges };
    if (failure !== undefined) {
      this.emit('OnSaveError', { ...detail, change: publicChange(failure.change), error: failure.error });
      throw failure.error;
    }
    this.emit('OnSaveChanges', detail);
  }

  public dispose(): void {
    this.#disposed = true;
    this.#generation += 1;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#resetPage();
  }

  public showDraftError(reason: unknown): void {
    this.#saveError = errorFrom(reason);
    this.render();
  }
}
