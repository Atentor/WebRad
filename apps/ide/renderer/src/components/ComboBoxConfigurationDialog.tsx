import { Icon } from './Icon';
import {
  ComboBoxConfigurationSchema,
  comboBoxSchemaChoices,
  createDefaultComboBoxConfiguration,
  normalizeApiClientConfiguration,
  selectComponentGraphQLOperations,
  type ComboBoxConfiguration,
  type ComponentNode,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  ApiClientOperationOptions,
  apiEndpointOption,
  graphqlQueryOption,
} from './ApiClientOperationOptions';

interface ComboBoxConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly graphQLOperations?: readonly ProjectGraphQLOperation[];
  readonly onClose: () => void;
  readonly onSave: (configuration: ComboBoxConfiguration | null) => void;
}

const UNSELECTED = '__unselected__';

export function ComboBoxConfigurationDialog({
  component,
  availableComponents,
  graphQLOperations = [],
  onClose,
  onSave,
}: ComboBoxConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLSelectElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [draft, setDraft] = useState<ComboBoxConfiguration | null>(() => {
    const parsed = ComboBoxConfigurationSchema.safeParse(component.props.comboBoxConfig);
    return parsed.success ? parsed.data : null;
  });
  const clients = availableComponents.filter(
    (candidate) => candidate.type === 'WebApiClient' || candidate.type === 'WebGraphQLClient',
  );
  const graphQL = draft?.graphqlClientId;
  const sourceId = graphQL ?? draft?.apiClientId ?? null;
  const client = clients.find((candidate) => candidate.id === sourceId);
  const apiConfiguration =
    client?.type === 'WebApiClient'
      ? normalizeApiClientConfiguration(client.props.apiClientConfig)
      : undefined;
  const endpoints = apiConfiguration?.operations ?? [];
  const queries =
    client?.type !== 'WebGraphQLClient'
      ? []
      : selectComponentGraphQLOperations(client, graphQLOperations).filter(
          (candidate) => candidate.runtime.kind === 'query',
        );
  const operation =
    graphQL === undefined
      ? endpoints.find((candidate) => candidate.id === draft?.operationId)
      : queries.find((candidate) => candidate.id === draft?.operationId);
  const choices = comboBoxSchemaChoices(
    operation?.responseSchema,
    graphQL === undefined ? (draft?.listPath ?? '') : '',
  );
  const valid =
    draft === null ||
    (client !== undefined &&
      operation !== undefined &&
      (graphQL !== undefined || choices.lists.some((choice) => choice.path === draft.listPath)) &&
      choices.fields.some((choice) => choice.path === draft.displayField) &&
      choices.fields.some((choice) => choice.path === draft.keyField));

  useEffect(() => {
    sourceRef.current?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled)',
      ) ?? []),
    ];
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-data-grid-configuration-dialog wr-combo-box-configuration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">ComboBox / {component.name}</span>
            <h2 id={titleId}>Configure ComboBox</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close ComboBox configuration"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          className="wr-data-grid-configuration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onSave(draft);
          }}
        >
          <div className="wr-data-grid-configuration-content">
            <div className="wr-data-grid-configuration-fields">
              <label>
                <span>Data source</span>
                <select
                  ref={sourceRef}
                  aria-label="ComboBox data source"
                  value={draft === null ? '' : (sourceId ?? UNSELECTED)}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    const selected = clients.find((candidate) => candidate.id === id);
                    if (selected === undefined) {
                      setDraft(null);
                      return;
                    }
                    if (selected.type === 'WebGraphQLClient') {
                      setDraft({ ...createDefaultComboBoxConfiguration(), graphqlClientId: id });
                      return;
                    }
                    const nextEndpoint = normalizeApiClientConfiguration(
                      selected.props.apiClientConfig,
                    ).operations[0];
                    const nextChoices = comboBoxSchemaChoices(nextEndpoint?.responseSchema, '');
                    setDraft({
                      ...createDefaultComboBoxConfiguration(),
                      apiClientId: id,
                      operationId: nextEndpoint?.id ?? null,
                      listPath: nextChoices.lists[0]?.path ?? '',
                    });
                  }}
                >
                  <option value="">Static items</option>
                  {draft !== null && client === undefined && (
                    <option value={sourceId ?? UNSELECTED} disabled>
                      (unavailable client)
                    </option>
                  )}
                  {[
                    ['WebApiClient', 'API Client'],
                    ['WebGraphQLClient', 'GraphQL Client'],
                  ].map(([type, label]) => {
                    const group = clients.filter((candidate) => candidate.type === type);
                    return group.length === 0 ? null : (
                      <optgroup key={type} label={label}>
                        {group.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <label>
                <span>Operation</span>
                <select
                  aria-label="ComboBox operation"
                    disabled={client === undefined}
                  value={
                    graphQL === undefined
                      ? apiEndpointOption(draft?.operationId ?? null)
                      : graphqlQueryOption(draft?.operationId ?? null)
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
                    const nextChoices = comboBoxSchemaChoices(nextEndpoint?.responseSchema, '');
                    setDraft({
                      ...createDefaultComboBoxConfiguration(),
                      apiClientId: graphQL === undefined ? sourceId : null,
                      operationId: nextQuery?.id ?? nextEndpoint?.id ?? null,
                      listPath: nextChoices.lists[0]?.path ?? '',
                      ...(graphQL === undefined ? {} : { graphqlClientId: graphQL }),
                    });
                  }}
                >
                  <ApiClientOperationOptions endpoints={endpoints} queries={queries} />
                </select>
              </label>
              {graphQL === undefined && (
                <label>
                  <span>Response list</span>
                  <select
                    aria-label="ComboBox response list"
                    disabled={operation === undefined}
                    value={
                      choices.lists.some((choice) => choice.path === draft?.listPath)
                        ? draft?.listPath
                        : UNSELECTED
                    }
                    onChange={(event) => {
                      const listPath = event.currentTarget.value;
                      setDraft((current) =>
                        current === null
                          ? null
                          : { ...current, listPath, displayField: '', keyField: '' },
                      );
                    }}
                  >
                    <option value={UNSELECTED} disabled>
                      (select a list)
                    </option>
                    {choices.lists.map((choice) => (
                      <option key={choice.path} value={choice.path}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(['displayField', 'keyField'] as const).map((field) => {
                const label = field === 'displayField' ? 'Display field' : 'Key field';
                return (
                  <label key={field}>
                    <span>{label}</span>
                    <select
                      aria-label={`ComboBox ${label.toLowerCase()}`}
                      disabled={draft === null || choices.fields.length === 0}
                      value={
                        choices.fields.some((choice) => choice.path === draft?.[field])
                          ? draft?.[field]
                          : UNSELECTED
                      }
                      onChange={(event) => {
                        const path = event.currentTarget.value;
                        setDraft((current) =>
                          current === null ? null : { ...current, [field]: path },
                        );
                      }}
                    >
                      <option value={UNSELECTED} disabled>
                        (select a field)
                      </option>
                      {choices.fields.map((choice) => (
                        <option key={choice.path} value={choice.path}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            {draft !== null && choices.lists.length === 0 && (
              <p className="wr-modal-description">
                {graphQL === undefined
                  ? 'Save a response schema containing a list in the API Client editor to select its fields.'
                  : 'Save a query with selected output fields in RestGO > GraphQL.'}
              </p>
            )}
          </div>
          <footer className="wr-modal-actions wr-data-grid-configuration-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!valid}>
              Save
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
