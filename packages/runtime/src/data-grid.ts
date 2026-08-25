import { WebApiClient } from './api-client.js';
import { WebComponent } from './component.js';

export const WEB_DATA_GRID_CELL_KINDS = ['text', 'image', 'button', 'checkbox'] as const;
export type WebDataGridCellKind = (typeof WEB_DATA_GRID_CELL_KINDS)[number];

export interface WebDataGridColumn {
  readonly id: string;
  readonly header: string;
  readonly fieldPath: string;
  readonly cellKind: WebDataGridCellKind;
  readonly footer: string;
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
  readonly columns: readonly WebDataGridColumn[];
}

export interface WebDataGridCellEventDetail {
  readonly rowIndex: number;
  readonly row: unknown;
  readonly column: WebDataGridColumn;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointerTokens(pointer: string): readonly string[] {
  if (pointer.length === 0) return [];
  if (!pointer.startsWith('/')) return [];
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function resolvePointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isRecord(current)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function cellBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function normalizeColumn(value: unknown, index: number): WebDataGridColumn {
  const source = isRecord(value) ? value : {};
  const kind = source.cellKind;
  return {
    id:
      typeof source.id === 'string' && source.id.length > 0
        ? source.id
        : `column-${String(index + 1)}`,
    header: typeof source.header === 'string' ? source.header : `Column ${String(index + 1)}`,
    fieldPath: typeof source.fieldPath === 'string' ? source.fieldPath : '',
    cellKind:
      kind === 'image' || kind === 'button' || kind === 'checkbox' || kind === 'text'
        ? kind
        : 'text',
    footer: typeof source.footer === 'string' ? source.footer : '',
  };
}

export function normalizeWebDataGridConfiguration(value: unknown): WebDataGridConfiguration {
  const source = isRecord(value) ? value : {};
  const columns = Array.isArray(source.columns)
    ? source.columns.slice(0, 50).map(normalizeColumn)
    : [];
  const normalizedColumns =
    columns.length > 0
      ? columns
      : [
          {
            id: 'column-1',
            header: 'Column 1',
            fieldPath: '',
            cellKind: 'text' as const,
            footer: '',
          },
        ];
  return {
    schemaVersion: typeof source.schemaVersion === 'number' ? source.schemaVersion : 1,
    apiClientId: typeof source.apiClientId === 'string' ? source.apiClientId : null,
    operationId: typeof source.operationId === 'string' ? source.operationId : null,
    listPath: typeof source.listPath === 'string' ? source.listPath : '',
    columnCount: normalizedColumns.length,
    showHeader: source.showHeader !== false,
    stickyHeader: source.stickyHeader !== false,
    showFooter: source.showFooter === true,
    stickyFooter: source.stickyFooter !== false,
    columns: normalizedColumns,
  };
}

function tableCell(
  document: Document,
  column: WebDataGridColumn,
  row: unknown,
  onCellClick: () => void,
): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.dataset.webradDataGridColumn = column.id;
  const value = resolvePointer(row, column.fieldPath);
  switch (column.cellKind) {
    case 'image': {
      const image = document.createElement('img');
      image.className = 'wr-data-grid-image';
      image.alt = column.header;
      image.src = cellText(value);
      cell.append(image);
      break;
    }
    case 'button': {
      const button = document.createElement('button');
      button.className = 'wr-data-grid-button';
      button.type = 'button';
      button.textContent = cellText(value);
      cell.append(button);
      break;
    }
    case 'checkbox': {
      const checkbox = document.createElement('input');
      checkbox.className = 'wr-data-grid-checkbox';
      checkbox.type = 'checkbox';
      checkbox.checked = cellBoolean(value);
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', column.header);
      cell.append(checkbox);
      break;
    }
    case 'text':
      cell.textContent = cellText(value);
      break;
  }
  cell.addEventListener('click', onCellClick);
  return cell;
}

/**
 * A visual table which projects the latest result of a configured named
 * WebApiClient operation. It never triggers a request; authored page code owns
 * execution through `api.execute(...)`.
 */
export class WebDataGrid extends WebComponent<HTMLDivElement> {
  #configuration: WebDataGridConfiguration = normalizeWebDataGridConfiguration(undefined);
  #apiClient: WebApiClient | null = null;
  #unsubscribe: (() => void) | null = null;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebDataGrid requires a div element.');
    }
    super(element);
  }

  public get configuration(): WebDataGridConfiguration {
    return this.#configuration;
  }

  public set configuration(value: WebDataGridConfiguration) {
    this.#configuration = normalizeWebDataGridConfiguration(value);
    this.#render();
  }

  /** Persisted project-model property name exposed to authored page code. */
  public get dataGridConfig(): WebDataGridConfiguration {
    return this.configuration;
  }

  public set dataGridConfig(value: WebDataGridConfiguration) {
    this.configuration = value;
  }

  public bindApiClient(apiClient: WebApiClient | null): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#apiClient = apiClient;
    if (apiClient !== null) this.#unsubscribe = apiClient.subscribe(() => this.#render());
    this.#render();
  }

  #rows(): readonly unknown[] {
    const { apiClientId, operationId, listPath } = this.#configuration;
    if (this.#apiClient === null || apiClientId === null || operationId === null) return [];
    if (this.#apiClient.id !== apiClientId) return [];
    const operation = this.#apiClient.operations.find((candidate) => candidate.id === operationId);
    if (operation === undefined) return [];
    return this.#apiClient.getList<unknown>(operation.name, listPath);
  }

  #render(): void {
    const document = this.element.ownerDocument;
    const configuration = this.#configuration;
    const scroll = document.createElement('div');
    scroll.className = 'wr-data-grid-scroll';
    const table = document.createElement('table');
    table.className = 'wr-data-grid-table';

    if (configuration.showHeader) {
      const header = document.createElement('thead');
      if (configuration.stickyHeader) header.className = 'wr-data-grid-sticky-header';
      const row = document.createElement('tr');
      for (const column of configuration.columns) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = column.header;
        row.append(cell);
      }
      header.append(row);
      table.append(header);
    }

    const body = document.createElement('tbody');
    const rows = this.#rows();
    for (const [rowIndex, rowValue] of rows.entries()) {
      const row = document.createElement('tr');
      for (const column of configuration.columns) {
        row.append(
          tableCell(document, column, rowValue, () => {
            this.emit('OnCellClick', {
              rowIndex,
              row: rowValue,
              column,
            } satisfies WebDataGridCellEventDetail);
          }),
        );
      }
      body.append(row);
    }
    if (rows.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'wr-data-grid-empty';
      cell.colSpan = configuration.columnCount;
      cell.textContent = 'No data';
      row.append(cell);
      body.append(row);
    }
    table.append(body);

    if (configuration.showFooter) {
      const footer = document.createElement('tfoot');
      if (configuration.stickyFooter) footer.className = 'wr-data-grid-sticky-footer';
      const row = document.createElement('tr');
      for (const column of configuration.columns) {
        const cell = document.createElement('td');
        cell.textContent = column.footer;
        row.append(cell);
      }
      footer.append(row);
      table.append(footer);
    }

    scroll.append(table);
    this.element.replaceChildren(scroll);
  }

  public override dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.dispose();
  }
}
