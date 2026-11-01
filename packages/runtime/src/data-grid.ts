import type { WebApiClient } from './api-client.js';
import { WebComponent } from './component.js';
import { WebToggle } from './controls.js';
import { createWebRadIconElement, isWebRadIconName, type WebRadIconName } from './icons.js';
import { resolveDataGridColumnTrackWidths } from './visual.js';

export const WEB_DATA_GRID_CELL_KINDS = ['text', 'image', 'button', 'checkbox', 'toggle'] as const;
export type WebDataGridCellKind = (typeof WEB_DATA_GRID_CELL_KINDS)[number];

export const WEB_DATA_GRID_COLUMN_WIDTH_MODES = ['fixed', 'dynamic'] as const;
export type WebDataGridColumnWidthMode = (typeof WEB_DATA_GRID_COLUMN_WIDTH_MODES)[number];

export const WEB_DATA_GRID_ROW_HEIGHT_MODES = ['fixed', 'dynamic'] as const;
export type WebDataGridRowHeightMode = (typeof WEB_DATA_GRID_ROW_HEIGHT_MODES)[number];

export const WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type WebDataGridHorizontalAlignment = (typeof WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS)[number];

export const WEB_DATA_GRID_PAGINATION_MODES = ['none', 'client', 'server'] as const;
export type WebDataGridPaginationMode = (typeof WEB_DATA_GRID_PAGINATION_MODES)[number];

export type WebDataGridSortDirection = 'asc' | 'desc';

export interface WebDataGridColumn {
  readonly id: string;
  readonly header: string;
  readonly fieldPath: string;
  readonly cellKind: WebDataGridCellKind;
  readonly fixedCaption: string;
  readonly buttonIcon: WebRadIconName | null;
  readonly footer: string;
  readonly widthMode: WebDataGridColumnWidthMode;
  readonly width: number;
  readonly minWidth: number;
  readonly maxWidth: number | null;
  readonly flex: number;
  readonly headerAlign: WebDataGridHorizontalAlignment;
  readonly cellAlign: WebDataGridHorizontalAlignment;
  readonly sortable: boolean;
  readonly searchable: boolean;
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
  readonly pagination: WebDataGridPaginationMode;
  readonly pageSize: number;
  readonly pageSizeOptions: readonly number[];
  readonly showPageSizeSelector: boolean;
  readonly searchEnabled: boolean;
  readonly searchPlaceholder: string;
  readonly sortEnabled: boolean;
  readonly exportEnabled: boolean;
  readonly serverSearchParameter: string;
  readonly serverSortParameter: string;
  readonly serverDirectionParameter: string;
  readonly totalPagesPath: string;
  readonly totalRowsPath: string;
}

type WebDataGridQueryOptionKey =
  | 'pagination'
  | 'pageSize'
  | 'pageSizeOptions'
  | 'showPageSizeSelector'
  | 'searchEnabled'
  | 'searchPlaceholder'
  | 'sortEnabled'
  | 'exportEnabled'
  | 'serverSearchParameter'
  | 'serverSortParameter'
  | 'serverDirectionParameter'
  | 'totalPagesPath'
  | 'totalRowsPath';

/** A column accepted by the configuration setter; sort and search flags default to true. */
export type WebDataGridColumnInput = Omit<WebDataGridColumn, 'sortable' | 'searchable'> &
  Partial<Pick<WebDataGridColumn, 'sortable' | 'searchable'>>;

/** A configuration accepted by the setter; paging, sort, search and export options are optional. */
export type WebDataGridConfigurationInput = Omit<
  WebDataGridConfiguration,
  WebDataGridQueryOptionKey | 'columns'
> &
  Partial<Pick<WebDataGridConfiguration, WebDataGridQueryOptionKey>> & {
    readonly columns: readonly WebDataGridColumnInput[];
  };

/** Current page, sort and search of a grid, sent with its query events. */
export interface WebDataGridQueryState {
  /** One-based page number. */
  readonly page: number;
  readonly pageSize: number;
  /** Total pages; 1 when paging is off or the server did not report it. */
  readonly pageCount: number;
  /** Rows after search, or the server-reported total; null when unknown. */
  readonly totalRows: number | null;
  readonly sortColumnId: string | null;
  /** Field name sent to the server, derived from the sorted column's Field. */
  readonly sortField: string | null;
  readonly sortDirection: WebDataGridSortDirection | null;
  readonly search: string;
}

