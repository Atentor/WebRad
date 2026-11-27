import {
  graphQLClientConfiguration,
  groupGraphQLEndpoints,
  type ComponentNode,
  type GraphQLClientConfiguration,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const endpointsPerPage = 50;

interface GraphQLClientConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly operationUsers: ReadonlyMap<string, readonly string[]>;
  readonly onSave: (configuration: GraphQLClientConfiguration) => void;
  readonly onClose: () => void;
}

export function GraphQLClientConfigurationDialog({
  component,
  operations,
  operationUsers,
  onSave,
  onClose,
}: GraphQLClientConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endpoints = useMemo(() => groupGraphQLEndpoints(operations), [operations]);
  const [configuration, setConfiguration] = useState(() => {
    const saved = graphQLClientConfiguration(component);
    if (!Array.isArray(saved)) return saved;
    const endpoint = endpoints.find(
      ({ operations }) =>
        operations.length === saved.length && operations.every(({ id }) => saved.includes(id)),
    );
    return endpoint ? { endpoint: endpoint.key } : saved;
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const legacyIds = new Set(Array.isArray(configuration) ? configuration : []);
  const selectedEndpoint = Array.isArray(configuration) ? null : configuration.endpoint;
  const choices = endpoints.map((endpoint) => ({
    ...endpoint,
    active:
      endpoint.key === selectedEndpoint || endpoint.operations.some(({ id }) => legacyIds.has(id)),
    actions: [...new Set(endpoint.operations.map(({ spec }) => spec.kind))]
      .map((kind) => kind.charAt(0).toUpperCase() + kind.slice(1))
      .join(', '),
  }));
  const hasSelection = selectedEndpoint !== null || legacyIds.size > 0;
  const activeCount = choices.filter(({ active }) => active).length;
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchingChoices = choices.filter(
    ({ active, name, database, table, actions, operations }) => {
      if (status !== 'all' && active !== (status === 'active')) return false;
      if (terms.length === 0) return true;
      const searchableText = [
        name,
        `${database}/${table}`,
        actions,
        ...operations.map(({ name }) => name),
      ]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => searchableText.includes(term));
    },
  );
  const pageCount = Math.max(1, Math.ceil(matchingChoices.length / endpointsPerPage));
  const currentPage = Math.min(page, pageCount);
  const firstResult = (currentPage - 1) * endpointsPerPage;
  const visibleChoices = matchingChoices.slice(firstResult, firstResult + endpointsPerPage);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="wr-modal wr-graphql-client-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="wr-modal-header">
        <div className="wr-graphql-client-heading">
          <span className="wr-graphql-client-heading-icon">
            <Icon name="network" />
          </span>
          <div>
            <span className="wr-modal-eyebrow" title={component.name}>
              {component.name}
            </span>
            <h2 id={titleId}>Configure GraphQL Client</h2>
          </div>
        </div>
        <button
          type="button"
          className="wr-modal-close"
          aria-label="Close GraphQL Client"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(configuration);
        }}
      >
        <div className="wr-graphql-client-content">
          {choices.length === 0 ? (
            <p className="wr-graphql-client-empty">
              Save an endpoint in RestGO → GraphQL to add it here.
            </p>
          ) : (
            <>
              <div className="wr-graphql-client-filters">
                <label className="wr-graphql-client-filter">
                  Search
                  <span className="wr-graphql-client-search">
                    <Icon name="search" />
                    <input
                      type="search"
                      aria-label="Search GraphQL endpoints"
                      placeholder="Endpoint, database or table"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        setPage(1);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                        }
                      }}
                    />
                  </span>
                </label>
                <label className="wr-graphql-client-filter">
                  Status
                  <select
                    aria-label="GraphQL endpoint status"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.currentTarget.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              {legacyIds.size > 0 && (
                <p className="wr-modal-description">
                  Choose an endpoint to include all its actions. Existing operation selections stay
                  active until you choose an endpoint.
                </p>
              )}
              <div
                key={JSON.stringify([search, status, currentPage])}
                className="wr-graphql-client-operations"
                role="radiogroup"
                aria-label="GraphQL endpoints"
              >
                {visibleChoices.map(({ key, name, database, table, actions, operations }) => {
                  const ids = new Set(operations.map(({ id }) => id));
                  const users = [
                    ...new Set(operations.flatMap(({ id }) => operationUsers.get(id) ?? [])),
                  ];
                  const incompatibleBinding = [...operationUsers.keys()].some((id) => !ids.has(id));
                  const detail = [
                    actions,
                    `${database}/${table}`,
                    users.length > 0 && `Used by ${users.join(', ')}`,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <label key={key}>
                      <input
                        type="radio"
                        name={titleId}
                        value={key}
                        checked={selectedEndpoint === key}
                        disabled={
                          incompatibleBinding || (selectedEndpoint === key && users.length > 0)
                        }
                        onChange={() => setConfiguration({ endpoint: key })}
                      />
                      <span className="wr-graphql-client-operation-name" title={name}>
                        {name}
                      </span>
                      <small className="wr-graphql-client-operation-detail" title={detail}>
                        {detail}
                      </small>
                    </label>
                  );
                })}
              </div>
              {visibleChoices.length === 0 ? (
                <p className="wr-graphql-client-empty" role="status">
                  No matching endpoints.
                </p>
              ) : (
                <div className="wr-graphql-client-results">
                  <span role="status">
                    {pageCount === 1
                      ? `${matchingChoices.length} ${matchingChoices.length === 1 ? 'result' : 'results'}`
                      : `${firstResult + 1}–${firstResult + visibleChoices.length} of ${matchingChoices.length}`}
                    {' · '}
                    {activeCount} active
                  </span>
                  {pageCount > 1 && (
                    <div className="wr-graphql-client-pagination">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setPage(currentPage - 1)}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={currentPage === pageCount}
                        onClick={() => setPage(currentPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <footer className="wr-modal-actions">
          {hasSelection && (
            <button
              type="button"
              className="wr-graphql-client-clear"
              disabled={operationUsers.size > 0}
              onClick={() => setConfiguration({ endpoint: null })}
            >
              Clear selection
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save GraphQL Client
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
