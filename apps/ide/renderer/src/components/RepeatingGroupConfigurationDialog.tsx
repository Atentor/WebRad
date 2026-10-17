import {
  RepeatingGroupConfigurationSchema,
  comboBoxSchemaChoices,
  normalizeApiClientConfiguration,
  normalizeRepeatingGroupConfiguration,
  type ComponentNode,
  type RepeatingGroupConfiguration,
} from '@webrad/project-model';
import { useId, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { repeatingGroupSource } from './repeating-group-editor';
import { useRowConfigurationDialog } from './useRowConfigurationDialog';

interface RepeatingGroupConfigurationDialogProps {
  readonly component: ComponentNode;
  readonly availableComponents: readonly ComponentNode[];
  readonly onClose: () => void;
  readonly onSave: (configuration: RepeatingGroupConfiguration) => void;
}

const UNSELECTED = '__unselected__';

export function RepeatingGroupConfigurationDialog({
  component,
  availableComponents,
  onClose,
  onSave,
}: RepeatingGroupConfigurationDialogProps): ReactElement {
  const titleId = useId();
  const { dialogRef, handleKeyDown } = useRowConfigurationDialog(onClose);
  const [draft, setDraft] = useState(() =>
    normalizeRepeatingGroupConfiguration(component.props.repeatingGroupConfig),
  );
  const [numberDrafts, setNumberDrafts] = useState(() => ({
    fixedRowHeight: String(draft.fixedRowHeight),
    minRowHeight: String(draft.minRowHeight),
    maxRowHeight: draft.maxRowHeight === null ? '' : String(draft.maxRowHeight),
    gap: String(draft.gap),
  }));
  const source = repeatingGroupSource(availableComponents, draft);
  const apiClients = availableComponents.filter((candidate) => candidate.type === 'WebApiClient');
  const parsed = RepeatingGroupConfigurationSchema.safeParse(draft);
  const unbound = draft.apiClientId === null && draft.operationId === null;
  const sourceMessage = unbound
    ? 'Unbound: supply rows in code or select an API Client.'
    : source.client === undefined
      ? 'The saved API Client is unavailable. Select another client or choose Unbound.'
      : source.apiConfiguration?.operations.length === 0
        ? 'Add an operation in the selected API Client before binding this group.'
        : source.operation === undefined
          ? 'The saved operation is unavailable. Select an operation.'
          : source.lists.length === 0
            ? 'Save a response schema containing a list in the API Client editor.'
            : !source.lists.some((choice) => choice.path === draft.listPath)
              ? 'The saved response list is unavailable. Select a list.'
              : undefined;
  const valid =
    parsed.success &&
    numberDrafts.minRowHeight.trim() !== '' &&
    numberDrafts.gap.trim() !== '' &&
    (draft.rowHeightMode !== 'fixed' || numberDrafts.fixedRowHeight.trim() !== '') &&
    (unbound ||
      (source.client !== undefined &&
        source.operation !== undefined &&
        source.lists.some((choice) => choice.path === draft.listPath)));
  const setNumber = (
    property: 'fixedRowHeight' | 'minRowHeight' | 'maxRowHeight' | 'gap',
    value: string,
  ): void => {
    setNumberDrafts((current) => ({ ...current, [property]: value }));
    if (value === '' && property === 'maxRowHeight') {
      setDraft((current) => ({ ...current, maxRowHeight: null }));
    } else if (value.trim() !== '' && Number.isFinite(Number(value))) {
      setDraft((current) => ({ ...current, [property]: Number(value) }));
    }
  };
  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-data-grid-configuration-dialog wr-repeating-group-configuration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Repeating Group / {component.name}</span>
            <h2 id={titleId}>Configure Repeating Group</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close Repeating Group configuration"
            onClick={onClose}
          >
            &times;
          </button>
        </header>
        <form
          className="wr-data-grid-configuration-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && parsed.success) onSave(parsed.data);
          }}
        >
          <div className="wr-data-grid-configuration-content">
            <p className="wr-modal-description">
              Design one row on the canvas. Its components and responsive layout repeat for every
              item. The API Client updates rows after your code executes the selected operation.
            </p>
            <fieldset className="wr-row-editor-section">
              <legend>Data source</legend>
              <div className="wr-data-grid-configuration-fields">
                <label>
                  <span>API Client</span>
                  <select
                    aria-label="Repeating Group API Client"
                    value={draft.apiClientId ?? ''}
                    onChange={(event) => {
                      const id = event.currentTarget.value;
                      const client = apiClients.find((candidate) => candidate.id === id);
                      const operation =
                        client === undefined
                          ? undefined
                          : normalizeApiClientConfiguration(client.props.apiClientConfig)
                              .operations[0];
                      const choices = comboBoxSchemaChoices(operation?.responseSchema, '');
                      setDraft((current) => ({
                        ...current,
                        apiClientId: client?.id ?? null,
                        operationId: operation?.id ?? null,
                        listPath: choices.lists[0]?.path ?? '',
                      }));
                    }}
                  >
                    <option value="">Unbound</option>
                    {draft.apiClientId !== null && source.client === undefined && (
                      <option value={draft.apiClientId} disabled>
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
                    aria-label="Repeating Group operation"
                    disabled={
                      draft.apiClientId === null || source.apiConfiguration?.operations.length === 0
                    }
                    value={draft.operationId ?? ''}
                    onChange={(event) => {
                      const operationId = event.currentTarget.value;
                      const operation = source.apiConfiguration?.operations.find(
                        (candidate) => candidate.id === operationId,
                      );
                      const choices = comboBoxSchemaChoices(operation?.responseSchema, '');
                      setDraft((current) => ({
                        ...current,
                        operationId,
                        listPath: choices.lists[0]?.path ?? '',
                      }));
                    }}
                  >
                    <option value="" disabled>
                      (select an operation)
                    </option>
                    {draft.operationId !== null && source.operation === undefined && (
                      <option value={draft.operationId} disabled>
                        (unavailable operation)
                      </option>
                    )}
                    {source.apiConfiguration?.operations.map((operation) => (
                      <option key={operation.id} value={operation.id}>
                        {operation.name} — {operation.method} {operation.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wr-repeating-group-full-width">
                  <span>Response list</span>
                  <select
                    aria-label="Repeating Group response list"
                    disabled={source.operation === undefined}
                    value={
                      source.lists.some((choice) => choice.path === draft.listPath)
                        ? draft.listPath
                        : UNSELECTED
                    }
                    onChange={(event) => {
                      const listPath = event.currentTarget.value;
                      setDraft((current) => ({ ...current, listPath }));
                    }}
                  >
                    <option value={UNSELECTED} disabled>
                      (select a list)
                    </option>
                    {source.lists.map((choice) => (
                      <option key={choice.path} value={choice.path}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {sourceMessage !== undefined && (
                <p role="status" className="wr-row-editor-hint">
                  {sourceMessage}
                </p>
              )}
            </fieldset>
            <fieldset className="wr-row-editor-section">
              <legend>Row sizing</legend>
              <div className="wr-data-grid-configuration-fields">
                <label>
                  <span>Row height</span>
                  <select
                    aria-label="Repeating Group row height"
                    value={draft.rowHeightMode}
                    onChange={(event) => {
                      const rowHeightMode =
                        event.currentTarget.value === 'fixed' ? 'fixed' : 'dynamic';
                      setDraft((current) => ({ ...current, rowHeightMode }));
                    }}
                  >
                    <option value="dynamic">Fit contents</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
                {(
                  [
                    ['fixedRowHeight', 'Fixed row height'],
                    ['minRowHeight', 'Minimum row height'],
                    ['maxRowHeight', 'Maximum row height'],
                    ['gap', 'Gap between rows'],
                  ] as const
                ).map(([property, label]) => (
                  <label key={property}>
                    <span>{label}</span>
                    <input
                      type="number"
                      aria-label={`Repeating Group ${label.toLowerCase()}`}
                      min={property === 'fixedRowHeight' || property === 'maxRowHeight' ? 1 : 0}
                      max={10000}
                      step="any"
                      placeholder={property === 'maxRowHeight' ? 'Unlimited' : undefined}
                      disabled={property === 'fixedRowHeight' && draft.rowHeightMode !== 'fixed'}
                      required={
                        property !== 'maxRowHeight' &&
                        (property !== 'fixedRowHeight' || draft.rowHeightMode === 'fixed')
                      }
                      aria-invalid={
                        parsed.error?.issues.some((issue) => issue.path[0] === property) ||
                        (property !== 'maxRowHeight' &&
                          numberDrafts[property].trim() === '' &&
                          (property !== 'fixedRowHeight' || draft.rowHeightMode === 'fixed'))
                      }
                      value={numberDrafts[property]}
                      onChange={(event) => setNumber(property, event.currentTarget.value)}
                    />
                  </label>
                ))}
                <label className="wr-repeating-group-full-width">
                  <span>Empty message</span>
                  <input
                    aria-label="Repeating Group empty message"
                    maxLength={2000}
                    value={draft.emptyMessage}
                    onChange={(event) => {
                      const emptyMessage = event.currentTarget.value;
                      setDraft((current) => ({ ...current, emptyMessage }));
                    }}
                  />
                </label>
              </div>
              <p className="wr-row-editor-hint">
                Minimum and maximum heights apply to Fit contents. Fixed rows use the fixed height.
              </p>
            </fieldset>
            {!parsed.success && (
              <p role="alert" className="wr-modal-description">
                {parsed.error.issues[0]?.message}
              </p>
            )}
            <p className="wr-modal-description">
              Select a component inside the row and use Current row in the Object Inspector to bind
              its visual values. Changing the source removes bindings for fields no longer
              available.
            </p>
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