export interface WebDataGridCellEventDetail {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly row: unknown;
  readonly column: WebDataGridColumn;
  /** Value bound to the clicked column, or undefined when it has no Field. */
  readonly value: unknown;
  /** Reads another value from the same row by property name or JSON Pointer. */
  readonly getValue: <T = unknown>(fieldNameOrPath: string) => T | undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumberInRange(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function nullableNumberInRange(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
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

function dataGridRowValue<T = unknown>(row: unknown, fieldNameOrPath: string): T | undefined {
  const field = fieldNameOrPath.trim();
  if (field.length === 0) return undefined;
  const value = field.startsWith('/')
    ? resolvePointer(row, field)
    : isRecord(row)
      ? row[field]
      : undefined;
  return value as T | undefined;
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

function normalizeAlignment(value: unknown): WebDataGridHorizontalAlignment {
  return value === 'center' || value === 'end' || value === 'start' ? value : 'start';
}

function normalizeColumn(value: unknown, index: number): WebDataGridColumn {
  const source = isRecord(value) ? value : {};
  const kind = source.cellKind;
  const minWidth = finiteNumberInRange(source.minWidth, 96, 1, 10_000);
  const rawMaxWidth = nullableNumberInRange(source.maxWidth, 1, 10_000);
  return {
    id:
      typeof source.id === 'string' && source.id.length > 0
        ? source.id
        : `column-${String(index + 1)}`,
    header: typeof source.header === 'string' ? source.header : `Column ${String(index + 1)}`,
    fieldPath: typeof source.fieldPath === 'string' ? source.fieldPath : '',
    cellKind:
      kind === 'image' ||
      kind === 'button' ||
      kind === 'checkbox' ||
      kind === 'text' ||
      kind === 'toggle'
        ? kind
        : 'text',
    fixedCaption: typeof source.fixedCaption === 'string' ? source.fixedCaption : '',
    buttonIcon: isWebRadIconName(source.buttonIcon) ? source.buttonIcon : null,
    footer: typeof source.footer === 'string' ? source.footer : '',
    widthMode: source.widthMode === 'fixed' ? 'fixed' : 'dynamic',
    width: finiteNumberInRange(source.width, 180, 1, 10_000),
    minWidth,
    maxWidth: rawMaxWidth !== null && rawMaxWidth >= minWidth ? rawMaxWidth : null,
    flex: finiteNumberInRange(source.flex, 1, 0.1, 100),
    headerAlign: normalizeAlignment(source.headerAlign),
    cellAlign: normalizeAlignment(source.cellAlign),
    sortable: source.sortable !== false,
    searchable: source.searchable !== false,
  };
}

const QUERY_PARAMETER_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;

function queryParameter(value: unknown, fallback: string): string {
  return typeof value === 'string' && QUERY_PARAMETER_PATTERN.test(value) ? value : fallback;
}

function pointerOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && (value.length === 0 || value.startsWith('/'))
    ? value
    : fallback;
}

function pageSizeValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1_000
    ? value
    : fallback;
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
            fixedCaption: '',
            buttonIcon: null,
            footer: '',
            widthMode: 'dynamic' as const,
            width: 180,
            minWidth: 96,
            maxWidth: null,
            flex: 1,
            headerAlign: 'start' as const,
            cellAlign: 'start' as const,
            sortable: true,
            searchable: true,
          },
        ];
  const minRowHeight = finiteNumberInRange(source.minRowHeight, 36, 0, 10_000);
  const pageSize = pageSizeValue(source.pageSize, 10);
  const rawOptions = Array.isArray(source.pageSizeOptions)
    ? source.pageSizeOptions.slice(0, 12).map((option) => pageSizeValue(option, 0))
    : [10, 25, 50, 100];
  const pageSizeOptions = [
    ...new Set([...rawOptions.filter((option) => option > 0), pageSize]),
  ].sort((left, right) => left - right);
  const rawMaxRowHeight = nullableNumberInRange(source.maxRowHeight, 1, 10_000);
  return {
    schemaVersion:
      typeof source.schemaVersion === 'number' && Number.isFinite(source.schemaVersion)
        ? source.schemaVersion
        : 2,
    apiClientId: typeof source.apiClientId === 'string' ? source.apiClientId : null,
    operationId: typeof source.operationId === 'string' ? source.operationId : null,
    listPath: typeof source.listPath === 'string' ? source.listPath : '',
    columnCount: normalizedColumns.length,
    showHeader: source.showHeader !== false,
    stickyHeader: source.stickyHeader !== false,
    showFooter: source.showFooter === true,
    stickyFooter: source.stickyFooter !== false,
    rowHeightMode: source.rowHeightMode === 'fixed' ? 'fixed' : 'dynamic',
    fixedRowHeight: finiteNumberInRange(source.fixedRowHeight, 40, 1, 10_000),
    minRowHeight,
    maxRowHeight:
      rawMaxRowHeight !== null && rawMaxRowHeight >= minRowHeight ? rawMaxRowHeight : null,
    cellPaddingHorizontal: finiteNumberInRange(source.cellPaddingHorizontal, 10, 0, 10_000),
    cellPaddingVertical: finiteNumberInRange(source.cellPaddingVertical, 8, 0, 10_000),
    wrapText: source.wrapText === true,
    stripedRows: source.stripedRows === true,
    showHorizontalLines: source.showHorizontalLines !== false,
    showVerticalLines: source.showVerticalLines === true,
    emptyMessage: typeof source.emptyMessage === 'string' ? source.emptyMessage : 'No data',
    columns: normalizedColumns,
    pagination:
      source.pagination === 'client' || source.pagination === 'server' ? source.pagination : 'none',
    pageSize,
    pageSizeOptions,
    showPageSizeSelector: source.showPageSizeSelector !== false,
    searchEnabled: source.searchEnabled === true,
    searchPlaceholder: typeof source.searchPlaceholder === 'string' ? source.searchPlaceholder : '',
    sortEnabled: source.sortEnabled === true,
    exportEnabled: source.exportEnabled === true,
    serverSearchParameter: queryParameter(source.serverSearchParameter, 'q'),
    serverSortParameter: queryParameter(source.serverSortParameter, 'sort'),
    serverDirectionParameter: queryParameter(source.serverDirectionParameter, 'dir'),
    totalPagesPath: pointerOrDefault(source.totalPagesPath, '/total_pages'),
    totalRowsPath: pointerOrDefault(source.totalRowsPath, '/total'),
  };
}

interface WebDataGridLabels {
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly export: string;
  readonly pageSize: string;
  readonly first: string;
  readonly previous: string;
  readonly next: string;
  readonly last: string;
  readonly pages: string;
  readonly page: (page: number) => string;
  readonly info: (from: number, to: number, total: number | null) => string;
  readonly pageOf: (page: number, pageCount: number) => string;
  readonly loading: string;
  readonly yes: string;
  readonly no: string;
}

const PORTUGUESE_LABELS: WebDataGridLabels = {
  search: 'Pesquisar',
  searchPlaceholder: 'Pesquisar…',
  export: 'Exportar CSV',
  pageSize: 'Registros por página',
  first: 'Primeira página',
  previous: 'Página anterior',
  next: 'Próxima página',
  last: 'Última página',
  pages: 'Paginação',
  page: (page) => `Página ${String(page)}`,
  info: (from, to, total) =>
    total === null
      ? `Mostrando ${String(from)} a ${String(to)}`
      : total === 0
        ? 'Nenhum registro encontrado'
        : `Mostrando ${String(from)} a ${String(to)} de ${String(total)} registros`,
  pageOf: (page, pageCount) => `Página ${String(page)} de ${String(pageCount)}`,
  loading: 'Carregando…',
  yes: 'Sim',
  no: 'Não',
};

