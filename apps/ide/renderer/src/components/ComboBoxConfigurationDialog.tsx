import {
  ComboBoxConfigurationSchema,
  comboBoxSchemaChoices,
  createDefaultComboBoxConfiguration,
  normalizeApiClientConfiguration,
  type ComboBoxConfiguration,
  type ComponentNode,
} from '@webrad/project-model';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

interface ComboBoxConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (configuration: ComboBoxConfiguration | null) => void;
}

const UNSELECTED = '__unselected__';

export function ComboBoxConfigurationDialog({
  component,
  availableComponents,
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
  const apiClients = availableComponents.filter((candidate) => candidate.type === 'WebApiClient');
  const apiClient = apiClients.find((candidate) => candidate.id === draft?.apiClientId);
  const apiConfiguration =
    apiClient === undefined
      ? undefined
      : normalizeApiClientConfiguration(apiClient.props.apiClientConfig);
  const operation = apiConfiguration?.operations.find(
    (candidate) => candidate.id === draft?.operationId,
  );
  const choices = comboBoxSchemaChoices(operation?.responseSchema, draft?.listPath ?? '');
  const valid =
    draft === null ||
    (apiClient !== undefined &&
      operation !== undefined &&
      choices.lists.some((choice) => choice.path === draft.listPath) &&
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
            &times;
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
                <span>API Client</span>
                <select
                  ref={sourceRef}
                  aria-label="ComboBox API Client"
                  value={draft === null ? '' : (draft.apiClientId ?? UNSELECTED)}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    const selected = apiClients.find((candidate) => candidate.id === id);
                    if (selected === undefined) {
                      setDraft(null);
                      return;
                    }
                    const nextOperation = normalizeApiClientConfiguration(
                      selected.props.apiClientConfig,
                    ).operations[0];
                    const nextChoices = comboBoxSchemaChoices(nextOperation?.responseSchema, '');
                    setDraft({
                      ...createDefaultComboBoxConfiguration(),
                      apiClientId: id,
                      operationId: nextOperation?.id ?? null,
                      listPath: nextChoices.lists[0]?.path ?? '',
                    });
                  }}
                >
                  <option value="">Static items</option>
                  {draft !== null && apiClient === undefined && (
                    <option value={draft.apiClientId ?? UNSELECTED} disabled>
                      (unavailable API Client)
                    </option>
                  )}
                  {apiClients.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Operation</span>
                <select
                  aria-label="ComboBox operation"
                  disabled={draft === null}
                  value={operation?.id ?? ''}
                  onChange={(event) => {
                    const operationId = event.currentTarget.value;
                    const nextOperation = apiConfiguration?.operations.find(
                      (candidate) => candidate.id === operationId,
                    );
                    const nextChoices = comboBoxSchemaChoices(nextOperation?.responseSchema, '');
                    setDraft((current) =>
                      current === null
                        ? null
                        : {
                            ...current,
                            operationId,
                            listPath: nextChoices.lists[0]?.path ?? '',
                            displayField: '',
                            keyField: '',
                          },
                    );
                  }}
                >
                  <option value="">(select an operation)</option>
                  {apiConfiguration?.operations.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name} — {candidate.method} {candidate.path}
                    </option>
                  ))}
                </select>
              </label>
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
                Save a response schema containing a list in the API Client editor to select its
                fields.
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
