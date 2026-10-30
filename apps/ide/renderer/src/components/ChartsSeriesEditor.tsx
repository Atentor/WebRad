import {
  chartSchemaChoices,
  normalizeApiClientConfiguration,
  type ChartSeriesConfiguration,
  type ComponentNode,
} from '@webrad/project-model';
import type { ReactElement } from 'react';
import { chartSeriesIssue, chartSeriesSource } from './charts-configuration';
import { Icon } from './Icon';
import { NativeColorInput } from './NativeColorInput';

interface ChartsSeriesEditorProps {
  readonly series: ChartSeriesConfiguration;
  readonly components: readonly ComponentNode[];
  readonly onChange: (series: ChartSeriesConfiguration) => void;
  readonly onRemove: () => void;
}

const UNSELECTED = '__choose_chart_field__';

export function ChartsSeriesEditor({
  series,
  components,
  onChange,
  onRemove,
}: ChartsSeriesEditorProps): ReactElement {
  const clients = components.filter((node) => node.type === 'WebApiClient');
  const { client, configuration, operation, choices } = chartSeriesSource(series, components);
  const issue = chartSeriesIssue(series, components);
  return (
    <section
      className="wr-charts-series-editor"
      aria-label={`Configure ${series.name || 'series'}`}
    >
      <div className="wr-charts-series-heading">
        <h3>Series settings</h3>
        <button
          type="button"
          className="wr-charts-remove"
          onClick={onRemove}
          aria-label="Remove selected chart series"
        >
          <Icon name="delete" /> Remove
        </button>
      </div>
      <div className="wr-charts-field-pair">
        <label>
          <span>Series name</span>
          <input
            aria-label="Chart series name"
            value={series.name}
            maxLength={120}
            required
            onChange={(event) => onChange({ ...series, name: event.currentTarget.value })}
          />
        </label>
        <label className="wr-charts-color-field">
          <span>Color</span>
          <NativeColorInput
            aria-label="Chart series color"
            value={series.color}
            onChange={(color) => onChange({ ...series, color })}
          />
        </label>
      </div>
      <label>
        <span>API Client</span>
        <select
          aria-label="Chart API Client"
          value={series.apiClientId ?? ''}
          onChange={(event) => {
            const id = event.currentTarget.value;
            const selected = clients.find((node) => node.id === id);
            const nextOperation =
              selected === undefined
                ? undefined
                : normalizeApiClientConfiguration(selected.props.apiClientConfig).operations[0];
            const nextLists = chartSchemaChoices(nextOperation?.responseSchema, '').lists;
            const listPath = nextLists[0]?.path ?? '';
            const nextChoices = chartSchemaChoices(nextOperation?.responseSchema, listPath);
            onChange({
              ...series,
              apiClientId: selected?.id ?? null,
              operationId: nextOperation?.id ?? null,
              listPath,
              labelField: nextChoices.labels[0]?.path ?? '',
              valueField: nextChoices.values[0]?.path ?? '',
            });
          }}
        >
          <option value="">Choose an API Client</option>
          {series.apiClientId !== null && client === undefined && (
            <option value={series.apiClientId} disabled>
              Unavailable API Client
            </option>
          )}
          {clients.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Endpoint</span>
        <select
          aria-label="Chart endpoint"
          disabled={client === undefined}
          value={series.operationId ?? ''}
          onChange={(event) => {
            const operationId = event.currentTarget.value;
            const nextOperation = configuration?.operations.find(
              (entry) => entry.id === operationId,
            );
            const listPath =
              chartSchemaChoices(nextOperation?.responseSchema, '').lists[0]?.path ?? '';
            const nextChoices = chartSchemaChoices(nextOperation?.responseSchema, listPath);
            onChange({
              ...series,
              operationId: operationId || null,
              listPath,
              labelField: nextChoices.labels[0]?.path ?? '',
              valueField: nextChoices.values[0]?.path ?? '',
            });
          }}
        >
          <option value="">Choose an endpoint</option>
          {series.operationId !== null && operation === undefined && (
            <option value={series.operationId} disabled>
              Unavailable endpoint
            </option>
          )}
          {configuration?.operations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {entry.method} {entry.path}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Response list</span>
        <select
          aria-label="Chart response list"
          disabled={operation === undefined || choices.lists.length === 0}
          value={
            choices.lists.some((entry) => entry.path === series.listPath)
              ? series.listPath
              : UNSELECTED
          }
          onChange={(event) => {
            const listPath = event.currentTarget.value;
            const nextChoices = chartSchemaChoices(operation?.responseSchema, listPath);
            onChange({
              ...series,
              listPath,
              labelField: nextChoices.labels[0]?.path ?? '',
              valueField: nextChoices.values[0]?.path ?? '',
            });
          }}
        >
          <option value={UNSELECTED} disabled>
            Choose a list
          </option>
          {choices.lists.map((entry) => (
            <option key={entry.path} value={entry.path}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <div className="wr-charts-field-pair">
        {(['labelField', 'valueField'] as const).map((field) => {
          const fields = field === 'labelField' ? choices.labels : choices.values;
          const caption = field === 'labelField' ? 'Label field' : 'Value field';
          return (
            <label key={field}>
              <span>
                {caption}
                {field === 'valueField' && <small>number</small>}
              </span>
              <select
                aria-label={`Chart ${caption.toLowerCase()}`}
                disabled={fields.length === 0}
                value={
                  fields.some((entry) => entry.path === series[field]) ? series[field] : UNSELECTED
                }
                onChange={(event) => onChange({ ...series, [field]: event.currentTarget.value })}
              >
                <option value={UNSELECTED} disabled>
                  Choose a field
                </option>
                {fields.map((entry) => (
                  <option key={entry.path} value={entry.path}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {issue !== null && (
        <p className="wr-charts-binding-message" role="status">
          <Icon name="info" />
          {issue}
        </p>
      )}
    </section>
  );
}
