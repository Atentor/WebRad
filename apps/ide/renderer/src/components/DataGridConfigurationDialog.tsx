import { ProjectIconGraphic } from './ProjectIconGraphic';
import {
  comboBoxSchemaChoices,
  createDefaultDataGridConfiguration,
  normalizeApiClientConfiguration,
  normalizeDataGridConfiguration,
  selectComponentGraphQLOperations,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
  type DataGridCellKind,
  type DataGridColumn,
  type DataGridColumnWidthMode,
  type DataGridConfiguration,
  type DataGridGraphQLBinding,
  type DataGridHorizontalAlignment,
  type DataGridRowHeightMode,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import {
  normalizeWebDataGridEditorFieldLabels,
  normalizeWebDataGridLabels,
} from '@webrad/runtime/data-grid-labels';
import { WEBRAD_ICON_NAMES, webRadIconLabel } from '@webrad/runtime/icons';
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
import { Icon } from './Icon';
import { IconPickerDialog } from './IconPickerDialog';
import { DataGridGraphQLSettings } from './DataGridGraphQLSettings';
import { DataGridLabelsSettings } from './DataGridLabelsSettings';
import {
  ApiClientOperationOptions,
  apiEndpointOption,
  graphqlQueryOption,
} from './ApiClientOperationOptions';

export interface DataGridConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly graphQLOperations?: readonly ProjectGraphQLOperation[];
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
  toggle: 'Toggle',
};

const HORIZONTAL_ALIGNMENT_LABELS: Readonly<Record<DataGridHorizontalAlignment, string>> = {
  start: 'Start',
  center: 'Center',
  end: 'End',
};

const CONFIGURATION_TABS = [
  { id: 'source', label: 'Data source' },
  { id: 'columns', label: 'Columns' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'labels', label: 'Labels' },
] as const;

type ConfigurationTab = (typeof CONFIGURATION_TABS)[number]['id'];

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

