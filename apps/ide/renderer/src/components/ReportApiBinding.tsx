import { normalizeApiClientConfiguration, type ComponentNode } from '@webrad/project-model';
import type { ReactElement } from 'react';
import { reportApiSource } from '@webrad/designer';

export interface ReportApiReference {
  readonly apiClientId: string;
  readonly operationId: string;
  readonly path: string;
}

interface ReportApiBindingProps {
  readonly value: ReportApiReference;
  readonly components: readonly ComponentNode[];
  readonly list?: boolean;
  readonly onChange: (value: ReportApiReference) => void;
}

export function ReportApiBinding({
  value,
  components,
  list = false,
  onChange,
}: ReportApiBindingProps): ReactElement {
  const source = reportApiSource(components, value.apiClientId, value.operationId);
  const choices = list ? source.lists : source.fields;
  return (
    <>
      <label>
        <span>API Client</span>
        <select
          aria-label="Report API Client"
          value={source.client?.id ?? value.apiClientId}
          onChange={(event) => {
            const apiClientId = event.currentTarget.value;
            const client = source.clients.find((item) => item.id === apiClientId);
            const operation =
              client === undefined
                ? undefined
                : normalizeApiClientConfiguration(client.props.apiClientConfig).operations[0];
            const next = reportApiSource(components, apiClientId, operation?.id ?? '');
            onChange({
              apiClientId,
              operationId: operation?.id ?? '',
              path: (list ? next.lists : next.fields)[0]?.path ?? '',
            });
          }}
        >
          <option value="">Choose an API Client</option>
          {value.apiClientId !== '' && source.client === undefined && (
            <option value={value.apiClientId}>(unavailable API Client)</option>
          )}
          {source.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Operation</span>
        <select
          aria-label="Report operation"
          value={source.operation?.id ?? value.operationId}
          disabled={source.client === undefined}
          onChange={(event) => {
            const operationId = event.currentTarget.value;
            const next = reportApiSource(components, value.apiClientId, operationId);
            onChange({
              ...value,
              operationId,
              path: (list ? next.lists : next.fields)[0]?.path ?? '',
            });
          }}
        >
          <option value="">Choose an operation</option>
          {value.operationId !== '' && source.operation === undefined && (
            <option value={value.operationId}>(unavailable operation)</option>
          )}
          {source.configuration?.operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{list ? 'Response list' : 'Response field'}</span>
        <select
          aria-label={list ? 'Report response list' : 'Report response field'}
          value={choices.some((item) => item.path === value.path) ? value.path : '__missing__'}
          disabled={source.operation === undefined}
          onChange={(event) => onChange({ ...value, path: event.currentTarget.value })}
        >
          <option value="__missing__" disabled>
            Choose {list ? 'a list' : 'a field'}
          </option>
          {choices.map((choice) => (
            <option key={choice.path} value={choice.path}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {source.operation !== undefined && choices.length === 0 && (
        <p className="wr-report-hint">
          Save a response schema with {list ? 'a list' : 'scalar fields'} in the API Client editor.
        </p>
      )}
      <p className="wr-report-hint">Uses the response already loaded by your application.</p>
    </>
  );
}