const ENGLISH_LABELS: WebDataGridLabels = {
  search: 'Search',
  searchPlaceholder: 'Search…',
  export: 'Export CSV',
  pageSize: 'Rows per page',
  first: 'First page',
  previous: 'Previous page',
  next: 'Next page',
  last: 'Last page',
  pages: 'Pagination',
  page: (page) => `Page ${String(page)}`,
  info: (from, to, total) =>
    total === null
      ? `Showing ${String(from)} to ${String(to)}`
      : total === 0
        ? 'No matching records'
        : `Showing ${String(from)} to ${String(to)} of ${String(total)} records`,
  pageOf: (page, pageCount) => `Page ${String(page)} of ${String(pageCount)}`,
  loading: 'Loading…',
  yes: 'Yes',
  no: 'No',
};

function documentLocale(document: Document): string {
  const lang = document.documentElement.lang.trim();
  return lang.length > 0 ? lang : 'en';
}

function dataGridLabels(locale: string): WebDataGridLabels {
  return locale.toLowerCase().startsWith('pt') ? PORTUGUESE_LABELS : ENGLISH_LABELS;
}

/** Case- and accent-insensitive text used by the client-side search. */
export function normalizeDataGridSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();
}

const BRAZILIAN_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/u;

/** Maps a cell value to a comparable key; dd/mm/yyyy dates sort chronologically. */
function sortKey(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(value);
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (text.length === 0) return null;
  const date = BRAZILIAN_DATE_PATTERN.exec(text);
  if (date !== null) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = date;
    return `${year ?? ''}-${month ?? ''}-${day ?? ''} ${hour}:${minute}:${second}`;
  }
  return text;
}

/** Sorts nulls last in either direction, numbers numerically and text with the locale. */
export function compareDataGridValues(
  left: unknown,
  right: unknown,
  collator: Intl.Collator,
): number {
  const a = sortKey(left);
  const b = sortKey(right);
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

function csvCell(value: string, separator: string): string {
  // A leading formula character would be executed by spreadsheet software.
  const safe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return safe.includes(separator) || /["\r\n]/u.test(safe)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

function sortFieldName(fieldPath: string): string | null {
  const tokens = pointerTokens(fieldPath.trim().startsWith('/') ? fieldPath.trim() : '');
  if (tokens.length > 0) return tokens.join('.');
  const field = fieldPath.trim();
  return field.length > 0 ? field : null;
}

function pageNumbers(page: number, pageCount: number): readonly (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_unused, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) for (const value of [2, 3, 4]) pages.add(value);
  if (page >= pageCount - 2)
    for (const value of [pageCount - 3, pageCount - 2, pageCount - 1]) pages.add(value);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) result.push(null);
    result.push(value);
  }
  return result;
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim().length > 0 ? Number(value) : value;
  return typeof number === 'number' && Number.isInteger(number) && number >= 0 ? number : null;
}

function gridTemplateColumns(
  columns: readonly WebDataGridColumn[],
  availableWidth: number,
): string {
  return resolveDataGridColumnTrackWidths(columns, availableWidth)
    .map((width) => `${String(width)}px`)
    .join(' ');
}

function minimumGridWidth(columns: readonly WebDataGridColumn[]): number {
  return columns.reduce(
    (total, column) => total + (column.widthMode === 'fixed' ? column.width : column.minWidth),
    0,
  );
}

function focusDataGridCell(cell: HTMLDivElement): void {
  const grid = cell.closest('[role="grid"]');
  if (grid === null) return;
  for (const candidate of grid.querySelectorAll<HTMLDivElement>(
    '.wr-data-grid-body-row > .wr-data-grid-cell:not(.wr-data-grid-empty)',
  )) {
    candidate.tabIndex = -1;
  }
  cell.tabIndex = 0;
  cell.focus();
}

function moveDataGridCellFocus(
  cell: HTMLDivElement,
  rowOffset: number,
  columnOffset: number,
): void {
  const body = cell.closest('.wr-data-grid-body');
  const currentRow = cell.parentElement;
  if (body === null || currentRow === null) return;
  const rows = Array.from(body.children).filter(
    (candidate): candidate is HTMLDivElement =>
      candidate instanceof HTMLDivElement && candidate.classList.contains('wr-data-grid-body-row'),
  );
  const rowIndex = rows.indexOf(currentRow as HTMLDivElement);
  const cells = Array.from(currentRow.children).filter(
    (candidate): candidate is HTMLDivElement =>
      candidate instanceof HTMLDivElement &&
      candidate.classList.contains('wr-data-grid-cell') &&
      !candidate.classList.contains('wr-data-grid-empty'),
  );
  const columnIndex = cells.indexOf(cell);
  const targetRow = rows[rowIndex + rowOffset];
  if (targetRow === undefined || columnIndex < 0) return;
  const targetCells = Array.from(targetRow.children).filter(
    (candidate): candidate is HTMLDivElement =>
      candidate instanceof HTMLDivElement &&
      candidate.classList.contains('wr-data-grid-cell') &&
      !candidate.classList.contains('wr-data-grid-empty'),
  );
  const target = targetCells[columnIndex + columnOffset];
  if (target !== undefined) focusDataGridCell(target);
}

function appendGridCell(
  document: Document,
  row: HTMLDivElement,
  className: string,
  role: 'columnheader' | 'gridcell',
  column: WebDataGridColumn,
  columnIndex: number,
): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = className;
  cell.setAttribute('role', role);
  cell.setAttribute('aria-colindex', String(columnIndex + 1));
  cell.dataset.webradDataGridColumn = column.id;
  cell.style.textAlign = column.cellAlign;
  row.append(cell);
  return cell;
}