function newGraphQLBinding(
  clientId: string | null,
  query?: ProjectGraphQLOperation,
): DataGridGraphQLBinding {
  return {
    clientId,
    pageSize: query?.runtime.pagination?.defaultSize ?? 10,
    showPager: true,
    crudEnabled: false,
    insertOperationId: null,
    updateOperationId: null,
    deleteOperationId: null,
  };
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
 * contract. The empty path remains a deliberate, safe unbound choice.
 */
function reconcileColumnFieldPaths(
  columns: readonly DataGridColumn[],
  fields: readonly SchemaChoice[],
): readonly DataGridColumn[] {
  const supportedPaths = new Set(fields.map((choice) => choice.path));
  let changed = false;
  const reconciled = columns.map((column) => {
    if (column.fieldPath.length === 0 || supportedPaths.has(column.fieldPath)) return column;
    changed = true;
    return { ...column, fieldPath: '' };
  });
  return changed ? reconciled : columns;
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
        if (text.length === 0) {
          if (!nullable) setText(value === null ? '' : String(value));
          return;
        }
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
  graphQLOperations = [],
  onClose,
  onSave,
}: DataGridConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const columnListRef = useRef<HTMLUListElement | null>(null);
  const sourceRef = useRef<HTMLSelectElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [draft, setDraft] = useState<DataGridConfiguration>(() =>
    createDraft(component.props.dataGridConfig),
  );
  const [activeTab, setActiveTab] = useState<ConfigurationTab>('source');
  const [selectedColumnId, setSelectedColumnId] = useState(() => draft.columns[0]?.id);
  const focusColumnRef = useRef(false);
  const [iconPickerColumnId, setIconPickerColumnId] = useState<string | null>(null);

  const index = draft.columns.findIndex((column) => column.id === selectedColumnId);
  const column = draft.columns[index];

  const graphQL = draft.graphql;
  const sourceMode = graphQL === undefined ? 'api-client' : 'graphql-client';
  const clientLabel = graphQL === undefined ? 'API Client' : 'GraphQL Client';
  const sourceId = graphQL === undefined ? draft.apiClientId : graphQL.clientId;
  const clients = availableComponents.filter(
    (candidate) => candidate.type === (graphQL === undefined ? 'WebApiClient' : 'WebGraphQLClient'),
  );
  const client = clients.find((candidate) => candidate.id === sourceId);
  const apiConfiguration =
    graphQL === undefined && client !== undefined
      ? normalizeApiClientConfiguration(client.props.apiClientConfig)
      : undefined;
  const endpoints = apiConfiguration?.operations ?? [];
  const clientGraphQLOperations =
    client === undefined || graphQL === undefined
      ? []
      : selectComponentGraphQLOperations(client, graphQLOperations);
  const queries = clientGraphQLOperations.filter((candidate) => candidate.runtime.kind === 'query');
  const query = queries.find((candidate) => candidate.id === draft.operationId);
  const operation = endpoints.find((candidate) => candidate.id === draft.operationId);
  const listChoices: SchemaChoice[] = [];
  if (operation?.responseSchema !== null && operation?.responseSchema !== undefined) {
    collectListChoices(operation.responseSchema.root, listChoices);
  }
  const fieldChoices =
    graphQL === undefined
      ? operationSchemaChoices(operation?.responseSchema, draft.listPath)
      : comboBoxSchemaChoices(query?.responseSchema, '').fields;
  const iconPickerColumn =
    iconPickerColumnId === null
      ? undefined
      : draft.columns.find(
          (column) => column.id === iconPickerColumnId && column.cellKind === 'button',
        );

  useEffect(() => {
    sourceRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'columns') return;
    const selected = columnListRef.current?.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]',
    );
    if (focusColumnRef.current) selected?.focus();
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    focusColumnRef.current = false;
  }, [activeTab, index, selectedColumnId]);

  const activateTab = (tab: ConfigurationTab): void => {
    setActiveTab(tab);
    if (contentRef.current !== null) contentRef.current.scrollTop = 0;
  };

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const currentIndex = CONFIGURATION_TABS.findIndex((tab) => tab.id === activeTab);
    const count = CONFIGURATION_TABS.length;
    const destinations: Partial<Record<string, number>> = {
      ArrowLeft: (currentIndex + count - 1) % count,
      ArrowRight: (currentIndex + 1) % count,
      Home: 0,
      End: count - 1,
    };
    const nextIndex = destinations[event.key];
    if (nextIndex === undefined) return;
    const nextTab = CONFIGURATION_TABS[nextIndex];
    if (nextTab === undefined) return;
    event.preventDefault();
    activateTab(nextTab.id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[nextIndex]?.focus();
  };

  const selectColumn = (id: string | undefined, focus = false): void => {
    focusColumnRef.current = focus;
    setSelectedColumnId(id);
    if (contentRef.current !== null) contentRef.current.scrollTop = 0;
  };

  const handleColumnKeys = (event: KeyboardEvent<HTMLUListElement>): void => {
    const destinations: Partial<Record<string, number>> = {
      ArrowUp: Math.max(0, index - 1),
      ArrowDown: Math.min(draft.columns.length - 1, index + 1),
      Home: 0,
      End: draft.columns.length - 1,
    };
    const nextIndex = destinations[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    if (nextIndex !== index) selectColumn(draft.columns[nextIndex]?.id, true);
  };

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
    const { labels, editorFieldLabels, ...configuration } = draft;
    const customLabels = normalizeWebDataGridLabels(labels);
    const customFieldLabels = normalizeWebDataGridEditorFieldLabels(editorFieldLabels);
    onSave({
      ...configuration,
      ...(Object.keys(customLabels).length === 0 ? {} : { labels: customLabels }),
      ...(Object.keys(customFieldLabels).length === 0
        ? {}
        : { editorFieldLabels: customFieldLabels }),
      columns: reconcileColumnFieldPaths(draft.columns, fieldChoices),
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
    ].filter((control) => control.tabIndex >= 0 && control.closest('[hidden]') === null);
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
        className="wr-modal wr-data-grid-configuration-dialog wr-data-grid-tabbed-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div className="wr-data-grid-configuration-title">
            <span className="wr-data-grid-configuration-title-icon">
              <Icon name="table" />
            </span>
            <div>
              <span className="wr-modal-eyebrow">Data Grid / {component.name}</span>
              <h2 id={titleId}>Configure Data Grid</h2>
            </div>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Data Grid configuration"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form className="wr-data-grid-configuration-form" onSubmit={save}>
          <div
            className="wr-data-grid-configuration-tabs"
            role="tablist"
            aria-label="Data Grid settings"
            onKeyDown={handleTabKeys}
          >
            {CONFIGURATION_TABS.map(({ id, label }) => (
              <button
                key={id}
                id={`${titleId}-tab-${id}`}
                type="button"
                role="tab"
                data-grid-tab={id}
                aria-selected={activeTab === id}
                aria-controls={`${titleId}-panel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => activateTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div ref={contentRef} className="wr-data-grid-configuration-content">
            <section
              className="wr-data-grid-tab-panel"
              id={`${titleId}-panel-source`}
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-source`}
              hidden={activeTab !== 'source'}
            >
              <p>Choose an API endpoint or a saved RestGo GraphQL query to load rows.</p>
              <div
                className={`wr-data-grid-configuration-fields ${graphQL === undefined ? 'four-columns' : 'three-columns'}`}
              >
                <label>
                  <span>Data source</span>
                  <select
                    ref={sourceRef}
                    aria-label="Data Grid data source"
                    value={sourceMode}
                    onChange={(event) => {
                      const mode = event.currentTarget.value;
                      updateDraft((current) => ({
                        ...current,
                        apiClientId: mode === 'graphql-client' ? null : current.apiClientId,
                        graphql: mode === 'api-client'
                          ? undefined
                          : newGraphQLBinding(null),
                        operationId: null,
                        listPath: '',
                        columns: reconcileColumnFieldPaths(current.columns, []),
                      }));
                    }}
                  >
                    <option value="api-client">API Client</option>
                    <option value="graphql-client">GraphQL Client</option>
                  </select>
                </label>
                <label>
                  <span>{clientLabel}</span>
                  <select
                    aria-label={`Data Grid ${clientLabel}`}
                    value={sourceId ?? ''}
                    onChange={(event) => {
                      const selectedId = event.currentTarget.value || null;
                      updateDraft((current) => ({
                        ...current,
                        apiClientId: graphQL === undefined ? selectedId : null,
                        graphql: graphQL === undefined
                          ? undefined
                          : newGraphQLBinding(selectedId),
                        operationId: null,
                        listPath: '',
                        columns: reconcileColumnFieldPaths(current.columns, []),
                      }));
                    }}
                  >
                    <option value="">(select a client)</option>
                    {sourceId !== null && client === undefined && (
                      <option value={sourceId} disabled>
                        (unavailable {clientLabel})
                      </option>
                    )}
                    {clients.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{graphQL === undefined ? 'Operation' : 'Query'}</span>
                  <select
                    aria-label={graphQL === undefined ? 'Data Grid operation' : 'Data Grid query'}
                    disabled={client === undefined}
                    value={
                      graphQL === undefined
                        ? apiEndpointOption(draft.operationId)
                        : graphqlQueryOption(draft.operationId)
                    }
                    onChange={(event) => {
                      if (sourceId === null) return;
                      const value = event.currentTarget.value;
                      const nextQuery = queries.find(
                        (candidate) => graphqlQueryOption(candidate.id) === value,
                      );
                      const nextEndpoint = endpoints.find(
                        (candidate) => apiEndpointOption(candidate.id) === value,
                      );
                      const fields =
                        graphQL === undefined
                          ? operationSchemaChoices(nextEndpoint?.responseSchema, '')
                          : comboBoxSchemaChoices(nextQuery?.responseSchema, '').fields;
                      updateDraft((current) => ({
                        ...current,
                        graphql: graphQL === undefined
                          ? undefined
                          : newGraphQLBinding(graphQL.clientId, nextQuery),
                        operationId: nextQuery?.id ?? nextEndpoint?.id ?? null,
                        listPath: '',
                        columns: reconcileColumnFieldPaths(current.columns, fields),
                      }));
                    }}
                  >
                    <ApiClientOperationOptions endpoints={endpoints} queries={queries} />
                  </select>
                </label>
                {graphQL === undefined && (
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
                            operationSchemaChoices(operation?.responseSchema, listPath),
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
                )}
              </div>
              {graphQL !== undefined && client !== undefined && queries.length === 0 && (
                <p>Configure a saved query in the selected {clientLabel}.</p>
              )}
              {graphQL !== undefined && draft.operationId !== null && (
                <DataGridGraphQLSettings
                  binding={graphQL}
                  query={query}
                  operations={clientGraphQLOperations}
                  onChange={(patch) =>
                    updateDraft((current) => ({ ...current, graphql: { ...graphQL, ...patch } }))
                  }
                />
              )}
            </section>

            <section
              className="wr-data-grid-tab-panel"
              id={`${titleId}-panel-appearance`}
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-appearance`}
              hidden={activeTab !== 'appearance'}
            >
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
                <fieldset className="wr-data-grid-toggle-group">
                  <legend>Header</legend>
                  <label>
                    <input
                      aria-label="Show Data Grid header"
                      checked={draft.showHeader}
                      type="checkbox"
                      onChange={(event) => {
                        const showHeader = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, showHeader }));
                      }}
                    />
                    <span>Show header</span>
                  </label>
                  <label>
                    <input
                      aria-label="Keep Data Grid header fixed"
                      checked={draft.stickyHeader}
                      disabled={!draft.showHeader}
                      type="checkbox"
                      onChange={(event) => {
                        const stickyHeader = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, stickyHeader }));
                      }}
                    />
                    <span>Keep header fixed</span>
                  </label>
                </fieldset>
                <fieldset className="wr-data-grid-toggle-group">
                  <legend>Footer</legend>
                  <label>
                    <input
                      aria-label="Show Data Grid footer"
                      checked={draft.showFooter}
                      type="checkbox"
                      onChange={(event) => {
                        const showFooter = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, showFooter }));
                      }}
                    />
                    <span>Show footer row</span>
                  </label>
                  <label>
                    <input
                      aria-label="Keep Data Grid footer fixed"
                      checked={draft.stickyFooter}
                      disabled={!draft.showFooter}
                      type="checkbox"
                      onChange={(event) => {
                        const stickyFooter = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, stickyFooter }));
                      }}
                    />
                    <span>Keep footer fixed</span>
                  </label>
                </fieldset>
                <fieldset className="wr-data-grid-toggle-group">
                  <legend>Content</legend>
                  <label>
                    <input
                      aria-label="Wrap Data Grid text"
                      checked={draft.wrapText}
                      type="checkbox"
                      onChange={(event) => {
                        const wrapText = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, wrapText }));
                      }}
                    />
                    <span>Wrap cell text</span>
                  </label>
                  <label>
                    <input
                      aria-label="Stripe Data Grid rows"
                      checked={draft.stripedRows}
                      type="checkbox"
                      onChange={(event) => {
                        const stripedRows = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, stripedRows }));
                      }}
                    />
                    <span>Stripe alternate rows</span>
                  </label>
                </fieldset>
                <fieldset className="wr-data-grid-toggle-group">
                  <legend>Grid lines</legend>
                  <label>
                    <input
                      aria-label="Show Data Grid horizontal lines"
                      checked={draft.showHorizontalLines}
                      type="checkbox"
                      onChange={(event) => {
                        const showHorizontalLines = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, showHorizontalLines }));
                      }}
                    />
                    <span>Show horizontal lines</span>
                  </label>
                  <label>
                    <input
                      aria-label="Show Data Grid vertical lines"
                      checked={draft.showVerticalLines}
                      type="checkbox"
                      onChange={(event) => {
                        const showVerticalLines = event.currentTarget.checked;
                        updateDraft((current) => ({ ...current, showVerticalLines }));
                      }}
                    />
                    <span>Show vertical lines</span>
                  </label>
                </fieldset>
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
              className="wr-data-grid-tab-panel"
              id={`${titleId}-panel-columns`}
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-columns`}
              hidden={activeTab !== 'columns'}
            >
              <div className="wr-data-grid-columns-layout">
                <aside className="wr-data-grid-column-sidebar" aria-label="Columns">
                  <button
                    className="wr-data-grid-add-column"
                    type="button"
                    disabled={draft.columns.length >= 50}
                    onClick={() => {
                      const newColumn = createColumn(draft.columns.length + 1);
                      updateDraft((current) => {
                        const columns = [...current.columns, newColumn];
                        return { ...current, columns, columnCount: columns.length };
                      });
                      selectColumn(newColumn.id, true);
                    }}
                  >
                    <Icon name="add" />
                    Add column
                  </button>
                  <ul
                    ref={columnListRef}
                    className="wr-data-grid-column-list"
                    role="listbox"
                    aria-label="Data Grid columns"
                    onKeyDown={handleColumnKeys}
                  >
                    {draft.columns.map((item, position) => (
                      <li key={item.id} role="presentation">
                        <button
                          className="wr-data-grid-column-option"
                          type="button"
                          role="option"
                          aria-selected={item.id === selectedColumnId}
                          tabIndex={item.id === selectedColumnId ? 0 : -1}
                          title={item.header || undefined}
                          onClick={() => selectColumn(item.id)}
                        >
                          <span>{item.header || `Column ${String(position + 1)}`}</span>
                          <small>{CELL_KIND_LABELS[item.cellKind]}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
                {column !== undefined && (
                  <section
                    className="wr-data-grid-column-card"
                    key={column.id}
                    aria-labelledby={`${titleId}-selected-column`}
                  >
                    <header>
                      <h3 id={`${titleId}-selected-column`}>
                        {column.header || `Column ${String(index + 1)}`}
                      </h3>
                      <div className="wr-data-grid-column-actions">
                        <button
                          type="button"
                          aria-label={`Move Data Grid column ${String(index + 1)} up`}
                          disabled={index === 0}
                          onClick={() => {
                            focusColumnRef.current = index === 1;
                            updateDraft((current) => ({
                              ...current,
                              columns: moveItem(current.columns, index, index - 1),
                            }));
                          }}
                        >
                          <Icon name="chevron-up" />
                          Up
                        </button>
                        <button
                          type="button"
                          aria-label={`Move Data Grid column ${String(index + 1)} down`}
                          disabled={index === draft.columns.length - 1}
                          onClick={() => {
                            focusColumnRef.current = index === draft.columns.length - 2;
                            updateDraft((current) => ({
                              ...current,
                              columns: moveItem(current.columns, index, index + 1),
                            }));
                          }}
                        >
                          <Icon name="chevron-down" />
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
                            selectColumn(
                              (draft.columns[index + 1] ?? draft.columns[index - 1])?.id,
                              true,
                            );
                          }}
                        >
                          <Icon name="delete" />
                          Remove
                        </button>
                      </div>
                    </header>
                    <h4>Content</h4>
                    <div className="wr-data-grid-configuration-fields">
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
                          <option value="">(no field)</option>
                          {fieldChoices
                            .filter((choice) => choice.path.length > 0)
                            .map((choice) => (
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
                      {column.cellKind === 'button' && (
                        <div className="wr-data-grid-configuration-field">
                          <span>Icon</span>
                          <button
                            type="button"
                            className="wr-data-grid-icon-picker"
                            aria-label={`Button icon for Data Grid column ${String(index + 1)}`}
                            aria-expanded={iconPickerColumnId === column.id}
                            aria-haspopup="dialog"
                            onClick={() => setIconPickerColumnId(column.id)}
                          >
                            <span className="wr-data-grid-icon-picker-preview" aria-hidden="true">
                              {column.buttonIcon === null ? (
                                <span>—</span>
                              ) : (
                                <ProjectIconGraphic name={column.buttonIcon} />
                              )}
                            </span>
                            <span>
                              {column.buttonIcon === null
                                ? 'Choose icon'
                                : webRadIconLabel(column.buttonIcon)}
                            </span>
                          </button>
                        </div>
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
                    <h4>Size and alignment</h4>
                    <div className="wr-data-grid-configuration-fields">
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
                )}
              </div>
            </section>
            <section
              className="wr-data-grid-tab-panel"
              id={`${titleId}-panel-labels`}
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-labels`}
              hidden={activeTab !== 'labels'}
            >
              {activeTab === 'labels' && (
                <DataGridLabelsSettings
                  draft={draft}
                  operations={clientGraphQLOperations}
                  onChange={updateDraft}
                />
              )}
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
      {iconPickerColumn !== undefined && (
        <IconPickerDialog
          icons={WEBRAD_ICON_NAMES}
          selected={iconPickerColumn.buttonIcon ?? undefined}
          onClose={() => setIconPickerColumnId(null)}
          onClear={() => {
            updateDraft((current) => ({
              ...current,
              columns: current.columns.map((column) =>
                column.id === iconPickerColumn.id ? { ...column, buttonIcon: null } : column,
              ),
            }));
            setIconPickerColumnId(null);
          }}
          onSelect={(buttonIcon) => {
            updateDraft((current) => ({
              ...current,
              columns: current.columns.map((column) =>
                column.id === iconPickerColumn.id ? { ...column, buttonIcon } : column,
              ),
            }));
            setIconPickerColumnId(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}
