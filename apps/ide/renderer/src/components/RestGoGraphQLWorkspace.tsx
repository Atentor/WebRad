import {
  buildProjectGraphQLOperation,
  defaultIdFactory,
  describeGraphQLOperations,
  type GraphQLOperationChoice,
  type GraphQLOperationSpec,
  type GraphQLSchema,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import type { RestGoAdminGraphQLDatabase } from '../../../shared/restgo-admin';
import { Icon } from './Icon';
import { RemoveField, RestGoGraphQLConditionGroup, RestGoGraphQLMutationInputs } from './RestGoGraphQLParameters';
import {
  buildGraphQLSpec,
  editGraphQLOperation,
  newGraphQLSpec,
  type OperationDraft,
} from './restgo-graphql-draft';
import { restGoErrorMessage } from './restgo-workspace-model';
import './restgo-graphql-workspace.css';

const KINDS = {
  query: 'Query',
  insert: 'Insert',
  update: 'Update',
  delete: 'Delete',
} as const satisfies Record<GraphQLOperationSpec['kind'], string>;

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
  active, baseUrl, defaultDatabase, refreshVersion, operations, onSave, onDirtyChange, onMetadataFailure,
}: RestGoGraphQLWorkspaceProps): ReactElement {
  const [databases, setDatabases] = useState<readonly RestGoAdminGraphQLDatabase[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [schemaState, setSchemaState] = useState<{
    readonly databaseId: number;
    readonly version: number;
    readonly schema: GraphQLSchema | null;
    readonly error?: string;
  } | null>(null);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [baseline, setBaseline] = useState<OperationDraft | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const database = databases.find((item) => item.slug === draft?.database);
  const databaseId = database?.id;
  const currentSchemaState = schemaState?.databaseId === databaseId && schemaState?.version === refreshVersion ? schemaState : null;
  const schema = currentSchemaState?.schema ?? null;
  const kind = draft?.spec.kind ?? 'query';
  const { choices, schemaError } = useMemo(() => {
    try {
      return { choices: schema ? describeGraphQLOperations(schema, kind) : [], schemaError: '' };
    } catch (reason) {
      return { choices: [], schemaError: restGoErrorMessage(reason) };
    }
  }, [schema, kind]);
  const choice = choices.find((item) => item.rootField === draft?.spec.rootField);
  const visibleOperations = operations.filter((operation) =>
    `${operation.name} ${operation.database} ${KINDS[operation.spec.kind]}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!active) return;
    let canceled = false;
    setCatalogLoading(true);
    setCatalogError('');
    void window.webrad.restgoAdmin.graphqlDatabases({ baseUrl }).then((next) => {
      if (!canceled) setDatabases(next);
    }).catch((reason: unknown) => {
      if (canceled) return;
      setDatabases([]);
      setCatalogError(restGoErrorMessage(reason));
      onMetadataFailure();
    }).finally(() => {
      if (!canceled) setCatalogLoading(false);
    });
    return () => { canceled = true; };
  }, [active, baseUrl, refreshVersion, onMetadataFailure]);

  useEffect(() => {
    if (!active || databaseId === undefined) return;
    let canceled = false;
    void window.webrad.restgoAdmin.graphqlSchema({ baseUrl, id: databaseId }).then((next) => {
      if (!canceled) setSchemaState({ databaseId, version: refreshVersion, schema: next });
    }).catch((reason: unknown) => {
      if (canceled) return;
      setSchemaState({ databaseId, version: refreshVersion, schema: null, error: restGoErrorMessage(reason) });
      onMetadataFailure();
    });
    return () => { canceled = true; };
  }, [active, databaseId, baseUrl, refreshVersion, onMetadataFailure]);

  const selectDraft = (next: OperationDraft | null, saved: boolean): void => {
    setDraft(next);
    setBaseline(saved ? next : null);
    setError('');
    setNotice('');
  };

  const create = (): void => {
    const defaultChoice = databases.find((entry) => entry.slug === defaultDatabase) ?? databases[0];
    if (!defaultChoice) return;
    selectDraft({
      id: defaultIdFactory(),
      name: '',
      database: defaultChoice.slug,
      spec: newGraphQLSpec('query', defaultChoice.defaultPageSize),
    }, false);
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!draft || !choice || !database || !schema || !onSave || saving || catalogLoading) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const operation = buildProjectGraphQLOperation(schema, {
        id: draft.id,
        name: draft.name.trim(),
        database: database.slug,
        spec: buildGraphQLSpec(draft.spec, choice),
      }, database.maxPageSize);
      if (operations.some((item) => item.id !== operation.id && item.name.toLowerCase() === operation.name.toLowerCase())) {
        throw new Error('Choose a unique operation name.');
      }
      await onSave(operations.some((item) => item.id === operation.id)
        ? operations.map((item) => item.id === operation.id ? operation : item)
        : [...operations, operation]);
      selectDraft(editGraphQLOperation(operation), true);
      setNotice('Operation applied. Save the project to keep it.');
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!baseline || !onSave || saving || !window.confirm(`Remove ${baseline.name} from this project?`)) return;
    setSaving(true);
    setError('');
    try {
      await onSave(operations.filter((item) => item.id !== baseline.id));
      selectDraft(null, false);
      setNotice('Operation removed. Save the project to keep the change.');
    } catch (reason) {
      setError(restGoErrorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section hidden={!active} className="wr-restgo-endpoints-layout wr-restgo-graphql-workspace" aria-label="GraphQL operations">
      <aside className="wr-restgo-endpoint-list">
        <div className="wr-restgo-endpoint-list-toolbar">
          <strong>Operations</strong>
          <button type="button" aria-label="New GraphQL operation" className="wr-restgo-button wr-restgo-new-endpoint" disabled={!onSave || !databases.length || catalogLoading || dirty || saving} onClick={create}>
            <Icon name="add" />
            New
          </button>
        </div>
        <label className="wr-restgo-search">
          <Icon name="search" />
          <input type="search" aria-label="Search GraphQL operations" placeholder="Search operations" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
        </label>
        {visibleOperations.map((operation) => (
          <button type="button" className="wr-restgo-endpoint-list-item" key={operation.id} aria-pressed={draft?.id === operation.id} disabled={dirty || saving} onClick={() => selectDraft(editGraphQLOperation(operation), true)}>
            <span><strong>{operation.name}</strong></span>
            <span className="wr-restgo-list-methods"><small>{KINDS[operation.spec.kind]}</small>{operation.database}</span>
          </button>
        ))}
        {search && !visibleOperations.length && <p className="wr-restgo-list-note">No matching operations.</p>}
      </aside>
      <div className="wr-restgo-endpoint-content">
        {catalogLoading && <p className="wr-restgo-graphql-message" role="status">Loading published databases…</p>}
        {catalogError && <p className="wr-restgo-graphql-message wr-restgo-graphql-error" role="alert">{catalogError}</p>}
        {notice && <p className="wr-restgo-graphql-message" role="status">{notice}</p>}
        {!draft ? (
          <div className="wr-restgo-empty-state">
            <Icon name="waypoints" />
            <h2>{operations.length ? 'Choose an operation' : 'Create a GraphQL operation'}</h2>
            {!catalogLoading && !catalogError && !databases.length && <p>No GraphQL databases are published in this RestGO instance.</p>}
            {databases.length > 0 && <p>Choose a published table, select fields and map parameters for your application.</p>}
            {error && <p className="wr-restgo-graphql-error" role="alert">{error}</p>}
          </div>
        ) : (
          <form className="wr-restgo-graphql-editor" onSubmit={(event) => { void save(event); }}>
            <fieldset disabled={saving} className="wr-restgo-graphql-body">
              <section className="wr-restgo-editor-section">
                <h2>{baseline ? 'Edit operation' : 'New operation'}</h2>
                <div className="wr-restgo-graphql-operation-fields">
                  <label>Operation name<input aria-label="GraphQL operation name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} /></label>
                  <label>
                    Published database
                    <select aria-label="GraphQL database" value={draft.database} onChange={(event) => {
                      const next = databases.find((entry) => entry.slug === event.currentTarget.value);
                      if (next) setDraft({ ...draft, database: next.slug, spec: newGraphQLSpec(kind, next.defaultPageSize) });
                    }}>
                      {!database && <option value={draft.database}>{draft.database} (unavailable)</option>}
                      {databases.map((entry) => <option key={entry.id} value={entry.slug}>{entry.name} ({entry.slug})</option>)}
                    </select>
                  </label>
                  <label>
                    Action
                    <select aria-label="GraphQL action" value={kind} onChange={(event) => {
                      const nextKind = event.currentTarget.value as GraphQLOperationSpec['kind'];
                      setDraft({ ...draft, spec: newGraphQLSpec(nextKind, database?.defaultPageSize ?? draft.spec.pageSize) });
                    }}>
                      {Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    Table
                    <select aria-label="GraphQL table" required disabled={!schema} value={draft.spec.rootField} onChange={(event) => {
                      const next = choices.find((item) => item.rootField === event.currentTarget.value);
                      setDraft({ ...draft, spec: newGraphQLSpec(kind, database?.defaultPageSize ?? draft.spec.pageSize, next) });
                    }}>
                      <option value="">Choose a published table</option>
                      {!choice && draft.spec.rootField && <option value={draft.spec.rootField}>{draft.spec.rootField} (unavailable)</option>}
                      {choices.map((item) => <option key={item.rootField} value={item.rootField}>{item.table}</option>)}
                    </select>
                  </label>
                </div>
                {database && <p className="wr-restgo-graphql-endpoint"><code>{database.endpoint}</code></p>}
                {!database && !catalogLoading && <p role="status">Choose an available published database to edit this operation.</p>}
                {database && !currentSchemaState && <p role="status">Loading published schema…</p>}
                {currentSchemaState?.error && <p role="alert" className="wr-restgo-graphql-error">{currentSchemaState.error}</p>}
                {schemaError && <p role="alert" className="wr-restgo-graphql-error">{schemaError}</p>}
                {schema && !schemaError && choices.length === 0 && <p role="status">The published schema has no tables for this action.</p>}
              </section>
              {choice && database && <GraphQLOperationFields draft={draft} database={database} choice={choice} onChange={(spec) => setDraft({ ...draft, spec })} />}
            </fieldset>
            {error && <p className="wr-restgo-graphql-message wr-restgo-graphql-error" role="alert">{error}</p>}
            <div className="wr-restgo-graphql-editor-actions">
              {baseline && <button type="button" className="wr-restgo-button is-danger" disabled={saving || !onSave} onClick={() => { void remove(); }}><Icon name="delete" /> Remove operation</button>}
              <button type="button" className="wr-restgo-button" disabled={saving} onClick={() => dirty ? selectDraft(baseline, true) : selectDraft(null, false)}>{dirty ? 'Discard changes' : 'Close'}</button>
              <button type="submit" className="wr-restgo-button is-primary" disabled={saving || catalogLoading || !dirty || !choice || !onSave}><Icon name="save" /> Save operation</button>
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

function GraphQLOperationFields({ draft: { spec }, database, choice, onChange }: OperationFieldsProps): ReactElement {
  const availableOrder = choice.orderBy.filter((available) => !spec.orderBy.some((order) => order.field === available.field));
  const firstOrder = availableOrder[0];
  const firstDirection = firstOrder?.directions[0];
  const visibleFields = new Set(choice.selection.map((field) => field.path));
  const missingFields = spec.selectionPaths.filter((field) => !visibleFields.has(field));
  return (
    <>
      {choice.inputs.length > 0 && (
        <section className="wr-restgo-editor-section">
          <h2>Values to write</h2>
          <RestGoGraphQLMutationInputs operation={choice} inputs={spec.inputs} onChange={(inputs) => onChange({ ...spec, inputs })} />
        </section>
      )}
      {(choice.filters.length > 0 || spec.conditions.items.length > 0) && (
        <section className="wr-restgo-editor-section">
          <h2>Conditions</h2>
          {(spec.kind === 'update' || spec.kind === 'delete') && <p>Set a condition that selects the record to change.</p>}
          <RestGoGraphQLConditionGroup
            group={spec.conditions}
            operation={choice}
            requireValues={spec.kind === 'update' || spec.kind === 'delete'}
            onChange={(conditions) => onChange({ ...spec, conditions })}
          />
        </section>
      )}
      {(choice.selection.length > 0 || missingFields.length > 0) && (
        <section className="wr-restgo-editor-section">
          <h2>Return fields</h2>
          <div className="wr-restgo-graphql-selection">
            {[...choice.selection.map((field) => ({ path: field.path, label: field.label, type: field.type })), ...missingFields.map((path) => ({ path, label: path, type: 'Unavailable' }))].map((field) => (
              <label key={field.path} className="wr-restgo-graphql-check" title={field.path}>
                <input
                  type="checkbox"
                  checked={spec.selectionPaths.includes(field.path)}
                  onChange={(event) => onChange({ ...spec, selectionPaths: event.currentTarget.checked ? [...spec.selectionPaths, field.path] : spec.selectionPaths.filter((path) => path !== field.path) })}
                />
                <span>{field.label}<small>{field.type}</small></span>
              </label>
            ))}
          </div>
        </section>
      )}
      {(choice.orderBy.length > 0 || choice.pagination) && (
        <section className="wr-restgo-editor-section wr-restgo-graphql-condition-group">
          <h2>Sort and paginate</h2>
          {spec.orderBy.map((order, index) => {
            const field = choice.orderBy.find((item) => item.field === order.field);
            return (
              <div key={order.field} className="wr-restgo-graphql-row-fields">
                <label>
                  Sort field
                  <select value={order.field} onChange={(event) => {
                    const next = availableOrder.find((item) => item.field === event.currentTarget.value);
                    const direction = next?.directions[0];
                    if (next && direction) onChange({ ...spec, orderBy: spec.orderBy.map((entry, at) => at === index ? { field: next.field, direction } : entry) });
                  }}>
                    <option value={order.field}>{order.field}{field ? '' : ' (unavailable)'}</option>
                    {availableOrder.map((item) => <option key={item.field}>{item.field}</option>)}
                  </select>
                </label>
                <label>
                  Direction
                  <select value={order.direction} onChange={(event) => {
                    const direction = event.currentTarget.value;
                    onChange({ ...spec, orderBy: spec.orderBy.map((entry, at) => at === index ? { ...entry, direction } : entry) });
                  }}>
                    {!field?.directions.includes(order.direction) && <option value={order.direction}>{order.direction} (unavailable)</option>}
                    {field?.directions.map((direction) => <option key={direction}>{direction}</option>)}
                  </select>
                </label>
                <RemoveField label="Remove sort field" onClick={() => onChange({ ...spec, orderBy: spec.orderBy.filter((_, at) => at !== index) })} />
              </div>
            );
          })}
          {choice.orderBy.length > 0 && <div><button type="button" className="wr-restgo-button" disabled={!firstOrder || !firstDirection} onClick={() => firstOrder && firstDirection && onChange({ ...spec, orderBy: [...spec.orderBy, { field: firstOrder.field, direction: firstDirection }] })}><Icon name="add" /> Add sort field</button></div>}
          {choice.pagination && (
            <label className="wr-restgo-graphql-page-size">
              Records per page
              <input type="number" required min={1} max={database.maxPageSize} value={spec.pageSize || ''} onChange={(event) => onChange({ ...spec, pageSize: Number(event.currentTarget.value) })} />
              <small>Maximum {database.maxPageSize}</small>
            </label>
          )}
        </section>
      )}
    </>
  );
}