function dataCell(
  document: Document,
  column: WebDataGridColumn,
  rowValue: unknown,
  rowIndex: number,
  columnIndex: number,
  onCellClick: (value: unknown) => void,
  toggles: WebToggle[],
): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = 'wr-data-grid-cell';
  cell.setAttribute('role', 'gridcell');
  cell.setAttribute('aria-colindex', String(columnIndex + 1));
  cell.tabIndex = rowIndex === 0 && columnIndex === 0 ? 0 : -1;
  cell.dataset.webradDataGridColumn = column.id;
  cell.style.textAlign = column.cellAlign;
  const value = dataGridRowValue(rowValue, column.fieldPath);
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
      const captionText =
        column.fixedCaption.length > 0
          ? column.fixedCaption
          : column.fieldPath.length > 0
            ? cellText(value)
            : '';
      if (captionText.length === 0) button.setAttribute('aria-label', column.header || 'Button');
      if (column.buttonIcon !== null) {
        const iconSlot = document.createElement('span');
        iconSlot.className = 'wr-data-grid-button-icon-slot';
        iconSlot.setAttribute('aria-hidden', 'true');
        const icon = createWebRadIconElement(document, column.buttonIcon);
        icon.classList.add('wr-button-icon', 'wr-data-grid-button-icon');
        icon.dataset.webradButtonIcon = '';
        iconSlot.append(icon);
        button.append(iconSlot);
      }
      if (captionText.length > 0) {
        const caption = document.createElement('span');
        caption.className = 'wr-data-grid-button-caption';
        caption.textContent = captionText;
        button.append(caption);
      }
      cell.append(button);
      break;
    }
    case 'toggle': {
      const element = document.createElement('button');
      element.className = 'wr-component wr-webtoggle wr-data-grid-toggle';
      element.setAttribute('aria-label', column.header || 'Toggle');
      element.setAttribute('aria-readonly', 'true');
      element.tabIndex = -1;
      for (const name of ['track', 'thumb']) {
        const part = document.createElement('span');
        part.className = 'wr-toggle-' + name;
        part.setAttribute('aria-hidden', 'true');
        element.append(part);
      }
      const toggle = new WebToggle(element);
      toggle.checked = cellBoolean(value);
      toggle.enabled = false;
      toggles.push(toggle);
      cell.append(element);
      break;
    }
    case 'checkbox': {
      const control = document.createElement('label');
      control.className = 'wr-data-grid-checkbox-control';
      const checkbox = document.createElement('input');
      checkbox.className = 'wr-data-grid-checkbox';
      checkbox.type = 'checkbox';
      checkbox.checked = cellBoolean(value);
      checkbox.disabled = true;
      checkbox.setAttribute(
        'aria-label',
        column.fixedCaption.length > 0 ? column.fixedCaption : column.header,
      );
      control.append(checkbox);
      if (column.fixedCaption.length > 0) {
        const caption = document.createElement('span');
        caption.className = 'wr-data-grid-checkbox-caption';
        caption.textContent = column.fixedCaption;
        control.append(caption);
      }
      cell.append(control);
      break;
    }
    case 'text':
      cell.textContent = cellText(value);
      break;
  }
  cell.addEventListener('focus', () => focusDataGridCell(cell));
  cell.addEventListener('click', (event) => {
    if (event.target === cell) focusDataGridCell(cell);
    onCellClick(value);
  });
  cell.addEventListener('keydown', (event) => {
    if (event.target !== cell) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCellClick(value);
      return;
    }
    const movement: readonly [number, number] | undefined =
      event.key === 'ArrowLeft'
        ? [0, -1]
        : event.key === 'ArrowRight'
          ? [0, 1]
          : event.key === 'ArrowUp'
            ? [-1, 0]
            : event.key === 'ArrowDown'
              ? [1, 0]
              : undefined;
    if (movement === undefined) return;
    event.preventDefault();
    moveDataGridCellFocus(cell, movement[0], movement[1]);
  });
  return cell;
}

