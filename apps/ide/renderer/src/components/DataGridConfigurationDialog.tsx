import {
  createDefaultDataGridConfiguration,
  normalizeApiClientConfiguration,
  normalizeDataGridConfiguration,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
  type DataGridCellKind,
  type DataGridColumn,
  type DataGridColumnWidthMode,
  type DataGridConfiguration,
  type DataGridHorizontalAlignment,
  type DataGridRowHeightMode,
} from '@webrad/project-model';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

export interface DataGridConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (configuration: DataGridConfiguration) => void;
}

interface SchemaChoice {
  readonly path: string;
  readonly label: string;
}

const CELL_KIND_LABELS: Readonly<Record<DataGridCellKind, string>> = {
  text: 'Text',
  image: 'Image',
  button: 'Button',
  checkbox: 'Checkbox',
};

const HORIZONTAL_ALIGNMENT_LABELS: Readonly<Record<DataGridHorizontalAlignment, string>> = {
  start: 'Start',
  center: 'Center',
  end: 'End',
};

function createStableId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function createColumn(sequence: number): DataGridColumn {
  const template = createDefaultDataGridConfiguration().columns[0];
  if (template === undefined) throw new Error('A default Data Grid must include one column.');
  return {
    ...template,
    id: createStableId('column'),
    header: `Column ${String(sequence)}`,
  };
}

function createDraft(value: unknown): DataGridConfiguration {
  return normalizeDataGridConfiguration(value);
}

function collectListChoices(node: ApiClientSchemaNode, target: SchemaChoice[]): void {
  if (node.kind === 'list') target.push({ path: node.path, label: node.name || 'Response' });
  node.children.forEach((child) => collectListChoices(child, target));
}

function findNode(node: ApiClientSchemaNode, path: string): ApiClientSchemaNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children) {
    const found = findNode(child, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

function relativeItemPath(listPath: string, fieldPath: string): string | undefined {
  const prefix = listPath.length === 0 ? '/*' : `${listPath}/*`;
  if (fieldPath === prefix) return '';
  if (!fieldPath.startsWith(`${prefix}/`)) return undefined;
  return fieldPath.slice(prefix.length);
}

function collectFieldChoices(
  node: ApiClientSchemaNode,
  listPath: string,
  target: SchemaChoice[],
): void {
  const fieldPath = relativeItemPath(listPath, node.path);
  if (fieldPath !== undefined && node.kind === 'field') {
    target.push({ path: fieldPath, label: node.name });
  }
  node.children.forEach((child) => collectFieldChoices(child, listPath, target));
}

function operationSchemaChoices(
  schema: ApiClientResponseSchema | null | undefined,
  listPath: string,
): readonly SchemaChoice[] {
  if (schema === null || schema === undefined) return [];
  const listNode = findNode(schema.root, listPath);
  if (listNode?.kind !== 'list') return [];
  const choices: SchemaChoice[] = [];
  listNode.children.forEach((child) => collectFieldChoices(child, listPath, choices));
  return choices;
}

/**
 * Field paths are relative to the currently selected response-list item. A
 * path that belonged to another API, endpoint, or list would silently render
 * empty cells at runtime, so retain only bindings represented by the current
 * contract. The empty path remains a deliberate, safe "whole item" choice.
 */
function reconcileColumnFieldPaths(
  columns: readonly DataGridColumn[],
  schema: ApiClientResponseSchema | null | undefined,
  listPath: string,
): readonly DataGridColumn[] {
  const supportedPaths = new Set(
    operationSchemaChoices(schema, listPath).map((choice) => choice.path),
  );
  let changed = false;
  const reconciled = columns.map((column) => {
    if (column.fieldPath.length === 0 || supportedPaths.has(column.fieldPath)) return column;
    changed = true;
    return { ...column, fieldPath: '' };
  });
  return changed ? reconciled : columns;
}

function fieldPlaceholder(
  operation: { readonly responseSchema: ApiClientResponseSchema | null } | undefined,
): string {
  if (operation === undefined) return '(select an endpoint first)';
  if (operation.responseSchema === null) return '(endpoint has no response contract)';
  return '(whole list item)';
}

function numberFromInput(value: string, minimum: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : undefined;
}

interface NumericInputProps {
  readonly ariaLabel: string;
  readonly value: number | null;
  readonly min: number;
  readonly max?: number;
  readonly nullable?: boolean;
  readonly placeholder?: string;
  readonly onValueChange: (value: number | null) => void;
}

/**
 * A number input must permit a temporarily empty value while someone replaces
 * the current number. The model draft is updated only with valid values, so a
 * partially typed number can never be persisted by Save.
 */
function NumericInput({
  ariaLabel,
  value,
  min,
  max,
  nullable = false,
  placeholder,
  onValueChange,
}: NumericInputProps): ReactElement {
  const [text, setText] = useState(value === null ? '' : String(value));
  const previousValueRef = useRef<number | null>(value);

  useEffect(() => {
    if (previousValueRef.current === value) return;
    previousValueRef.current = value;
    setText(value === null ? '' : String(value));
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      type="number"
      min={min}
      max={max}
      step="any"
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        const nextText = event.currentTarget.value;
        setText(nextText);
        if (nextText.length === 0) {
          if (nullable) onValueChange(null);
          return;
        }
        const parsed = numberFromInput(nextText, min);
        if (parsed !== undefined && (max === undefined || parsed <= max)) onValueChange(parsed);
      }}
      onBlur={() => {
        if (text.length === 0 && nullable) return;
        const parsed = numberFromInput(text, min);
        if (parsed === undefined || (max !== undefined && parsed > max)) {
          setText(value === null ? '' : String(value));
        }
      }}
    />
  );
}

function moveItem<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}

