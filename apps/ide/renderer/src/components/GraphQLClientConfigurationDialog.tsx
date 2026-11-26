import {
  graphQLClientOperationIds,
  type ComponentNode,
  type ProjectGraphQLOperation,
} from '@webrad/project-model';
import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface GraphQLClientConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly operationUsers: ReadonlyMap<string, readonly string[]>;
  readonly onSave: (operationIds: readonly string[]) => void;
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
  const [selected, setSelected] = useState(() => new Set(graphQLClientOperationIds(component)));
  const availableIds = new Set(operations.map(({ id }) => id));
  const choices = [
    ...operations.map(({ id, name, runtime }) => ({
      id,
      name,
      detail: `${runtime.kind} · ${runtime.database}/${runtime.table}`,
    })),
    ...[...selected]
      .filter((id) => !availableIds.has(id))
      .map((id) => ({
        id,
        name: id,
        detail: 'Unavailable',
      })),
  ];

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
        <div>
          <span className="wr-modal-eyebrow">{component.name}</span>
          <h2 id={titleId}>Configure GraphQL Client</h2>
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
          onSave([...selected]);
        }}
      >
        <p className="wr-modal-description">
          {choices.length === 0
            ? 'Save a query or mutation in RestGO → GraphQL to add it here.'
            : 'Select the queries and mutations available through this client.'}
        </p>
        {choices.length > 0 && (
          <div className="wr-graphql-client-operations">
            {choices.map(({ id, name, detail }) => (
              <label key={id}>
                <input
                  type="checkbox"
                  value={id}
                  checked={selected.has(id)}
                  disabled={selected.has(id) && operationUsers.has(id)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                />
                <span>{name}</span>
                <small>
                  {detail}
                  {operationUsers.has(id) && ` · Used by ${operationUsers.get(id)?.join(', ')}`}
                </small>
              </label>
            ))}
          </div>
        )}
        <footer className="wr-modal-actions">
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