function applyGridLayout(
  content: HTMLDivElement,
  configuration: WebDataGridConfiguration,
  availableWidth: number,
): void {
  content.style.setProperty(
    '--wr-data-grid-columns',
    gridTemplateColumns(configuration.columns, availableWidth),
  );
  content.style.setProperty(
    '--wr-data-grid-min-width',
    `${String(minimumGridWidth(configuration.columns))}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-fixed-row-height',
    `${String(configuration.fixedRowHeight)}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-min-row-height',
    `${String(configuration.minRowHeight)}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-max-row-height',
    configuration.maxRowHeight === null ? 'none' : `${String(configuration.maxRowHeight)}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-cell-padding-x',
    `${String(configuration.cellPaddingHorizontal)}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-cell-padding-y',
    `${String(configuration.cellPaddingVertical)}px`,
  );
  content.style.setProperty(
    '--wr-data-grid-config-horizontal-line-width',
    configuration.showHorizontalLines ? '1px' : '0px',
  );
  content.style.setProperty(
    '--wr-data-grid-config-vertical-line-width',
    configuration.showVerticalLines ? '1px' : '0px',
  );
  content.dataset.webradRowHeightMode = configuration.rowHeightMode;
  content.dataset.webradWrapText = String(configuration.wrapText);
}

interface WebDataGridView {
  readonly rows: readonly unknown[];
  readonly filtered: readonly unknown[];
  readonly pageCount: number;
  readonly totalRows: number | null;
  readonly firstRowNumber: number;
}

/**
 * A visual grid which projects the latest result of a configured named
 * WebApiClient operation. With paging off or in client mode it never triggers
 * a request; authored page code owns execution through `api.execute(...)`. In
 * server mode the grid re-executes its bound operation with `page`,
 * `page_size`, sort and search query parameters whenever the user changes the
 * page, sort or search, and when `refresh()` is called.
 */
export class WebDataGrid extends WebComponent<HTMLDivElement> {
  #toggles: WebToggle[] = [];
  #configuration: WebDataGridConfiguration = normalizeWebDataGridConfiguration(undefined);
  #apiClient: WebApiClient | null = null;
  #unsubscribe: (() => void) | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #toolbar: HTMLDivElement | null = null;
  #searchInput: HTMLInputElement | null = null;
  #searchTimer: ReturnType<typeof setTimeout> | null = null;
  #page = 1;
  #pageSize = 10;
  #sortColumnId: string | null = null;
  #sortDirection: WebDataGridSortDirection = 'asc';
  #search = '';
  #serverRequest = 0;

  public constructor(element: HTMLElement) {
    if (!(element instanceof HTMLDivElement)) {
      throw new TypeError('WebDataGrid requires a div element.');
    }
    super(element);
  }

  public get configuration(): WebDataGridConfiguration {
    return this.#configuration;
  }

  public set configuration(value: WebDataGridConfigurationInput) {
    this.#configuration = normalizeWebDataGridConfiguration(value);
    this.#pageSize = this.#configuration.pageSize;
    if (
      this.#sortColumnId !== null &&
      !this.#configuration.columns.some((column) => column.id === this.#sortColumnId)
    ) {
      this.#sortColumnId = null;
    }
    this.#buildToolbar();
    this.#render();
  }

  /** Persisted project-model property name exposed to authored page code. */
  public get dataGridConfig(): WebDataGridConfiguration {
    return this.configuration;
  }

  public set dataGridConfig(value: WebDataGridConfigurationInput) {
    this.configuration = value;
  }

  public bindApiClient(apiClient: WebApiClient | null): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#apiClient = apiClient;
    if (apiClient !== null) this.#unsubscribe = apiClient.subscribe(() => this.#render());
    this.#render();
    if (apiClient !== null && this.#configuration.pagination === 'server') void this.refresh();
  }

  /** One-based page currently shown. */
  public get page(): number {
    return this.#page;
  }

  public set page(value: number) {
    this.goToPage(value);
  }

  public get pageSize(): number {
    return this.#pageSize;
  }

  public set pageSize(value: number) {
    const size = pageSizeValue(value, this.#pageSize);
    if (size === this.#pageSize) return;
    this.#pageSize = size;
    this.#page = 1;
    this.#queryChanged('OnPageChange');
  }

  /** Number of pages for the current search; 1 when paging is off. */
  public get pageCount(): number {
    return this.#view().pageCount;
  }

  /** Text currently applied by the search box. */
  public get searchText(): string {
    return this.#search;
  }

  public set searchText(value: string) {
    this.search(value);
  }

  public get queryState(): WebDataGridQueryState {
    const view = this.#view();
    return this.#queryState(view.pageCount, view.totalRows);
  }

  /** Rows rendered on the current page, after search and sort. */
  public get visibleRows(): readonly unknown[] {
    return this.#view().rows;
  }

  /** All rows matching the search, sorted; in server mode, the current page. */
  public get filteredRows(): readonly unknown[] {
    return this.#view().filtered;
  }

  public goToPage(page: number): void {
    const pageCount = this.#view().pageCount;
    const target = Math.min(Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1)), pageCount);
    if (target === this.#page) return;
    this.#page = target;
    this.#queryChanged('OnPageChange');
  }

  public firstPage(): void {
    this.goToPage(1);
  }

  public previousPage(): void {
    this.goToPage(this.#page - 1);
  }

  public nextPage(): void {
    this.goToPage(this.#page + 1);
  }

  public lastPage(): void {
    this.goToPage(this.#view().pageCount);
  }

  /**
   * Sorts by a column ID, column header or Field. Without a direction, the
   * same column toggles ascending, descending and unsorted.
   */
  public sortBy(column: string | null, direction?: WebDataGridSortDirection): void {
    const target =
      column === null
        ? undefined
        : this.#configuration.columns.find(
            (candidate) =>
              candidate.id === column ||
              candidate.header === column ||
              candidate.fieldPath === column ||
              sortFieldName(candidate.fieldPath) === column,
          );
    if (target === undefined) {
      if (this.#sortColumnId === null) return;
      this.#sortColumnId = null;
    } else if (direction !== undefined) {
      this.#sortColumnId = target.id;
      this.#sortDirection = direction;
    } else if (this.#sortColumnId !== target.id) {
      this.#sortColumnId = target.id;
      this.#sortDirection = 'asc';
    } else if (this.#sortDirection === 'asc') {
      this.#sortDirection = 'desc';
    } else {
      this.#sortColumnId = null;
    }
    this.#page = 1;
    this.#queryChanged('OnSortChange');
  }

  public clearSort(): void {
    this.sortBy(null);
  }

  /** Applies a search immediately and returns to the first page. */
  public search(text: string): void {
    if (this.#searchTimer !== null) clearTimeout(this.#searchTimer);
    this.#searchTimer = null;
    const value = text.trim();
    if (this.#searchInput !== null && this.#searchInput.value.trim() !== value) {
      this.#searchInput.value = value;
    }
    if (value === this.#search) return;
    this.#search = value;
    this.#page = 1;
    this.#queryChanged('OnSearch');
  }

  /**
   * Re-executes the bound operation with the current page, sort and search in
   * server mode; elsewhere it only re-renders the latest loaded result.
   */
  public async refresh(): Promise<void> {
    if (this.#configuration.pagination !== 'server') {
      this.#render();
      return;
    }
    const apiClient = this.#apiClient;
    const operation = this.#operation();
    if (apiClient === null || operation === undefined) return;
    const configuration = this.#configuration;
    const state = this.#queryState(this.#view().pageCount, null);
    const query: Record<string, string | number> = {
      page: state.page,
      page_size: state.pageSize,
    };
    if (state.search.length > 0) query[configuration.serverSearchParameter] = state.search;
    if (state.sortField !== null && state.sortDirection !== null) {
      query[configuration.serverSortParameter] = state.sortField;
      query[configuration.serverDirectionParameter] = state.sortDirection;
    }
    const request = ++this.#serverRequest;
    this.element.setAttribute('aria-busy', 'true');
    try {
      await apiClient.execute(operation.name, {
        query,
        headers: { 'X-RestGo-Pagination': 'exact' },
      });
    } catch {
      // The client already exposes the failure through its state and OnError.
    } finally {
      if (request === this.#serverRequest) this.element.removeAttribute('aria-busy');
    }
    if (request !== this.#serverRequest) return;
    const pageCount = this.#view().pageCount;
    if (this.#page > pageCount) {
      this.#page = pageCount;
      void this.refresh();
    }
  }

  /**
   * Builds a CSV of the searched and sorted rows (the current page in server
   * mode) from text, checkbox and toggle columns. With `fileName`, the browser
   * also downloads it. Spreadsheet formulas are neutralized.
   */
  public exportCsv(fileName?: string): string {
    const document = this.element.ownerDocument;
    const labels = dataGridLabels(documentLocale(document));
    const separator = documentLocale(document).toLowerCase().startsWith('pt') ? ';' : ',';
    const columns = this.#configuration.columns.filter(
      (column) => column.cellKind !== 'button' && column.cellKind !== 'image',
    );
    const lines = [columns.map((column) => csvCell(column.header, separator)).join(separator)];
    for (const row of this.#view().filtered) {
      lines.push(
        columns
          .map((column) => {
            const value = dataGridRowValue(row, column.fieldPath);
            const text =
              column.cellKind === 'checkbox' || column.cellKind === 'toggle'
                ? cellBoolean(value)
                  ? labels.yes
                  : labels.no
                : cellText(value);
            return csvCell(text, separator);
          })
          .join(separator),
      );
    }
    const csv = `${lines.join('\r\n')}\r\n`;
    if (fileName !== undefined) this.#download(csv, fileName);
    return csv;
  }

  #download(csv: string, fileName: string): void {
    const view = this.element.ownerDocument.defaultView;
    if (view === null || typeof view.URL.createObjectURL !== 'function') return;
    const url = view.URL.createObjectURL(
      new view.Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = this.element.ownerDocument.createElement('a');
    link.href = url;
    link.download = fileName.toLowerCase().endsWith('.csv') ? fileName : `${fileName}.csv`;
    link.style.display = 'none';
    this.element.ownerDocument.body.append(link);
    link.click();
    link.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  }

  #operation(): { readonly id: string; readonly name: string } | undefined {
    const { apiClientId, operationId } = this.#configuration;
    if (this.#apiClient === null || apiClientId === null || operationId === null) return undefined;
    if (this.#apiClient.id !== apiClientId) return undefined;
    return this.#apiClient.operations.find((candidate) => candidate.id === operationId);
  }

  #rows(): readonly unknown[] {
    const operation = this.#operation();
    if (this.#apiClient === null || operation === undefined) return [];
    return this.#apiClient.getList<unknown>(operation.name, this.#configuration.listPath);
  }

  #sortColumn(): WebDataGridColumn | undefined {
    return this.#sortColumnId === null
      ? undefined
      : this.#configuration.columns.find((column) => column.id === this.#sortColumnId);
  }

  #queryState(pageCount: number, totalRows: number | null): WebDataGridQueryState {
    const column = this.#sortColumn();
    return {
      page: this.#page,
      pageSize: this.#pageSize,
      pageCount,
      totalRows,
      sortColumnId: column?.id ?? null,
      sortField: column === undefined ? null : sortFieldName(column.fieldPath),
      sortDirection: column === undefined ? null : this.#sortDirection,
      search: this.#search,
    };
  }

  #serverMetadata(): { readonly pageCount: number | null; readonly totalRows: number | null } {
    const operation = this.#operation();
    if (this.#apiClient === null || operation === undefined) {
      return { pageCount: null, totalRows: null };
    }
    const response = (this.#apiClient.data as Readonly<Record<string, unknown>>)[operation.name];
    const { totalPagesPath, totalRowsPath } = this.#configuration;
    return {
      pageCount:
        totalPagesPath.length > 0
          ? positiveInteger(resolvePointer(response, totalPagesPath))
          : null,
      totalRows:
        totalRowsPath.length > 0 ? positiveInteger(resolvePointer(response, totalRowsPath)) : null,
    };
  }

  #view(): WebDataGridView {
    const configuration = this.#configuration;
    const source = this.#rows();
    if (configuration.pagination === 'server') {
      const metadata = this.#serverMetadata();
      const pageCount = Math.max(1, metadata.pageCount ?? this.#page);
      return {
        rows: source,
        filtered: source,
        pageCount,
        totalRows: metadata.totalRows,
        firstRowNumber: (this.#page - 1) * this.#pageSize + 1,
      };
    }
    let filtered = source;
    if (configuration.searchEnabled && this.#search.length > 0) {
      const terms = normalizeDataGridSearchText(this.#search).split(/\s+/u);
      const columns = configuration.columns.filter(
        (column) => column.searchable && column.fieldPath.length > 0,
      );
      filtered = source.filter((row) => {
        const text = normalizeDataGridSearchText(
          columns.map((column) => cellText(dataGridRowValue(row, column.fieldPath))).join(' '),
        );
        return terms.every((term) => text.includes(term));
      });
    }
    const sortColumn = configuration.sortEnabled ? this.#sortColumn() : undefined;
    if (sortColumn !== undefined) {
      const collator = new Intl.Collator(documentLocale(this.element.ownerDocument), {
        numeric: true,
        sensitivity: 'base',
      });
      const direction = this.#sortDirection === 'asc' ? 1 : -1;
      filtered = [...filtered].sort((left, right) => {
        const a = dataGridRowValue(left, sortColumn.fieldPath);
        const b = dataGridRowValue(right, sortColumn.fieldPath);
        if (a === null || a === undefined || b === null || b === undefined) {
          return compareDataGridValues(a, b, collator);
        }
        return direction * compareDataGridValues(a, b, collator);
      });
    }
    if (configuration.pagination === 'none') {
      return {
        rows: filtered,
        filtered,
        pageCount: 1,
        totalRows: filtered.length,
        firstRowNumber: 1,
      };
    }
    const pageCount = Math.max(1, Math.ceil(filtered.length / this.#pageSize));
    const page = Math.min(this.#page, pageCount);
    const start = (page - 1) * this.#pageSize;
    return {
      rows: filtered.slice(start, start + this.#pageSize),
      filtered,
      pageCount,
      totalRows: filtered.length,
      firstRowNumber: start + 1,
    };
  }

  #queryChanged(eventName: 'OnPageChange' | 'OnSortChange' | 'OnSearch'): void {
    const view = this.#view();
    if (this.#configuration.pagination !== 'server')
      this.#page = Math.min(this.#page, view.pageCount);
    const state = this.#queryState(view.pageCount, view.totalRows);
    this.emit(eventName, state);
    this.emit('OnQueryChange', state);
    if (this.#configuration.pagination === 'server') {
      void this.refresh();
    }
    this.#render();
  }

  #buildToolbar(): void {
    this.#toolbar?.remove();
    this.#toolbar = null;
    this.#searchInput = null;
    const configuration = this.#configuration;
    if (!configuration.searchEnabled && !configuration.exportEnabled) return;
    const document = this.element.ownerDocument;
    const labels = dataGridLabels(documentLocale(document));
    const toolbar = document.createElement('div');
    toolbar.className = 'wr-data-grid-toolbar';
    if (configuration.searchEnabled) {
      const label = document.createElement('label');
      label.className = 'wr-data-grid-search';
      const input = document.createElement('input');
      input.type = 'search';
      input.className = 'wr-data-grid-search-input';
      input.placeholder =
        configuration.searchPlaceholder.length > 0
          ? configuration.searchPlaceholder
          : labels.searchPlaceholder;
      input.setAttribute('aria-label', labels.search);
      input.value = this.#search;
      input.addEventListener('input', () => {
        if (this.#searchTimer !== null) clearTimeout(this.#searchTimer);
        const delay = this.#configuration.pagination === 'server' ? 350 : 120;
        this.#searchTimer = setTimeout(() => this.search(input.value), delay);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.search(input.value);
        }
      });
      label.append(input);
      toolbar.append(label);
      this.#searchInput = input;
    }
    if (configuration.exportEnabled) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wr-data-grid-export';
      button.textContent = labels.export;
      button.addEventListener('click', () => {
        this.exportCsv(this.name.length > 0 ? this.name : 'dados');
      });
      toolbar.append(button);
    }
    this.#toolbar = toolbar;
  }

  #renderPager(document: Document, view: WebDataGridView): HTMLDivElement | null {
    const configuration = this.#configuration;
    if (configuration.pagination === 'none') return null;
    const labels = dataGridLabels(documentLocale(document));
    const pager = document.createElement('div');
    pager.className = 'wr-data-grid-pager';
    const info = document.createElement('span');
    info.className = 'wr-data-grid-info';
    info.setAttribute('aria-live', 'polite');
    const lastRowNumber = view.firstRowNumber + view.rows.length - 1;
    info.textContent =
      configuration.pagination === 'server' && view.totalRows === null
        ? labels.pageOf(this.#page, view.pageCount)
        : labels.info(
            view.rows.length === 0 ? 0 : view.firstRowNumber,
            view.rows.length === 0 ? 0 : lastRowNumber,
            view.totalRows,
          );
    pager.append(info);
    if (configuration.showPageSizeSelector && configuration.pageSizeOptions.length > 1) {
      const label = document.createElement('label');
      label.className = 'wr-data-grid-page-size';
      const caption = document.createElement('span');
      caption.textContent = labels.pageSize;
      const select = document.createElement('select');
      const options = configuration.pageSizeOptions.includes(this.#pageSize)
        ? configuration.pageSizeOptions
        : [...configuration.pageSizeOptions, this.#pageSize].sort((a, b) => a - b);
      for (const size of options) {
        const option = document.createElement('option');
        option.value = String(size);
        option.textContent = String(size);
        option.selected = size === this.#pageSize;
        select.append(option);
      }
      select.addEventListener('change', () => {
        this.pageSize = Number(select.value);
      });
      label.append(caption, select);
      pager.append(label);
    }
    const nav = document.createElement('nav');
    nav.className = 'wr-data-grid-pages';
    nav.setAttribute('aria-label', labels.pages);
    const pageButton = (
      text: string,
      ariaLabel: string,
      target: number,
      disabled: boolean,
      current = false,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = current
        ? 'wr-data-grid-page-button wr-data-grid-page-current'
        : 'wr-data-grid-page-button';
      button.textContent = text;
      button.setAttribute('aria-label', ariaLabel);
      button.disabled = disabled;
      if (current) button.setAttribute('aria-current', 'page');
      button.dataset.webradDataGridPage = String(target);
      button.addEventListener('click', () => this.goToPage(target));
      return button;
    };
    const page = this.#page;
    const pageCount = view.pageCount;
    nav.append(
      pageButton('«', labels.first, 1, page <= 1),
      pageButton('‹', labels.previous, page - 1, page <= 1),
    );
    for (const value of pageNumbers(page, pageCount)) {
      if (value === null) {
        const gap = document.createElement('span');
        gap.className = 'wr-data-grid-page-gap';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        nav.append(gap);
      } else {
        nav.append(pageButton(String(value), labels.page(value), value, false, value === page));
      }
    }
    nav.append(
      pageButton('›', labels.next, page + 1, page >= pageCount),
      pageButton('»', labels.last, pageCount, page >= pageCount),
    );
    pager.append(nav);
    return pager;
  }

  #render(): void {
    for (const toggle of this.#toggles) toggle.dispose();
    this.#toggles = [];
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    const document = this.element.ownerDocument;
    const configuration = this.#configuration;
    const sortColumn = configuration.sortEnabled ? this.#sortColumn() : undefined;
    const scroll = document.createElement('div');
    scroll.className = 'wr-data-grid-scroll';
    scroll.setAttribute('role', 'grid');
    scroll.setAttribute(
      'aria-label',
      this.element.getAttribute('aria-label') ?? (this.name || 'Data Grid'),
    );
    scroll.setAttribute('aria-colcount', String(configuration.columnCount));
    const content = document.createElement('div');
    content.className = [
      'wr-data-grid-content',
      configuration.stripedRows ? 'wr-data-grid-striped' : '',
      configuration.showHorizontalLines
        ? 'wr-data-grid-horizontal-lines'
        : 'wr-data-grid-no-horizontal-lines',
      configuration.showVerticalLines ? 'wr-data-grid-vertical-lines' : '',
      configuration.showFooter ? 'wr-data-grid-has-footer' : '',
    ]
      .filter((className) => className.length > 0)
      .join(' ');
    applyGridLayout(content, configuration, minimumGridWidth(configuration.columns));

    if (configuration.showHeader) {
      const header = document.createElement('div');
      header.className = [
        'wr-data-grid-row',
        'wr-data-grid-header-row',
        configuration.stickyHeader ? 'wr-data-grid-sticky-header' : '',
      ]
        .filter((className) => className.length > 0)
        .join(' ');
      header.setAttribute('role', 'row');
      header.setAttribute('aria-rowindex', '1');
      for (const [columnIndex, column] of configuration.columns.entries()) {
        const cell = appendGridCell(
          document,
          header,
          'wr-data-grid-cell wr-data-grid-header-cell',
          'columnheader',
          column,
          columnIndex,
        );
        cell.style.textAlign = column.headerAlign;
        if (
          configuration.sortEnabled &&
          column.sortable &&
          column.fieldPath.length > 0 &&
          (column.cellKind === 'text' ||
            column.cellKind === 'checkbox' ||
            column.cellKind === 'toggle')
        ) {
          const sorted = sortColumn?.id === column.id ? this.#sortDirection : null;
          cell.setAttribute(
            'aria-sort',
            sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none',
          );
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'wr-data-grid-sort-button';
          const caption = document.createElement('span');
          caption.className = 'wr-data-grid-sort-caption';
          caption.textContent = column.header;
          const indicator = document.createElement('span');
          indicator.className = 'wr-data-grid-sort-indicator';
          indicator.setAttribute('aria-hidden', 'true');
          indicator.textContent = sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕';
          button.append(caption, indicator);
          button.addEventListener('click', () => this.sortBy(column.id));
          cell.append(button);
        } else {
          cell.textContent = column.header;
        }
      }
      content.append(header);
    }

    const body = document.createElement('div');
    body.className = 'wr-data-grid-body';
    body.setAttribute('role', 'rowgroup');
    const view = this.#view();
    if (configuration.pagination !== 'server') this.#page = Math.min(this.#page, view.pageCount);
    const rows = view.rows;
    const headerRowCount = configuration.showHeader ? 1 : 0;
    const bodyRowCount = Math.max(1, rows.length);
    scroll.setAttribute(
      'aria-rowcount',
      String(headerRowCount + bodyRowCount + (configuration.showFooter ? 1 : 0)),
    );
    for (const [rowIndex, rowValue] of rows.entries()) {
      const row = document.createElement('div');
      row.className = 'wr-data-grid-row wr-data-grid-body-row';
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(rowIndex + headerRowCount + 1));
      for (const [columnIndex, column] of configuration.columns.entries()) {
        row.append(
          dataCell(
            document,
            column,
            rowValue,
            rowIndex,
            columnIndex,
            (value) => {
              this.emit('OnCellClick', {
                rowIndex,
                columnIndex,
                row: rowValue,
                column,
                value,
                getValue: <T = unknown>(fieldNameOrPath: string) =>
                  dataGridRowValue<T>(rowValue, fieldNameOrPath),
              } satisfies WebDataGridCellEventDetail);
            },
            this.#toggles,
          ),
        );
      }
      body.append(row);
    }
    if (rows.length === 0) {
      const row = document.createElement('div');
      row.className = 'wr-data-grid-row wr-data-grid-body-row';
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(headerRowCount + 1));
      const cell = document.createElement('div');
      cell.className = 'wr-data-grid-cell wr-data-grid-empty';
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-colindex', '1');
      cell.setAttribute('aria-colspan', String(configuration.columnCount));
      cell.style.gridColumn = `1 / span ${String(configuration.columnCount)}`;
      cell.textContent = configuration.emptyMessage;
      row.append(cell);
      body.append(row);
    }
    content.append(body);

    if (configuration.showFooter) {
      const footer = document.createElement('div');
      footer.className = [
        'wr-data-grid-row',
        'wr-data-grid-footer-row',
        configuration.stickyFooter ? 'wr-data-grid-sticky-footer' : '',
      ]
        .filter((className) => className.length > 0)
        .join(' ');
      footer.setAttribute('role', 'row');
      footer.setAttribute('aria-rowindex', String(headerRowCount + bodyRowCount + 1));
      for (const [columnIndex, column] of configuration.columns.entries()) {
        const cell = appendGridCell(
          document,
          footer,
          'wr-data-grid-cell wr-data-grid-footer-cell',
          'gridcell',
          column,
          columnIndex,
        );
        cell.textContent = column.footer;
      }
      content.append(footer);
    }

    scroll.append(content);
    const pager = this.#renderPager(document, view);
    // The toolbar node is kept so the search box never loses focus while typing.
    for (const child of Array.from(this.element.childNodes)) {
      if (child !== this.#toolbar) child.remove();
    }
    if (this.#toolbar !== null && this.#toolbar.parentNode !== this.element) {
      this.element.prepend(this.#toolbar);
    }
    this.element.append(scroll);
    if (pager !== null) this.element.append(pager);
    const updateColumnTracks = (): void => {
      applyGridLayout(
        content,
        configuration,
        Math.max(scroll.clientWidth, minimumGridWidth(configuration.columns)),
      );
    };
    updateColumnTracks();
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(updateColumnTracks);
      this.#resizeObserver.observe(scroll);
    }
  }

  public override dispose(): void {
    if (this.#searchTimer !== null) clearTimeout(this.#searchTimer);
    this.#searchTimer = null;
    this.#serverRequest += 1;
    for (const toggle of this.#toggles) toggle.dispose();
    this.#toggles = [];
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    super.dispose();
  }
}
