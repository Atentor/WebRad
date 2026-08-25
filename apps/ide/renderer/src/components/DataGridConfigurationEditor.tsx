import {
  normalizeApiClientConfiguration,
  normalizeDataGridConfiguration,
  type ApiClientResponseSchema,
  type ApiClientSchemaNode,
  type ComponentNode,
  type DataGridCellKind,
  type DataGridConfiguration,
} from '@webrad/project-model';
import { useId, type ReactElement } from 'react';

export interface DataGridConfigurationEditorProps {
  readonly id: string;
  readonly value: unknown;
  readonly availableComponents: readonly ComponentNode[];
  readonly disabled?: boolean;
  readonly onChange: (value: DataGridConfiguration) => void;
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
  schema: ApiClientResponseSchema | null,
  listPath: string,
): readonly SchemaChoice[] {
  if (schema === null) return [];
  const listNode = findNode(schema.root, listPath);
  if (listNode?.kind !== 'list') return [];
  const choices: SchemaChoice[] = [];
  listNode.children.forEach((child) => collectFieldChoices(child, listPath, choices));
  return choices;
}

function updateColumnCount(
  configuration: DataGridConfiguration,
  count: number,
): DataGridConfiguration {
  const columns = [...configuration.columns];
  while (columns.length < count) {
    const sequence = columns.length + 1;
    columns.push({
      id: `column-${String(sequence)}`,
      header: `Column ${String(sequence)}`,
      fieldPath: '',
      cellKind: 'text',
      footer: '',
    });
  }
  return { ...configuration, columnCount: count, columns: columns.slice(0, count) };
}

export function DataGridConfigurationEditor({
  id,
  value,
  availableComponents,
  disabled = false,
  onChange,
}: DataGridConfigurationEditorProps): ReactElement {
  const configuration = normalizeDataGridConfiguration(value);
  const descriptionId = useId();
  const apiClients = availableComponents.filter((component) => component.type === 'WebApiClient');
  const apiClient = apiClients.find((component) => component.id === configuration.apiClientId);
  const apiConfiguration =
    apiClient === undefined
      ? undefined
      : normalizeApiClientConfiguration(apiClient.props.apiClientConfig);
  const operation = apiConfiguration?.operations.find(
    (candidate) => candidate.id === configuration.operationId,
  );
  const listChoices: SchemaChoice[] = [];
  if (operation?.responseSchema !== null && operation?.responseSchema !== undefined) {
    collectListChoices(operation.responseSchema.root, listChoices);
  }
  const fieldChoices = operationSchemaChoices(
    operation?.responseSchema ?? null,
    configuration.listPath,
  );

  const update = (patch: Partial<DataGridConfiguration>): void =>
    onChange({ ...configuration, ...patch });
  const updateColumn = (
    index: number,
    patch: Partial<DataGridConfiguration['columns'][number]>,
  ): void => {
    const current = configuration.columns[index];
    if (current === undefined) return;
    update({
      columns: configuration.columns.map((column, candidateIndex) =>
        candidateIndex === index ? { ...column, ...patch } : column,
      ),
    });
  };

  return (
    <fieldset aria-describedby={descriptionId} className="wr-data-grid-config" disabled={disabled}>
      <span className="wr-sr-only" id={descriptionId}>
        Configure the API Client operation, its response list, and each repeated table column.
      </span>
      <label>
        API Client
        <select
          aria-label="Data Grid API Client"
          id={id}
          value={configuration.apiClientId ?? ''}
          onChange={(event) =>
            update({ apiClientId: event.target.value || null, operationId: null, listPath: '' })
          }
        >
          <option value="">(select an API Client)</option>
          {apiClients.map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Endpoint
        <select
          aria-label="Data Grid endpoint"
          disabled={apiConfiguration === undefined}
          value={configuration.operationId ?? ''}
          onChange={(event) => update({ operationId: event.target.value || null, listPath: '' })}
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
        Response list
        <select
          aria-label="Data Grid response list"
          disabled={operation === undefined}
          value={configuration.listPath}
          onChange={(event) => update({ listPath: event.target.value })}
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
      <label>
        Columns
        <input
          aria-label="Data Grid column count"
          max={50}
          min={1}
          type="number"
          value={configuration.columnCount}
          onChange={(event) => {
            const count = event.currentTarget.valueAsNumber;
            if (Number.isInteger(count) && count >= 1 && count <= 50)
              onChange(updateColumnCount(configuration, count));
          }}
        />
      </label>
      <label>
        <input
          checked={configuration.showHeader}
          type="checkbox"
          onChange={(event) => update({ showHeader: event.target.checked })}
        />
        Show header
      </label>
      <label>
        <input
          checked={configuration.stickyHeader}
          disabled={!configuration.showHeader}
          type="checkbox"
          onChange={(event) => update({ stickyHeader: event.target.checked })}
        />
        Keep header fixed
      </label>
      <label>
        <input
          checked={configuration.showFooter}
          type="checkbox"
          onChange={(event) => update({ showFooter: event.target.checked })}
        />
        Show fixed footer row
      </label>
      <label>
        <input
          checked={configuration.stickyFooter}
          disabled={!configuration.showFooter}
          type="checkbox"
          onChange={(event) => update({ stickyFooter: event.target.checked })}
        />
        Keep footer fixed
      </label>
      <div aria-label="Data Grid columns">
        {configuration.columns.map((column, index) => (
          <fieldset key={column.id}>
            <legend>Column {String(index + 1)}</legend>
            <label>
              Header
              <input
                aria-label={`Header for Data Grid column ${String(index + 1)}`}
                value={column.header}
                onChange={(event) => updateColumn(index, { header: event.target.value })}
              />
            </label>
            <label>
              Cell component
              <select
                aria-label={`Cell component for Data Grid column ${String(index + 1)}`}
                value={column.cellKind}
                onChange={(event) =>
                  updateColumn(index, { cellKind: event.target.value as DataGridCellKind })
                }
              >
                {Object.entries(CELL_KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dynamic field
              <select
                aria-label={`Dynamic field for Data Grid column ${String(index + 1)}`}
                value={column.fieldPath}
                onChange={(event) => updateColumn(index, { fieldPath: event.target.value })}
              >
                <option value="">(whole list item)</option>
                {fieldChoices.map((choice) => (
                  <option key={choice.path} value={choice.path}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Footer
              <input
                aria-label={`Footer for Data Grid column ${String(index + 1)}`}
                value={column.footer}
                onChange={(event) => updateColumn(index, { footer: event.target.value })}
              />
            </label>
          </fieldset>
        ))}
      </div>
    </fieldset>
  );
}
