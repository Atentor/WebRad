import {
  isDataGridGraphQLMutation,
  type DataGridGraphQLBinding,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import type { ReactElement } from 'react';

const mutationFields = [
  ['insert', 'insertOperationId', 'Insert operation'],
  ['update', 'updateOperationId', 'Update operation'],
  ['delete', 'deleteOperationId', 'Delete operation'],
] as const;

interface DataGridGraphQLSettingsProps {
  readonly binding: DataGridGraphQLBinding;
  readonly query: ProjectGraphQLOperation | undefined;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly onChange: (patch: Partial<DataGridGraphQLBinding>) => void;
}

export function DataGridGraphQLSettings({
  binding,
  query,
  operations,
  onChange,
}: DataGridGraphQLSettingsProps): ReactElement {
  const maxPageSize = query?.runtime.pagination?.maxSize ?? 30;
  return (
    <>
      <div className="wr-data-grid-configuration-toggles">
        <fieldset className="wr-data-grid-toggle-group">
          <legend>Pagination</legend>
          <label>
            <input
              type="checkbox"
              checked={binding.showPager}
              onChange={(event) => onChange({ showPager: event.currentTarget.checked })}
            />
            <span>Show pagination controls</span>
          </label>
        </fieldset>
        <fieldset className="wr-data-grid-toggle-group">
          <legend>Record editing</legend>
          <label>
            <input
              type="checkbox"
              checked={binding.crudEnabled}
              onChange={(event) => onChange({ crudEnabled: event.currentTarget.checked })}
            />
            <span>Enable CRUD</span>
          </label>
        </fieldset>
      </div>
      <div className="wr-data-grid-configuration-fields four-columns">
        <label>
          <span>Initial page size</span>
          <input
            type="number"
            min={1}
            max={maxPageSize}
            value={binding.pageSize}
            onChange={(event) => {
              const size = event.currentTarget.valueAsNumber;
              if (Number.isInteger(size) && size >= 1 && size <= maxPageSize) onChange({ pageSize: size });
            }}
          />
        </label>
        {binding.crudEnabled && mutationFields.map(([kind, key, label]) => {
          const available = query === undefined ? [] : operations.filter((operation) =>
            isDataGridGraphQLMutation(query, operation, kind),
          );
          return (
            <label key={key}>
              <span>{label}</span>
              <select
                value={binding[key] ?? ''}
                onChange={(event) => onChange({ [key]: event.currentTarget.value || null })}
              >
                <option value="">(disabled)</option>
                {binding[key] !== null && !available.some(({ id }) => id === binding[key]) && (
                  <option value={binding[key]} disabled>(unavailable operation)</option>
                )}
                {available.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      {binding.crudEnabled && (
        <p>Use a key field from the query in an equality condition for update and delete. Handle OnChangesChanged to choose when to call SaveChanges.</p>
      )}
    </>
  );
}
