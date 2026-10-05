import type { WebApiClient } from './api-client.js';
import { WebComponent } from './component.js';
import { createWebRadIconElement, isWebRadIconName, type WebRadIconName } from './icons.js';
import { resolveDataGridColumnTrackWidths } from './visual.js';

export const WEB_DATA_GRID_CELL_KINDS = ['text', 'image', 'button', 'checkbox'] as const;
export type WebDataGridCellKind = (typeof WEB_DATA_GRID_CELL_KINDS)[number];

export const WEB_DATA_GRID_COLUMN_WIDTH_MODES = ['fixed', 'dynamic'] as const;
export type WebDataGridColumnWidthMode = (typeof WEB_DATA_GRID_COLUMN_WIDTH_MODES)[number];

export const WEB_DATA_GRID_ROW_HEIGHT_MODES = ['fixed', 'dynamic'] as const;
export type WebDataGridRowHeightMode = (typeof WEB_DATA_GRID_ROW_HEIGHT_MODES)[number];

export const WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type WebDataGridHorizontalAlignment = (typeof WEB_DATA_GRID_HORIZONTAL_ALIGNMENTS)[number];

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
      kind === 'image' || kind === 'button' || kind === 'checkbox' || kind === 'text'
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
          },
        ];
  const minRowHeight = finiteNumberInRange(source.minRowHeight, 36, 0, 10_000);
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
  };
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

/**
 * A visual grid which projects the latest result of a configured named
 * WebApiClient operation. It never triggers a request; authored page code owns
 * execution through `api.execute(...)`.
 */
export class WebDataGrid extends WebComponent<HTMLDivElement> {
  #configuration: WebDataGridConfiguration = normalizeWebDataGridConfiguration(undefined);
  #apiClient: WebApiClient | null = null;
  #unsubscribe: (() => void) | null = null;
  #resizeObserver: ResizeObserver | null = null;

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
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    const document = this.element.ownerDocument;
    const configuration = this.#configuration;
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
        cell.textContent = column.header;
      }
      content.append(header);
    }

    const body = document.createElement('div');
    body.className = 'wr-data-grid-body';
    body.setAttribute('role', 'rowgroup');
    const rows = this.#rows();
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
          dataCell(document, column, rowValue, rowIndex, columnIndex, (value) => {
            this.emit('OnCellClick', {
              rowIndex,
              columnIndex,
              row: rowValue,
              column,
              value,
              getValue: <T = unknown>(fieldNameOrPath: string) =>
                dataGridRowValue<T>(rowValue, fieldNameOrPath),
            } satisfies WebDataGridCellEventDetail);
          }),
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
    this.element.replaceChildren(scroll);
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
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    super.dispose();
  }
}