/**
 * A dedicated, transactional editor for a WebDataGrid. Its draft only leaves
 * the dialog when Save is pressed, keeping Cancel and Escape non-destructive.
 */
export function DataGridConfigurationDialog({
  component,
  availableComponents,
  onClose,
  onSave,
}: DataGridConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const apiClientRef = useRef<HTMLSelectElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [draft, setDraft] = useState<DataGridConfiguration>(() =>
    createDraft(component.props.dataGridConfig),
  );

  const apiClients = availableComponents.filter((candidate) => candidate.type === 'WebApiClient');
  const apiClient = apiClients.find((candidate) => candidate.id === draft.apiClientId);
  const apiConfiguration =
    apiClient === undefined
      ? undefined
      : normalizeApiClientConfiguration(apiClient.props.apiClientConfig);
  const operation = apiConfiguration?.operations.find(
    (candidate) => candidate.id === draft.operationId,
  );
  const listChoices: SchemaChoice[] = [];
  if (operation?.responseSchema !== null && operation?.responseSchema !== undefined) {
    collectListChoices(operation.responseSchema.root, listChoices);
  }
  const fieldChoices = operationSchemaChoices(operation?.responseSchema, draft.listPath);

  useEffect(() => {
    apiClientRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const updateDraft = (update: (current: DataGridConfiguration) => DataGridConfiguration): void => {
    setDraft(update);
  };

  const updateColumn = (
    index: number,
    update: (current: DataGridColumn) => DataGridColumn,
  ): void => {
    updateDraft((current) => {
      const column = current.columns[index];
      if (column === undefined) return current;
      return {
        ...current,
        columns: current.columns.map((candidate, candidateIndex) =>
          candidateIndex === index ? update(candidate) : candidate,
        ),
      };
    });
  };

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSave({
      ...draft,
      columns: reconcileColumnFieldPaths(draft.columns, operation?.responseSchema, draft.listPath),
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-data-grid-configuration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Data Grid / {component.name}</span>
            <h2 id={titleId}>Configure Data Grid</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Data Grid configuration"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form className="wr-data-grid-configuration-form" onSubmit={save}>
          <div className="wr-data-grid-configuration-content">
            <p className="wr-modal-description" id={descriptionId}>
              Bind a response list and tailor the grid's columns, row sizing, and presentation.
              Changes stay in this dialog until you save them.
            </p>

            <section
              className="wr-data-grid-configuration-section"
              aria-labelledby={`${titleId}-source`}
            >
              <h3 id={`${titleId}-source`}>Data source</h3>
              <div className="wr-data-grid-configuration-fields three-columns">
                <label>
                  <span>API Client</span>
                  <select
                    ref={apiClientRef}
                    aria-label="Data Grid API Client"
                    value={draft.apiClientId ?? ''}
                    onChange={(event) => {
                      const apiClientId = event.currentTarget.value || null;
                      updateDraft((current) => {
                        const listPath = '';
                        return {
                          ...current,
                          apiClientId,
                          operationId: null,
                          listPath,
                          columns: reconcileColumnFieldPaths(current.columns, undefined, listPath),
                        };
                      });
                    }}
                  >
                    <option value="">(select an API Client)</option>
                    {apiClients.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <select
                    aria-label="Data Grid endpoint"
                    disabled={apiConfiguration === undefined}
                    value={draft.operationId ?? ''}
                    onChange={(event) => {
                      const operationId = event.currentTarget.value || null;
                      const nextOperation = apiConfiguration?.operations.find(
                        (candidate) => candidate.id === operationId,
                      );
                      updateDraft((current) => {
                        const listPath = '';
                        return {
                          ...current,
                          operationId,
                          listPath,
                          columns: reconcileColumnFieldPaths(
                            current.columns,
                            nextOperation?.responseSchema,
                            listPath,
                          ),
                        };
                      });
                    }}
                  >
                    <option value="">(select an endpoint)</option>
                    {apiConfiguration?.operations.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} — {candidate.method} {candidate.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Response list</span>
                  <select
                    aria-label="Data Grid response list"
                    disabled={operation === undefined}
                    value={draft.listPath}
                    onChange={(event) => {
                      const listPath = event.currentTarget.value;
                      updateDraft((current) => ({
                        ...current,
                        listPath,
                        columns: reconcileColumnFieldPaths(
                          current.columns,
                          operation?.responseSchema,
                          listPath,
                        ),
                      }));
                    }}
                  >
                    {!listChoices.some((choice) => choice.path.length === 0) && (
                      <option value="">(select a list)</option>
                    )}
                    {listChoices.map((choice) => (
                      <option key={choice.path || 'root'} value={choice.path}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section
              className="wr-data-grid-configuration-section"
              aria-labelledby={`${titleId}-rows`}
            >
              <h3 id={`${titleId}-rows`}>Rows and appearance</h3>
              <div className="wr-data-grid-configuration-fields five-columns">
                <label>
                  <span>Row height</span>
                  <select
                    aria-label="Data Grid row height mode"
                    value={draft.rowHeightMode}
                    onChange={(event) => {
                      const rowHeightMode = event.currentTarget.value as DataGridRowHeightMode;
                      updateDraft((current) => ({ ...current, rowHeightMode }));
                    }}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="dynamic">Dynamic</option>
                  </select>
                </label>
                {draft.rowHeightMode === 'fixed' ? (
                  <label>
                    <span>Fixed row height (px)</span>
                    <NumericInput
                      ariaLabel="Fixed Data Grid row height"
                      min={1}
                      max={10_000}
                      value={draft.fixedRowHeight}
                      onValueChange={(fixedRowHeight) => {
                        if (fixedRowHeight === null) return;
                        updateDraft((current) => ({ ...current, fixedRowHeight }));
                      }}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>Minimum row height (px)</span>
                      <NumericInput
                        ariaLabel="Minimum Data Grid row height"
                        min={0}
                        max={10_000}
                        value={draft.minRowHeight}
                        onValueChange={(minRowHeight) => {
                          if (minRowHeight === null) return;
                          updateDraft((current) => ({
                            ...current,
                            minRowHeight,
                            maxRowHeight:
                              current.maxRowHeight !== null && current.maxRowHeight < minRowHeight
                                ? Math.max(1, minRowHeight)
                                : current.maxRowHeight,
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <span>Maximum row height (px)</span>
                      <NumericInput
                        ariaLabel="Maximum Data Grid row height"
                        min={Math.max(1, draft.minRowHeight)}
                        max={10_000}
                        placeholder="No limit"
                        nullable
                        value={draft.maxRowHeight}
                        onValueChange={(maxRowHeight) => {
                          updateDraft((current) => ({ ...current, maxRowHeight }));
                        }}
                      />
                    </label>
                  </>
                )}
                <label>
                  <span>Horizontal cell padding (px)</span>
                  <NumericInput
                    ariaLabel="Data Grid horizontal cell padding"
                    min={0}
                    max={10_000}
                    value={draft.cellPaddingHorizontal}
                    onValueChange={(cellPaddingHorizontal) => {
                      if (cellPaddingHorizontal === null) return;
                      updateDraft((current) => ({ ...current, cellPaddingHorizontal }));
                    }}
                  />
                </label>
                <label>
                  <span>Vertical cell padding (px)</span>
                  <NumericInput
                    ariaLabel="Data Grid vertical cell padding"
                    min={0}
                    max={10_000}
                    value={draft.cellPaddingVertical}
                    onValueChange={(cellPaddingVertical) => {
                      if (cellPaddingVertical === null) return;
                      updateDraft((current) => ({ ...current, cellPaddingVertical }));
                    }}
                  />
                </label>
              </div>
              <div className="wr-data-grid-configuration-toggles">
                <label>
                  <input
                    aria-label="Show Data Grid header"
                    checked={draft.showHeader}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        showHeader: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Show header</span>
                </label>
                <label>
                  <input
                    aria-label="Keep Data Grid header fixed"
                    checked={draft.stickyHeader}
                    disabled={!draft.showHeader}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        stickyHeader: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Keep header fixed</span>
                </label>
                <label>
                  <input
                    aria-label="Show Data Grid footer"
                    checked={draft.showFooter}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        showFooter: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Show fixed footer row</span>
                </label>
                <label>
                  <input
                    aria-label="Keep Data Grid footer fixed"
                    checked={draft.stickyFooter}
                    disabled={!draft.showFooter}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        stickyFooter: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Keep footer fixed</span>
                </label>
                <label>
                  <input
                    aria-label="Wrap Data Grid text"
                    checked={draft.wrapText}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        wrapText: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Wrap cell text</span>
                </label>
                <label>
                  <input
                    aria-label="Stripe Data Grid rows"
                    checked={draft.stripedRows}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        stripedRows: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Stripe alternate rows</span>
                </label>
                <label>
                  <input
                    aria-label="Show Data Grid horizontal lines"
                    checked={draft.showHorizontalLines}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        showHorizontalLines: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Show horizontal lines</span>
                </label>
                <label>
                  <input
                    aria-label="Show Data Grid vertical lines"
                    checked={draft.showVerticalLines}
                    type="checkbox"
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        showVerticalLines: event.currentTarget.checked,
                      }))
                    }
                  />
                  <span>Show vertical lines</span>
                </label>
              </div>
              <label className="wr-data-grid-configuration-empty-message">
                <span>Empty-state message</span>
                <input
                  aria-label="Data Grid empty-state message"
                  value={draft.emptyMessage}
                  maxLength={4_096}
                  spellCheck={false}
                  onChange={(event) => {
                    const emptyMessage = event.currentTarget.value;
                    updateDraft((current) => ({ ...current, emptyMessage }));
                  }}
                />
              </label>
            </section>

            <section
              className="wr-data-grid-configuration-section"
              aria-labelledby={`${titleId}-columns`}
            >
              <div className="wr-data-grid-configuration-section-heading">
                <div>
                  <h3 id={`${titleId}-columns`}>Columns</h3>
                  <p>Choose the binding and layout rule for each rendered column.</p>
                </div>
                <button
                  type="button"
                  disabled={draft.columns.length >= 50}
                  onClick={() => {
                    updateDraft((current) => {
                      const columns = [
                        ...current.columns,
                        createColumn(current.columns.length + 1),
                      ];
                      return { ...current, columns, columnCount: columns.length };
                    });
                  }}
                >
                  Add column
                </button>
              </div>
              <div className="wr-data-grid-column-list" aria-label="Data Grid columns">
                {draft.columns.map((column, index) => (
                  <section
                    className="wr-data-grid-column-card"
                    key={column.id}
                    aria-labelledby={`${titleId}-column-${column.id}`}
                  >
                    <header>
                      <h4 id={`${titleId}-column-${column.id}`}>Column {String(index + 1)}</h4>
                      <div className="wr-data-grid-column-actions">
                        <button
                          type="button"
                          aria-label={`Move Data Grid column ${String(index + 1)} up`}
                          disabled={index === 0}
                          onClick={() => {
                            updateDraft((current) => ({
                              ...current,
                              columns: moveItem(current.columns, index, index - 1),
                            }));
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          aria-label={`Move Data Grid column ${String(index + 1)} down`}
                          disabled={index === draft.columns.length - 1}
                          onClick={() => {
                            updateDraft((current) => ({
                              ...current,
                              columns: moveItem(current.columns, index, index + 1),
                            }));
                          }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove Data Grid column ${String(index + 1)}`}
                          disabled={draft.columns.length === 1}
                          onClick={() => {
                            updateDraft((current) => {
                              const columns = current.columns.filter(
                                (candidate) => candidate.id !== column.id,
                              );
                              return { ...current, columns, columnCount: columns.length };
                            });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </header>
                    <div
                      className={`wr-data-grid-configuration-fields ${
                        column.cellKind === 'button' || column.cellKind === 'checkbox'
                          ? 'five-columns'
                          : 'four-columns'
                      }`}
                    >
                      <label>
                        <span>Header</span>
                        <input
                          aria-label={`Header for Data Grid column ${String(index + 1)}`}
                          value={column.header}
                          maxLength={256}
                          spellCheck={false}
                          onChange={(event) => {
                            const header = event.currentTarget.value;
                            updateColumn(index, (current) => ({ ...current, header }));
                          }}
                        />
                      </label>
                      <label>
                        <span>Cell type</span>
                        <select
                          aria-label={`Cell type for Data Grid column ${String(index + 1)}`}
                          value={column.cellKind}
                          onChange={(event) => {
                            const cellKind = event.currentTarget.value as DataGridCellKind;
                            updateColumn(index, (current) => ({ ...current, cellKind }));
                          }}
                        >
                          {Object.entries(CELL_KIND_LABELS).map(([kind, label]) => (
                            <option key={kind} value={kind}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Field</span>
                        <select
                          aria-label={`Dynamic field for Data Grid column ${String(index + 1)}`}
                          value={column.fieldPath}
                          onChange={(event) => {
                            const fieldPath = event.currentTarget.value;
                            updateColumn(index, (current) => ({ ...current, fieldPath }));
                          }}
                        >
                          <option value="">{fieldPlaceholder(operation)}</option>
                          {fieldChoices.map((choice) => (
                            <option key={choice.path} value={choice.path}>
                              {choice.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(column.cellKind === 'button' || column.cellKind === 'checkbox') && (
                        <label>
                          <span>Fixed caption</span>
                          <input
                            aria-label={`Fixed caption for Data Grid column ${String(index + 1)}`}
                            value={column.fixedCaption}
                            maxLength={256}
                            placeholder={
                              column.cellKind === 'button'
                                ? 'Use dynamic field value'
                                : 'Optional checkbox label'
                            }
                            spellCheck={false}
                            onChange={(event) => {
                              const fixedCaption = event.currentTarget.value;
                              updateColumn(index, (current) => ({ ...current, fixedCaption }));
                            }}
                          />
                        </label>
                      )}
                      <label>
                        <span>Footer</span>
                        <input
                          aria-label={`Footer for Data Grid column ${String(index + 1)}`}
                          value={column.footer}
                          maxLength={4_096}
                          spellCheck={false}
                          onChange={(event) => {
                            const footer = event.currentTarget.value;
                            updateColumn(index, (current) => ({ ...current, footer }));
                          }}
                        />
                      </label>
                    </div>
                    <div className="wr-data-grid-configuration-fields four-columns">
                      <label>
                        <span>Column width</span>
                        <select
                          aria-label={`Width mode for Data Grid column ${String(index + 1)}`}
                          value={column.widthMode}
                          onChange={(event) => {
                            const widthMode = event.currentTarget.value as DataGridColumnWidthMode;
                            updateColumn(index, (current) => ({ ...current, widthMode }));
                          }}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="dynamic">Dynamic</option>
                        </select>
                      </label>
                      {column.widthMode === 'fixed' ? (
                        <label>
                          <span>Fixed width (px)</span>
                          <NumericInput
                            ariaLabel={`Fixed width for Data Grid column ${String(index + 1)}`}
                            min={1}
                            max={10_000}
                            value={column.width}
                            onValueChange={(width) => {
                              if (width === null) return;
                              updateColumn(index, (current) => ({ ...current, width }));
                            }}
                          />
                        </label>
                      ) : (
                        <>
                          <label>
                            <span>Minimum width (px)</span>
                            <NumericInput
                              ariaLabel={`Minimum width for Data Grid column ${String(index + 1)}`}
                              min={1}
                              max={10_000}
                              value={column.minWidth}
                              onValueChange={(minWidth) => {
                                if (minWidth === null) return;
                                updateColumn(index, (current) => ({
                                  ...current,
                                  minWidth,
                                  maxWidth:
                                    current.maxWidth !== null && current.maxWidth < minWidth
                                      ? minWidth
                                      : current.maxWidth,
                                }));
                              }}
                            />
                          </label>
                          <label>
                            <span>Maximum width (px)</span>
                            <NumericInput
                              ariaLabel={`Maximum width for Data Grid column ${String(index + 1)}`}
                              min={column.minWidth}
                              max={10_000}
                              placeholder="No limit"
                              nullable
                              value={column.maxWidth}
                              onValueChange={(maxWidth) => {
                                updateColumn(index, (current) => ({ ...current, maxWidth }));
                              }}
                            />
                          </label>
                          <label>
                            <span>Flex grow</span>
                            <NumericInput
                              ariaLabel={`Flex grow for Data Grid column ${String(index + 1)}`}
                              min={0.1}
                              max={100}
                              value={column.flex}
                              onValueChange={(flex) => {
                                if (flex === null) return;
                                updateColumn(index, (current) => ({ ...current, flex }));
                              }}
                            />
                          </label>
                        </>
                      )}
                      <label>
                        <span>Header alignment</span>
                        <select
                          aria-label={`Header alignment for Data Grid column ${String(index + 1)}`}
                          value={column.headerAlign}
                          onChange={(event) => {
                            const headerAlign = event.currentTarget
                              .value as DataGridHorizontalAlignment;
                            updateColumn(index, (current) => ({ ...current, headerAlign }));
                          }}
                        >
                          {Object.entries(HORIZONTAL_ALIGNMENT_LABELS).map(([alignment, label]) => (
                            <option key={alignment} value={alignment}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Cell alignment</span>
                        <select
                          aria-label={`Cell alignment for Data Grid column ${String(index + 1)}`}
                          value={column.cellAlign}
                          onChange={(event) => {
                            const cellAlign = event.currentTarget
                              .value as DataGridHorizontalAlignment;
                            updateColumn(index, (current) => ({ ...current, cellAlign }));
                          }}
                        >
                          {Object.entries(HORIZONTAL_ALIGNMENT_LABELS).map(([alignment, label]) => (
                            <option key={alignment} value={alignment}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </div>
          <footer className="wr-modal-actions wr-data-grid-configuration-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Save Data Grid
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
