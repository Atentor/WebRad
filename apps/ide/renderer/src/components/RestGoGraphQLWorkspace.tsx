import {
  buildProjectGraphQLOperation,
  groupGraphQLEndpoints,
  type GraphQLOperationChoice,
  type GraphQLSchema,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import {
  normalizeWebDataGridEditorFieldLabels,
  WEB_DATA_GRID_LABEL_MAX_LENGTH,
} from '@webrad/runtime/data-grid-labels';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type { RestGoAdminGraphQLDatabase } from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import {
  RemoveField,
  RestGoGraphQLConditionGroup,
  RestGoGraphQLMutationInputs,
} from './RestGoGraphQLParameters';
import {
  buildGraphQLSpec,
  describeGraphQLTables,
  editGraphQLTable,
  GRAPHQL_ACTIONS,
  graphQLActionName,
  newGraphQLAction,
  newGraphQLSpec,
  type GraphQLAction,
  type GraphQLTableDraft,
  type OperationDraft,
} from './restgo-graphql-draft';
import { restGoErrorMessage } from './restgo-workspace-model';
import './restgo-graphql-workspace.css';

const KINDS = {
  query: 'Query',
  insert: 'Insert',
  update: 'Update',
  delete: 'Delete',
} as const satisfies Record<GraphQLAction, string>;

interface RestGoGraphQLWorkspaceProps {
  readonly active: boolean;
  readonly baseUrl: string;
  readonly defaultDatabase: string;
  readonly refreshVersion: number;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly onSave?: (operations: readonly ProjectGraphQLOperation[]) => void | Promise<void>;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onMetadataFailure: () => void;
}

export function RestGoGraphQLWorkspace({
  active,
  baseUrl,
  defaultDatabase,
  refreshVersion,
  operations,
  onSave,
  onDirtyChange,
  onMetadataFailure,
}: RestGoGraphQLWorkspaceProps): ReactElement {
  const catalogRequest = useMemo(
    () => (active ? { baseUrl, refreshVersion, onMetadataFailure } : null),
    [active, baseUrl, refreshVersion, onMetadataFailure],
  );
  const [catalogResult, setCatalogResult] = useState<{
    readonly request: NonNullable<typeof catalogRequest>;
    readonly databases: readonly RestGoAdminGraphQLDatabase[];
    readonly error?: string;
  } | null>(null);
  const catalog = catalogResult?.request === catalogRequest ? catalogResult : null;
  const catalogLoading = catalogRequest !== null && catalog === null;
  const catalogError = catalog?.error;
  const databases = catalog?.databases ?? [];
  const [schemaState, setSchemaState] = useState<{
    readonly baseUrl: string;
    readonly databaseId: number;
    readonly version: number;
    readonly schema: GraphQLSchema | null;
    readonly error?: string;
  } | null>(null);
  const [draft, setDraft] = useState<GraphQLTableDraft | null>(null);
  const [baseline, setBaseline] = useState<GraphQLTableDraft | null>(null);
  const [disabledActions, setDisabledActions] = useState<GraphQLTableDraft['actions']>({});
  const [selectedOperationId, setSelectedOperationId] = useState<string>();
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = GRAPHQL_ACTIONS.flatMap((kind) => draft?.actions[kind] ?? []);
  const database = databases.find((item) => item.slug === draft?.database);
  const databaseId = database?.id;
  const currentSchemaState =
    schemaState &&
    schemaState.baseUrl === baseUrl &&
    schemaState.databaseId === databaseId &&
    schemaState.version === refreshVersion
      ? schemaState
      : null;
  const schema = currentSchemaState?.schema ?? null;
  const { tables, schemaError } = useMemo(() => {
    try {
      return { tables: schema ? describeGraphQLTables(schema) : undefined, schemaError: '' };
    } catch (reason) {
      return { tables: undefined, schemaError: restGoErrorMessage(reason) };
    }
  }, [schema]);
  const tableChoices = draft ? tables?.get(draft.table) : undefined;
  const labelFields = [
    ...new Set([
      ...enabled.flatMap(({ spec }) => [
        ...spec.selectionPaths.filter((path) => !path.includes('.')),
        ...spec.inputs.map(({ field }) => field),
      ]),
      ...GRAPHQL_ACTIONS.flatMap((kind) =>
        (tableChoices?.[kind] ?? []).flatMap(({ selection, inputs }) => [
          ...selection
            .filter(({ path }) => !path.includes('.'))
            .map(({ path }) => path),
          ...inputs.map(({ field }) => field),
        ]),
      ),
    ]),
  ];
  const dirty =
    draft !== null &&
    (baseline === null ||
      draft.name.trim() !== baseline.name ||
      JSON.stringify(draft.fieldLabels) !== JSON.stringify(baseline.fieldLabels) ||
      JSON.stringify(enabled) !==
        JSON.stringify(GRAPHQL_ACTIONS.flatMap((kind) => baseline.actions[kind] ?? [])));
  const savedEndpoints = useMemo(() => groupGraphQLEndpoints(operations), [operations]);
  const searchText = search.trim().toLowerCase();
  const visibleEndpoints = savedEndpoints.filter((entry) =>
    [
      entry.name,
      entry.table,
      entry.database,
      ...entry.operations.flatMap((operation) => [operation.name, KINDS[operation.spec.kind]]),
    ].some((value) => value.toLowerCase().includes(searchText)),
  );
  const configuredTables = new Set(
    savedEndpoints
      .filter(({ database }) => database === draft?.database)
      .map(({ table }) => table),
  );
  const availableTables = [...(tables?.keys() ?? [])]
    .filter((table) => !configuredTables.has(table))
    .sort((left, right) => left.localeCompare(right));
  const selectedOperation = enabled.find(({ id }) => id === selectedOperationId) ?? enabled[0];
  const selectedChoices = selectedOperation
    ? tableChoices?.[selectedOperation.spec.kind]
    : undefined;
  const choice = selectedChoices?.find(
    ({ rootField }) => rootField === selectedOperation?.spec.rootField,
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!catalogRequest) return;
    let canceled = false;
    void window.webrad.restgoAdmin
      .graphqlDatabases({ baseUrl: catalogRequest.baseUrl })
      .then((next) => {
        if (!canceled) setCatalogResult({ request: catalogRequest, databases: next });
      })
      .catch((reason: unknown) => {
        if (canceled) return;
        setCatalogResult({
          request: catalogRequest,
          databases: [],
          error: restGoErrorMessage(reason),
        });
        catalogRequest.onMetadataFailure();
      });
    return () => {
      canceled = true;
    };
  }, [catalogRequest]);

  useEffect(() => {
    if (!active || databaseId === undefined) return;
    let canceled = false;
    void window.webrad.restgoAdmin
      .graphqlSchema({ baseUrl, id: databaseId })
      .then((next) => {
        if (!canceled)
          setSchemaState({ baseUrl, databaseId, version: refreshVersion, schema: next });
      })
      .catch((reason: unknown) => {
        if (canceled) return;
        setSchemaState({
          baseUrl,
          databaseId,
          version: refreshVersion,
          schema: null,
          error: restGoErrorMessage(reason),
        });
        onMetadataFailure();
      });
    return () => {
      canceled = true;
    };
  }, [active, databaseId, baseUrl, refreshVersion, onMetadataFailure]);

  const selectDraft = (
    next: GraphQLTableDraft | null,
    saved: boolean,
    operationId?: string,
  ): void => {
    setDraft(next);
    setBaseline(saved ? next : null);
    setDisabledActions({});
    setSelectedOperationId(operationId);
    setError('');
    setNotice('');
  };

  const create = (): void => {
    const defaultChoice = databases.find((entry) => entry.slug === defaultDatabase) ?? databases[0];
    if (!defaultChoice) return;
    selectDraft(
      { name: '', database: defaultChoice.slug, table: '', actions: {}, fieldLabels: {} },
      false,
    );
  };

  const changeAction = (kind: GraphQLAction, checked: boolean): void => {
    if (!draft) return;
    const actions = { ...draft.actions };
    if (checked) {
      let next = disabledActions[kind];
      const available = tableChoices?.[kind]?.[0];
      if (!next && database && available) {
        next = [newGraphQLAction(kind, available, database.defaultPageSize)];
      }
      if (!next) return;
      actions[kind] = next;
      setSelectedOperationId(next[0]?.id);
    } else {
      const disabled = actions[kind];
      if (disabled) setDisabledActions({ ...disabledActions, [kind]: disabled });
      delete actions[kind];
    }
    setError('');
    setDraft({ ...draft, actions });
  };

  const updateOperation = (operation: OperationDraft): void => {
    if (!draft) return;
    const { kind } = operation.spec;
    const entries = draft.actions[kind] ?? [];
    setDraft({
      ...draft,
      actions: {
        ...draft.actions,
        [kind]: entries.map((entry) => (entry.id === operation.id ? operation : entry)),
      },
    });
  };

  const canSave =
    !!draft?.table &&
    !!draft.name.trim() &&
    !!onSave &&
    dirty &&
    !saving &&
    !catalogLoading &&
    (baseline !== null || enabled.length > 0);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSave || !draft || !onSave) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const previous = operations.filter(
        (entry) => entry.database === draft.database && entry.runtime.table === draft.table,
      );
      const previousById = new Map(previous.map((entry) => [entry.id, entry]));
      const endpointName = draft.name.trim();
      const fieldLabels = normalizeWebDataGridEditorFieldLabels(draft.fieldLabels);
      const allNames = new Set(operations.map(({ name }) => name.toLowerCase()));
      const next = new Map<string, ProjectGraphQLOperation>();
      for (const operation of enabled) {
        const { id, spec } = operation;
        const saved = previousById.get(id);
        const name = saved?.name ?? graphQLActionName(endpointName, spec.kind, allNames);
        const original = baseline?.actions[spec.kind]?.find((entry) => entry.id === id);
        try {
          if (saved && original === operation) {
            next.set(id, { ...saved, endpointName, runtime: { ...saved.runtime, fieldLabels } });
          } else {
            const available = tableChoices?.[spec.kind]?.find(
              ({ rootField }) => rootField === spec.rootField,
            );
            if (!database || !schema || !available)
              throw new Error('The published operation is unavailable.');
            const built = buildProjectGraphQLOperation(
              schema,
              { id, name, database: draft.database, spec: buildGraphQLSpec(spec, available) },
              database.maxPageSize,
            );
            next.set(id, { ...built, endpointName, runtime: { ...built.runtime, fieldLabels } });
          }
          allNames.add(name.toLowerCase());
        } catch (reason) {
          setSelectedOperationId(id);
          throw new Error(
            `${KINDS[spec.kind]} · ${endpointName}: ${restGoErrorMessage(reason)}`,
            { cause: reason },
          );
        }
      }
      const removed = previous.filter(({ id }) => !next.has(id));
      if (
        removed.length &&
        !window.confirm(`Remove ${removed.map(({ name }) => name).join(', ')} from this project?`)
      )
        return;
      const saved = [...next.values()];
      await onSave([
        ...operations.flatMap((entry) =>
          previousById.has(entry.id) ? (next.get(entry.id) ?? []) : entry,
        ),
        ...saved.filter(({ id }) => !previousById.has(id)),
      ]);
      selectDraft(
        saved.length ? editGraphQLTable({ ...draft, name: endpointName, operations: saved }) : null,
        true,
        selectedOperation?.id,
      );
      setNotice('GraphQL endpoint applied. Save the project to keep the changes.');
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      hidden={!active}
      className="wr-restgo-endpoints-layout wr-restgo-graphql-workspace"
      aria-label="GraphQL endpoints"
    >
      <aside className="wr-restgo-endpoint-list">
        <div className="wr-restgo-endpoint-list-toolbar">
          <strong>Endpoints</strong>
          <button
            type="button"
            aria-label="New GraphQL endpoint"
            className="wr-restgo-button wr-restgo-new-endpoint"
            disabled={!onSave || !databases.length || catalogLoading || dirty || saving}
            onClick={create}
          >
            <Icon name="add" />
            New
          </button>
        </div>
        <label className="wr-restgo-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search GraphQL endpoints"
            placeholder="Search endpoints or actions"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
        {visibleEndpoints.map((entry) => (
          <button
            type="button"
            className="wr-restgo-endpoint-list-item"
            key={entry.key}
            aria-pressed={draft?.database === entry.database && draft.table === entry.table}
            disabled={dirty || saving}
            onClick={() => selectDraft(editGraphQLTable(entry), true)}
          >
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.database}/{entry.table}</small>
            </span>
            <span className="wr-restgo-list-methods">
              {GRAPHQL_ACTIONS.filter((kind) =>
                entry.operations.some(({ spec }) => spec.kind === kind),
              ).map((kind) => (
                <small key={kind}>{KINDS[kind]}</small>
              ))}
            </span>
          </button>
        ))}
        {search && !visibleEndpoints.length && (
          <p className="wr-restgo-list-note">No matching endpoints.</p>
        )}
      </aside>
      <div className="wr-restgo-endpoint-content">
        {catalogLoading && (
          <p className="wr-restgo-graphql-message" role="status">
            Loading published databases…
          </p>
        )}
        {catalogError && (
          <p className="wr-restgo-graphql-message wr-restgo-graphql-error" role="alert">
            {catalogError}
          </p>
        )}
        {notice && (
          <p className="wr-restgo-graphql-message" role="status">
            {notice}
          </p>
        )}
        {!draft ? (
          <div className="wr-restgo-empty-state">
            <Icon name="waypoints" />
            <h2>{operations.length ? 'Choose an endpoint' : 'Configure a GraphQL endpoint'}</h2>
            {!catalogLoading && !catalogError && !databases.length && (
              <p>No GraphQL databases are published in this RestGO instance.</p>
            )}
            {databases.length > 0 && (
              <p>Choose a published table and enable the actions your application needs.</p>
            )}
            {error && (
              <p className="wr-restgo-graphql-error" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <form
            className="wr-restgo-graphql-editor"
            noValidate
            onSubmit={(event) => {
              void save(event);
            }}
          >
            <fieldset disabled={saving} className="wr-restgo-graphql-body">
              <section className="wr-restgo-graphql-table">
                <div className="wr-restgo-graphql-section-heading">
                  <h2>{baseline ? 'GraphQL endpoint' : 'New GraphQL endpoint'}</h2>
                  {database && (
                    <code className="wr-restgo-graphql-endpoint">{database.endpoint}</code>
                  )}
                </div>
                <div className="wr-restgo-graphql-operation-fields">
                  <label>
                    Published database
                    <select
                      aria-label="GraphQL database"
                      disabled={baseline !== null}
                      value={draft.database}
                      onChange={(event) => {
                        const next = databases.find(
                          (entry) => entry.slug === event.currentTarget.value,
                        );
                        if (next)
                          selectDraft(
                            { ...draft, database: next.slug, table: '', actions: {}, fieldLabels: {} },
                            false,
                          );
                      }}
                    >
                      {!database && (
                        <option value={draft.database}>{draft.database} (unavailable)</option>
                      )}
                      {databases.map((entry) => (
                        <option key={entry.id} value={entry.slug}>
                          {entry.name} ({entry.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Table
                    <select
                      aria-label="GraphQL table"
                      required
                      disabled={baseline !== null || !tables}
                      value={draft.table}
                      onChange={(event) => {
                        const table = event.currentTarget.value;
                        selectDraft(
                          {
                            ...draft,
                            name: !draft.name || draft.name === draft.table ? table : draft.name,
                            table,
                            actions: {},
                            fieldLabels: {},
                          },
                          false,
                        );
                      }}
                    >
                      <option value="">Choose a published table</option>
                      {draft.table && !availableTables.includes(draft.table) && (
                        <option value={draft.table}>{draft.table}</option>
                      )}
                      {availableTables.map((table) => (
                        <option key={table} value={table}>
                          {table}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Endpoint name
                    <input
                      aria-label="GraphQL endpoint name"
                      required
                      maxLength={256}
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
                    />
                  </label>
                </div>
                {!database && !catalogLoading && <p role="status">This database is unavailable.</p>}
                {database && !currentSchemaState && <p role="status">Loading published schema…</p>}
                {currentSchemaState?.error && (
                  <p role="alert" className="wr-restgo-graphql-error">
                    {currentSchemaState.error}
                  </p>
                )}
                {schemaError && (
                  <p role="alert" className="wr-restgo-graphql-error">
                    {schemaError}
                  </p>
                )}
                {tables?.size === 0 && <p role="status">The published schema has no tables.</p>}
                {!baseline && !!tables?.size && availableTables.length === 0 && (
                  <p role="status">All published tables in this database are already configured.</p>
                )}
                {draft.table && (
                  <fieldset className="wr-restgo-graphql-action-picker">
                    <legend>Enabled actions</legend>
                    {GRAPHQL_ACTIONS.map((kind) => {
                      const checked = !!draft.actions[kind]?.length;
                      const unavailable = !tableChoices?.[kind]?.length;
                      return (
                        <label className="wr-restgo-graphql-check" key={kind}>
                          <input
                            type="checkbox"
                            aria-label={`Enable ${KINDS[kind]}`}
                            checked={checked}
                            disabled={!checked && !disabledActions[kind] && unavailable}
                            onChange={(event) => changeAction(kind, event.currentTarget.checked)}
                          />
                          <span>
                            {KINDS[kind]}
                            {unavailable && tables && <small>Unavailable</small>}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                )}
                {labelFields.length > 0 && (
                  <section className="wr-restgo-graphql-setting">
                    <h3>Field display names</h3>
                    <p>Used in the Data Grid add and edit dialogs.</p>
                    <div className="wr-restgo-graphql-operation-fields">
                      {labelFields.map((field) => (
                        <label key={field}>
                          {field}
                          <input
                            aria-label={`Display name for ${field}`}
                            value={draft.fieldLabels[`/${field}`] ?? ''}
                            placeholder={field}
                            maxLength={WEB_DATA_GRID_LABEL_MAX_LENGTH}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                fieldLabels: {
                                  ...draft.fieldLabels,
                                  [`/${field}`]: event.currentTarget.value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              </section>
              {selectedOperation && (
                <section className="wr-restgo-graphql-settings">
                  <div className="wr-restgo-graphql-section-heading">
                    <h2>{KINDS[selectedOperation.spec.kind]} settings</h2>
                    {enabled.length > 1 && (
                      <div
                        className="wr-restgo-graphql-action-settings"
                        role="group"
                        aria-label="Configure enabled actions"
                      >
                        {enabled.map(({ id, name, spec }) => (
                          <button
                            key={id}
                            type="button"
                            className="wr-restgo-button"
                            aria-pressed={id === selectedOperation.id}
                            onClick={() => setSelectedOperationId(id)}
                          >
                            {KINDS[spec.kind]}
                            {(draft.actions[spec.kind]?.length ?? 0) > 1 && ` · ${name}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!!selectedChoices?.length && (!choice || selectedChoices.length > 1) && (
                    <div className="wr-restgo-graphql-operation-fields">
                      <label>
                        Published operation
                        <select
                          value={selectedOperation.spec.rootField}
                          onChange={(event) => {
                            const next = selectedChoices.find(
                              ({ rootField }) => rootField === event.currentTarget.value,
                            );
                            if (next)
                              updateOperation({
                                ...selectedOperation,
                                spec: newGraphQLSpec(
                                  selectedOperation.spec.kind,
                                  selectedOperation.spec.pageSize,
                                  next,
                                ),
                              });
                          }}
                        >
                          {!choice && (
                            <option value={selectedOperation.spec.rootField}>
                              {selectedOperation.spec.rootField} (unavailable)
                            </option>
                          )}
                          {selectedChoices.map(({ rootField }) => (
                            <option key={rootField}>{rootField}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  {!choice && tables && (
                    <p role="status">The saved operation is unavailable in the published schema.</p>
                  )}
                  {(draft.actions[selectedOperation.spec.kind]?.length ?? 0) > 1 && (
                    <button
                      type="button"
                      className="wr-restgo-button is-danger wr-restgo-graphql-remove-variant"
                      onClick={() => {
                        const { kind } = selectedOperation.spec;
                        const remaining =
                          draft.actions[kind]?.filter(({ id }) => id !== selectedOperation.id) ??
                          [];
                        setDraft({ ...draft, actions: { ...draft.actions, [kind]: remaining } });
                      }}
                    >
                      <Icon name="delete" /> Remove this operation
                    </button>
                  )}
                  {choice && database && (
                    <GraphQLOperationFields
                      key={selectedOperation.id}
                      draft={selectedOperation}
                      database={database}
                      choice={choice}
                      onChange={(spec) => updateOperation({ ...selectedOperation, spec })}
                    />
                  )}
                </section>
              )}
            </fieldset>
            {error && (
              <p className="wr-restgo-graphql-message wr-restgo-graphql-error" role="alert">
                {error}
              </p>
            )}
            <div className="wr-restgo-graphql-editor-actions">
              <button
                type="button"
                className="wr-restgo-button"
                disabled={saving}
                onClick={() => (dirty ? selectDraft(baseline, true) : selectDraft(null, false))}
              >
                {dirty ? 'Discard changes' : 'Close'}
              </button>
              <button type="submit" className="wr-restgo-button is-primary" disabled={!canSave}>
                <Icon name="save" /> Save endpoint
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

interface OperationFieldsProps {
  readonly draft: OperationDraft;
  readonly database: RestGoAdminGraphQLDatabase;
  readonly choice: GraphQLOperationChoice;
  readonly onChange: (spec: OperationDraft['spec']) => void;
}

function GraphQLOperationFields({
  draft: { spec },
  database,
  choice,
  onChange,
}: OperationFieldsProps): ReactElement {
  const availableOrder = choice.orderBy.filter(
    (available) => !spec.orderBy.some((order) => order.field === available.field),
  );
  const firstOrder = availableOrder[0];
  const firstDirection = firstOrder?.directions[0];
  const visibleFields = new Set(choice.selection.map((field) => field.path));
  const missingFields = spec.selectionPaths.filter((field) => !visibleFields.has(field));
  return (
    <>
      {choice.inputs.length > 0 && (
        <section className="wr-restgo-graphql-setting">
          <h3>Values to write</h3>
          <RestGoGraphQLMutationInputs
            operation={choice}
            inputs={spec.inputs}
            onChange={(inputs) => onChange({ ...spec, inputs })}
          />
        </section>
      )}
      {(choice.filters.length > 0 || spec.conditions.items.length > 0) && (
        <section className="wr-restgo-graphql-setting">
          <h3>Conditions</h3>
          {(spec.kind === 'update' || spec.kind === 'delete') && (
            <p>Set a condition that selects the record to change.</p>
          )}
          <RestGoGraphQLConditionGroup
            group={spec.conditions}
            operation={choice}
            requireValues={spec.kind === 'update' || spec.kind === 'delete'}
            onChange={(conditions) => onChange({ ...spec, conditions })}
          />
        </section>
      )}
      {(choice.selection.length > 0 || missingFields.length > 0) && (
        <section className="wr-restgo-graphql-setting">
          <h3>Return fields</h3>
          <div className="wr-restgo-graphql-selection">
            {[
              ...choice.selection.map((field) => ({
                path: field.path,
                label: field.label,
                type: field.type,
              })),
              ...missingFields.map((path) => ({ path, label: path, type: 'Unavailable' })),
            ].map((field) => (
              <label key={field.path} className="wr-restgo-graphql-check" title={field.path}>
                <input
                  type="checkbox"
                  checked={spec.selectionPaths.includes(field.path)}
                  onChange={(event) =>
                    onChange({
                      ...spec,
                      selectionPaths: event.currentTarget.checked
                        ? [...spec.selectionPaths, field.path]
                        : spec.selectionPaths.filter((path) => path !== field.path),
                    })
                  }
                />
                <span>
                  {field.label}
                  <small>{field.type}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}
      {(choice.orderBy.length > 0 || choice.pagination) && (
        <section className="wr-restgo-graphql-setting">
          <h3>{choice.orderBy.length > 0 ? 'Sort and paginate' : 'Pagination'}</h3>
          {spec.orderBy.map((order, index) => {
            const field = choice.orderBy.find((item) => item.field === order.field);
            return (
              <div key={order.field} className="wr-restgo-graphql-row-fields">
                <label>
                  Sort field
                  <select
                    value={order.field}
                    onChange={(event) => {
                      const next = availableOrder.find(
                        (item) => item.field === event.currentTarget.value,
                      );
                      const direction = next?.directions[0];
                      if (next && direction)
                        onChange({
                          ...spec,
                          orderBy: spec.orderBy.map((entry, at) =>
                            at === index ? { field: next.field, direction } : entry,
                          ),
                        });
                    }}
                  >
                    <option value={order.field}>
                      {order.field}
                      {field ? '' : ' (unavailable)'}
                    </option>
                    {availableOrder.map((item) => (
                      <option key={item.field}>{item.field}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Direction
                  <select
                    value={order.direction}
                    onChange={(event) => {
                      const direction = event.currentTarget.value;
                      onChange({
                        ...spec,
                        orderBy: spec.orderBy.map((entry, at) =>
                          at === index ? { ...entry, direction } : entry,
                        ),
                      });
                    }}
                  >
                    {!field?.directions.includes(order.direction) && (
                      <option value={order.direction}>{order.direction} (unavailable)</option>
                    )}
                    {field?.directions.map((direction) => (
                      <option key={direction}>{direction}</option>
                    ))}
                  </select>
                </label>
                <RemoveField
                  label="Remove sort field"
                  onClick={() =>
                    onChange({ ...spec, orderBy: spec.orderBy.filter((_, at) => at !== index) })
                  }
                />
              </div>
            );
          })}
          <div className="wr-restgo-graphql-pagination">
            {choice.orderBy.length > 0 && (
              <button
                type="button"
                className="wr-restgo-button"
                disabled={!firstOrder || !firstDirection}
                onClick={() =>
                  firstOrder &&
                  firstDirection &&
                  onChange({
                    ...spec,
                    orderBy: [
                      ...spec.orderBy,
                      { field: firstOrder.field, direction: firstDirection },
                    ],
                  })
                }
              >
                <Icon name="add" /> Add sort field
              </button>
            )}
            {choice.pagination && (
              <label className="wr-restgo-graphql-page-size">
                <span>Records per page</span>
                <input
                  type="number"
                  required
                  min={1}
                  max={database.maxPageSize}
                  value={spec.pageSize || ''}
                  onChange={(event) =>
                    onChange({ ...spec, pageSize: Number(event.currentTarget.value) })
                  }
                />
                <small>Maximum {database.maxPageSize}</small>
              </label>
            )}
          </div>
        </section>
      )}
    </>
  );
}
