import {
  isDataGridGraphQLMutation,
  type DataGridGraphQLBinding,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import type { ReactElement } from 'react';

const mutationFields = [
  ['insert', 'insertOperationId', 'Insert'],
  ['update', 'updateOperationId', 'Update'],
  ['delete', 'deleteOperationId', 'Delete'],
] as const;
type MutationKey = (typeof mutationFields)[number][1];

interface DataGridGraphQLSettingsProps {
  readonly binding: DataGridGraphQLBinding;
  readonly query: ProjectGraphQLOperation;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly onChange: (patch: Partial<DataGridGraphQLBinding>) => void;
}

export function DataGridGraphQLSettings({
  binding,
  query,
  operations,
  onChange,
}: DataGridGraphQLSettingsProps): ReactElement {
  const maxPageSize = query.runtime.pagination?.maxSize ?? 30;
  const actions = mutationFields.map(([kind, key, label]) => {
    const candidates = operations.filter(
      ({ database, runtime }) =>
        database === query.database &&
        runtime.table === query.runtime.table &&
        runtime.kind === kind,
    );
    const compatible = candidates.filter((operation) =>
      isDataGridGraphQLMutation(query, operation, kind),
    );
    const reason =
      candidates.length === 0
        ? 'Not available through this GraphQL Client'
        : kind !== 'delete' &&
            candidates.every(
              ({ runtime }) => !runtime.parameters.some(({ source }) => source.role === 'input'),
            )
          ? 'Add a field to write in RestGO → GraphQL'
          : 'Use an equality condition on a field returned by Query';
    return { key, label, compatible, reason };
  });
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
              aria-label="Enable record editing"
              checked={binding.crudEnabled}
              onChange={(event) => {
                const crudEnabled = event.currentTarget.checked;
                const defaults: Partial<Record<MutationKey, string>> = {};
                if (crudEnabled && actions.every(({ key }) => binding[key] === null)) {
                  for (const { key, compatible } of actions) {
                    const [action] = compatible;
                    if (compatible.length === 1 && action) defaults[key] = action.id;
                  }
                }
                onChange({ ...defaults, crudEnabled });
              }}
            />
            <span>Enable record editing</span>
          </label>
          {binding.crudEnabled && (
            <label>
              <input
                type="checkbox"
                aria-label="Auto save"
                checked={binding.autoSave === true}
                onChange={(event) => onChange({ autoSave: event.currentTarget.checked })}
              />
              <span>Auto save</span>
            </label>
          )}
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
              if (Number.isInteger(size) && size >= 1 && size <= maxPageSize)
                onChange({ pageSize: size });
            }}
          />
        </label>
      </div>
      <fieldset className="wr-data-grid-toggle-group wr-data-grid-graphql-actions">
        <legend>Endpoint actions</legend>
        {actions.map(({ key, label, compatible, reason }) => {
          const selected = binding[key];
          const action = compatible[0];
          if (compatible.length > 1) {
            return (
              <label key={key}>
                <span>{label}</span>
                <select
                  disabled={!binding.crudEnabled}
                  value={selected ?? ''}
                  onChange={(event) => onChange({ [key]: event.currentTarget.value || null })}
                >
                  <option value="">Off</option>
                  {selected !== null && !compatible.some(({ id }) => id === selected) && (
                    <option value={selected} disabled>
                      (unavailable operation)
                    </option>
                  )}
                  {compatible.map(({ id, name }) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label key={key}>
              <input
                type="checkbox"
                aria-label={label}
                checked={selected !== null}
                disabled={!binding.crudEnabled || (action === undefined && selected === null)}
                onChange={(event) =>
                  onChange({ [key]: event.currentTarget.checked ? (action?.id ?? null) : null })
                }
              />
              <span>{label}</span>
              {action === undefined && <small>{reason}</small>}
              {action !== undefined && selected !== null && selected !== action.id && (
                <small>Clear this action and select it again to use the available operation.</small>
              )}
            </label>
          );
        })}
      </fieldset>
      {binding.crudEnabled && (
        <p>
          Use a key field from the query in an equality condition for update and delete.{' '}
          {binding.autoSave === true
            ? 'Changes are saved automatically after they are applied.'
            : 'Handle OnChangesChanged to choose when to call SaveChanges.'}
        </p>
      )}
    </>
  );
}
