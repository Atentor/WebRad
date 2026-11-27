import type {
  WebGraphQLPage,
  WebGraphQLParameter,
  WebGraphQLParameters,
  WebGraphQLRow,
  WebGraphQLRuntimeOperation,
  WebGraphQLSource,
  WebGraphQLValue,
} from './graphql.js';

export interface WebDataGridGraphQLConfiguration {
  readonly clientId: string | null;
  readonly pageSize: number;
  readonly showPager: boolean;
  readonly crudEnabled: boolean;
  readonly autoSave?: boolean;
  readonly insertOperationId: string | null;
  readonly updateOperationId: string | null;
  readonly deleteOperationId: string | null;
}

interface DataGridGraphQLSourceConfiguration extends WebDataGridGraphQLConfiguration {
  readonly sourceId: string | null;
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

interface DraftKeyGroup {
  readonly paths: readonly string[];
  readonly changes: Map<string, PendingChange>;
}

interface GridMutation {
  readonly operation: WebGraphQLRuntimeOperation;
  readonly keyPaths: readonly string[];
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
    ? path
        .slice(1)
        .split('/')
        .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
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

function withField(
  row: WebGraphQLRow,
  path: readonly string[],
  value: WebGraphQLValue,
): WebGraphQLRow {
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

function keySignature(
  paths: readonly string[],
  read: (path: string) => WebGraphQLValue | undefined,
): string | undefined {
  const values: (string | boolean | [string])[] = [];
  for (const path of paths) {
    const value = read(path);
    if (!isRowKey(value) || (typeof value === 'number' && Number.isNaN(value))) return undefined;
    values.push(typeof value === 'number' ? [String(value)] : value);
  }
  return JSON.stringify(values);
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

function rowKeys(paths: readonly string[], row: WebGraphQLRow): WebDataGridMutationValues {
  return Object.fromEntries(
    paths.flatMap((path) => {
      const value = fieldValue(row, path);
      return isRowKey(value) ? [[path, value]] : [];
    }),
  );
}

export class DataGridGraphQL {
  #configuration: DataGridGraphQLSourceConfiguration | undefined;
  #source: WebGraphQLSource | null = null;
  #variables: WebGraphQLParameters | undefined;
  #unsubscribe: (() => void) | undefined;
  #query: AbortController | undefined;
  #page: QueryPage | undefined;
  #after: (string | null)[] = [null];
  #hasPageNumbers = true;
  #pageSize = 20;
  #requestedPage = 0;
  #status: GridPageStatus = 'idle';
  #queryError: Error | undefined;
  #saveError: Error | undefined;
  #changes: PendingChange[] = [];
  readonly #mutations = new Map<WebDataGridMutationKind, GridMutation>();
  #lastChangeId = 0;
  #save: Promise<void> | null = null;
  #generation = 0;
  #disposed = false;

  public constructor(
    private readonly render: () => void,
    private readonly emit: <T extends keyof GridGraphQLEvents>(
      name: T,
      detail: GridGraphQLEvents[T],
    ) => void,
  ) {}

  public get enabled(): boolean {
    return this.#configuration !== undefined;
  }

  public get showPager(): boolean {
    return (
      this.#configuration?.showPager === true && this.#queryOperation()?.pagination !== undefined
    );
  }

  public get generation(): number {
    return this.#generation;
  }
  public get authenticated(): boolean {
    return this.#source?.authenticated === true;
  }
  public get pageNumber(): number | null {
    const index = this.#page?.index ?? 0;
    return index === 0 || this.#hasPageNumbers ? index + 1 : null;
  }
  public get pageSize(): number {
    return this.#pageSize;
  }
  public get defaultPageSize(): number {
    return this.#initialPageSize();
  }
  public get totalCount(): number | null {
    return this.#page?.result.totalCount ?? null;
  }
  public get maxPageSize(): number {
    return this.#queryOperation()?.pagination?.maxSize ?? this.#pageSize;
  }
  public get loading(): boolean {
    return this.#status === 'loading';
  }
  public get saving(): boolean {
    return this.#save !== null;
  }
  public get autoSave(): boolean {
    return this.#configuration?.crudEnabled === true && this.#configuration?.autoSave === true;
  }
  public get hasChanges(): boolean {
    return this.#changes.length > 0;
  }
  public get hasUncertainChanges(): boolean {
    return this.#changes.some((change) => change.outcome === 'uncertain');
  }
  public get queryError(): Error | undefined {
    return this.#queryError;
  }
  public get saveError(): Error | undefined {
    return this.#saveError;
  }

  public get canGoBack(): boolean {
    return (
      !this.loading &&
      this.#queryError === undefined &&
      this.#page !== undefined &&
      this.#page.index > 0
    );
  }

  public get canGoForward(): boolean {
    const info = this.#page?.result.pageInfo;
    return (
      !this.loading &&
      this.#queryError === undefined &&
      info?.hasNextPage === true &&
      info.endCursor !== null
    );
  }

  public get pendingChanges(): readonly WebDataGridPendingChange[] {
    return this.#changes.map(publicChange);
  }

  public get rows(): readonly DataGridGraphQLRow[] {
    const rows: DataGridGraphQLRow[] = [];
    const groups = new Map<string, DraftKeyGroup>();
    for (const draft of this.#changes) {
      if (draft.kind === 'insert') rows.push({ value: draft.overlay, original: null, draft });
      const paths = Object.keys(draft.keys).sort();
      if (paths.length === 0) continue;
      const signature = keySignature(paths, (path) => draft.keys[path]);
      if (signature === undefined) continue;
      const groupKey = JSON.stringify(paths);
      const group = groups.get(groupKey) ?? { paths, changes: new Map<string, PendingChange>() };
      if (!group.changes.has(signature)) group.changes.set(signature, draft);
      groups.set(groupKey, group);
    }
    for (const original of this.#page?.result.rows ?? []) {
      let draft: PendingChange | null = null;
      const read = (path: string): WebGraphQLValue | undefined => fieldValue(original, path);
      for (const group of groups.values()) {
        const signature = keySignature(group.paths, read);
        const candidate = signature === undefined ? undefined : group.changes.get(signature);
        // Draft IDs retain insertion order when a staged change is edited.
        if (candidate !== undefined && (draft === null || candidate.id < draft.id))
          draft = candidate;
      }
      rows.push({ value: draft?.overlay ?? original, original, draft });
    }
    return rows;
  }

  public configure(configuration: DataGridGraphQLSourceConfiguration | undefined): void {
    if (JSON.stringify(configuration) === JSON.stringify(this.#configuration)) return;
    const previous = this.#configuration;
    this.#configuration = configuration;
    const shouldSave = previous?.autoSave !== true && this.autoSave;
    if (
      previous?.sourceId !== configuration?.sourceId ||
      previous?.operationId !== configuration?.operationId ||
      previous?.insertOperationId !== configuration?.insertOperationId ||
      previous?.updateOperationId !== configuration?.updateOperationId ||
      previous?.deleteOperationId !== configuration?.deleteOperationId ||
      previous?.crudEnabled !== configuration?.crudEnabled
    ) {
      this.#resetChanges();
      this.#attach();
      return;
    }
    if (previous?.pageSize !== configuration?.pageSize) {
      this.#pageSize = this.#initialPageSize();
      void this.#refresh(undefined, false);
    }
    if (shouldSave && this.#changes.length > 0) this.#saveAutomatically();
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
    this.#resolveMutations(operation);
    this.#unsubscribe =
      operation === undefined
        ? undefined
        : source?.subscribe((change) => {
            if (change.operationId !== operation.id) return;
            if (change.kind === 'page') {
              const { result, variables, first, after } = change;
              const normalized = (values: WebGraphQLParameters): WebGraphQLParameters =>
                Object.fromEntries(
                  operation.parameters.map(({ name }) => [
                    name,
                    Object.hasOwn(values, name) ? values[name] : undefined,
                  ]),
                );
              const published = normalized(variables);
              const knownIndex = after === null ? -1 : this.#after.indexOf(after);
              const reuseHistory =
                knownIndex > 0 &&
                first === this.#pageSize &&
                JSON.stringify(published) ===
                  JSON.stringify(
                    normalized({
                      ...source?.getVariables(operation.id),
                      ...this.#variables,
                    }),
                  );
              const history = reuseHistory ? this.#after.slice(0, knownIndex + 1) : [null];
              const hasPageNumbers = after === null || (reuseHistory && this.#hasPageNumbers);
              // Cursor values do not encode a page number. The first page is the fallback
              // predecessor of an external cursor when no matching history exists.
              if (after !== null && !reuseHistory) history.push(after);
              this.#resetPage();
              this.#variables = structuredClone(published);
              if (first !== undefined) this.#pageSize = first;
              const index = history.length - 1;
              this.#after = history;
              this.#hasPageNumbers = hasPageNumbers;
              this.#page = { index, result };
              this.#requestedPage = index;
              this.#status = 'ready';
              this.render();
              return;
            }
            if (change.kind === 'session') {
              this.#resetChanges();
              this.#resetPage();
            }
            if (change.kind === 'parameters' || change.kind === 'session') {
              this.#variables = undefined;
              void this.#refresh(undefined, false);
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
    this.#hasPageNumbers = true;
    this.#status = 'idle';
    this.#queryError = undefined;
  }

  public refresh(variables?: WebDataGridMutationValues): Promise<void> {
    const preserveHistory =
      variables === undefined || JSON.stringify(variables) === JSON.stringify(this.#variables);
    return this.#refresh(variables, preserveHistory);
  }

  #refresh(
    variables: WebDataGridMutationValues | undefined,
    preserveHistory: boolean,
  ): Promise<void> {
    if (this.#queryOperation() === undefined) return Promise.resolve();
    if (variables !== undefined) this.#variables = structuredClone(variables);
    const previousPage = this.#source?.authenticated === true ? this.#page : undefined;
    const previousAfter = preserveHistory ? this.#after : [null];
    const previousHasPageNumbers = preserveHistory ? this.#hasPageNumbers : true;
    this.#resetPage();
    this.#page = previousPage;
    this.#after = previousAfter;
    this.#hasPageNumbers = previousHasPageNumbers;
    return this.#load(0);
  }

  public setPageSize(size: number): Promise<void> {
    if (!Number.isInteger(size) || size < 1 || size > this.maxPageSize || size === this.#pageSize) {
      return Promise.resolve();
    }
    this.#pageSize = size;
    return this.#refresh(undefined, false);
  }

  public nextPage(): Promise<void> {
    if (!this.canGoForward || this.#page === undefined) return Promise.resolve();
    const next = this.#page.index + 1;
    if (this.#page.index === 0) this.#hasPageNumbers = true;
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
    const pagination =
      operation.pagination === undefined
        ? {}
        : {
            first: this.#pageSize,
            after: this.#after[index] ?? null,
          };
    const variables = this.#variables;
    const read = Promise.resolve()
      .then(() =>
        source.executePageById(operation.id, {
          ...pagination,
          ...(variables === undefined ? {} : { variables }),
          publish: false,
          signal: request.signal,
        }),
      )
      .then(
        (result) => {
          if (request.signal.aborted) return;
          this.#page = { index, result };
          this.#status = 'ready';
        },
        (reason: unknown) => {
          if (request.signal.aborted) return;
          this.#queryError = errorFrom(reason);
          this.#status = 'error';
        },
      )
      .finally(() => {
        if (this.#query !== request) return;
        this.#query = undefined;
        this.render();
      });
    this.render();
    return read;
  }

  #resolveMutations(query: WebGraphQLRuntimeOperation | undefined): void {
    this.#mutations.clear();
    const configuration = this.#configuration;
    if (configuration?.crudEnabled !== true || query === undefined) return;
    for (const kind of ['insert', 'update', 'delete'] as const) {
      const id = configuration[`${kind}OperationId`];
      const operation = id === null ? undefined : this.#source?.getOperation(id);
      if (
        operation?.kind !== kind ||
        operation.database !== query.database ||
        operation.table !== query.table
      )
        continue;
      if (kind !== 'delete' && !operation.parameters.some(({ source }) => source.role === 'input'))
        continue;
      const keyPaths = operation.parameters.flatMap(({ source }) =>
        source.role === 'filter' && source.identityEligible === true ? [source.fieldPath] : [],
      );
      this.#mutations.set(kind, { operation, keyPaths });
    }
  }

  public mutation(
    kind: WebDataGridMutationKind,
    row: WebGraphQLRow | null = null,
  ): WebGraphQLRuntimeOperation | undefined {
    if (this.#source?.authenticated !== true) return undefined;
    const definition = this.#mutations.get(kind);
    if (definition === undefined) return undefined;
    if (
      kind !== 'insert' &&
      (row === null || !definition.keyPaths.some((path) => isRowKey(fieldValue(row, path))))
    ) {
      return undefined;
    }
    return definition.operation;
  }

  public inputValue(
    operation: WebGraphQLRuntimeOperation,
    parameter: WebGraphQLParameter,
    row: WebGraphQLRow | null,
    draft: WebDataGridPendingChange | null,
  ): WebGraphQLValue | undefined {
    if (draft !== null && Object.hasOwn(draft.values, parameter.name))
      return draft.values[parameter.name];
    const value = fieldValue(row, parameter.source.fieldPath);
    if (value !== undefined) return value;
    return this.#source?.getVariables(operation.id)[parameter.name];
  }

  public get hasRowActions(): boolean {
    return (
      this.#configuration?.crudEnabled === true &&
      (this.#configuration.updateOperationId !== null ||
        this.#configuration.deleteOperationId !== null ||
        this.#configuration.insertOperationId !== null)
    );
  }

  public stage(
    kind: WebDataGridMutationKind,
    row: WebGraphQLRow | null,
    input: WebDataGridMutationValues,
    previousId?: number,
  ): void {
    if (this.saving) throw new Error('Wait until the current save finishes.');
    const operation = this.mutation(kind, row);
    if (operation === undefined)
      throw new Error(`Configure a valid GraphQL ${kind} operation for this row.`);
    const inputNames = new Set(
      operation.parameters
        .filter((parameter) => parameter.source.role === 'input')
        .map((parameter) => parameter.name),
    );
    for (const name of Object.keys(input)) {
      if (!inputNames.has(name)) throw new Error(`Unknown input parameter "${name}".`);
    }
    const values = Object.create(null) as Record<string, WebGraphQLValue>;
    const base = this.#source?.getVariables(operation.id) ?? {};
    const previous =
      previousId === undefined
        ? this.#changes.find((draft) => row !== null && matchesRow(draft, row))
        : this.#changes.find((draft) => draft.id === previousId);
    if (previous?.outcome === 'uncertain')
      throw new Error('Review the uncertain save before editing this row.');
    let overlay: WebGraphQLRow = row ?? {};
    for (const parameter of operation.parameters) {
      let value = base[parameter.name];
      if (parameter.source.role === 'filter' && row !== null) {
        const fromRow = fieldValue(row, parameter.source.fieldPath);
        if (fromRow !== undefined) value = fromRow;
      } else if (parameter.source.role === 'input') {
        if (
          previous?.operationId === operation.id &&
          Object.hasOwn(previous.values, parameter.name)
        ) {
          value = previous.values[parameter.name];
        } else if (kind === 'update') {
          value = parameter.required
            ? (fieldValue(row, parameter.source.fieldPath) ?? value)
            : undefined;
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
    if (
      kind === 'update' &&
      !operation.parameters.some(
        (parameter) => parameter.source.role === 'input' && Object.hasOwn(values, parameter.name),
      )
    )
      return;
    const keys = row === null ? {} : rowKeys(this.#mutations.get(kind)?.keyPaths ?? [], row);
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
    this.#changes =
      previous === undefined
        ? [...this.#changes, change]
        : this.#changes.map((candidate) => (candidate.id === change.id ? change : candidate));
    this.#changed(true);
  }

  public cancelChanges(id?: number): void {
    if (this.saving) throw new Error('Wait until the current save finishes.');
    const previousLength = this.#changes.length;
    this.#changes = id === undefined ? [] : this.#changes.filter((change) => change.id !== id);
    if (this.#changes.length !== previousLength) this.#changed();
  }

  #changed(stageChange = false): void {
    this.#saveError = undefined;
    this.render();
    this.emit('OnChangesChanged', { pendingChanges: this.pendingChanges });
    if (stageChange && this.autoSave && this.#changes.length > 0) this.#saveAutomatically();
  }

  #saveAutomatically(): void {
    void this.saveChanges().catch(() => {
      // The controller records the error and emits OnSaveError.
    });
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

  #applySavedChange(change: PendingChange): void {
    const page = this.#page;
    if (page === undefined || change.kind === 'insert') return;
    const rows = [...page.result.rows];
    const rowIndex = rows.findIndex((row) => matchesRow(change, row));
    if (rowIndex < 0) return;
    if (change.kind === 'delete') rows.splice(rowIndex, 1);
    else rows[rowIndex] = change.overlay;
    this.#page = { ...page, result: { ...page.result, rows } };
  }

  async #applyChanges(
    source: WebGraphQLSource,
    generation: number,
    changes: readonly PendingChange[],
  ): Promise<void> {
    let applied = 0;
    let failure: { change: PendingChange; error: Error } | undefined;
    try {
      for (const change of changes) {
        if (generation !== this.#generation) return;
        let unexpectedCount = false;
        try {
          if (change.outcome === 'uncertain')
            throw new Error('Review the uncertain save before retrying.');
          const result = await source.executeMutationById(change.operationId, change.values, {
            mergeVariables: false,
          });
          if (generation !== this.#generation) return;
          if (result.affectedCount !== 1) {
            unexpectedCount = result.affectedCount !== 0;
            throw new Error(
              'Expected one affected record. Refresh the grid and review the pending change.',
            );
          }
          this.#applySavedChange(change);
          this.#changes = this.#changes.filter((candidate) => candidate.id !== change.id);
          applied += 1;
        } catch (reason) {
          if (generation !== this.#generation) return;
          const error = errorFrom(reason);
          const uncertain = unexpectedCount || ('outcome' in error && error.outcome === 'unknown');
          const failed: PendingChange = uncertain ? { ...change, outcome: 'uncertain' } : change;
          this.#changes = this.#changes.map((candidate) =>
            candidate.id === failed.id ? failed : candidate,
          );
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
      this.emit('OnSaveError', {
        ...detail,
        change: publicChange(failure.change),
        error: failure.error,
      });
      throw failure.error;
    }
    this.emit('OnSaveChanges', detail);
    if (this.autoSave && this.#changes.length > 0) this.#saveAutomatically();
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
