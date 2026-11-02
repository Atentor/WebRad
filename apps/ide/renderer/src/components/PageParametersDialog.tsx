import {
  PageParametersSchema,
  type PageModel,
  type PageParameterDefinition,
} from '@webrad/project-model';
import { useId, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useRowConfigurationDialog } from './useRowConfigurationDialog';
import { useEditorDraftPending } from './useEditorDraftPending';
import './PageParametersDialog.css';

interface ParameterDraft {
  readonly key: string;
  readonly name: string;
  readonly type: PageParameterDefinition['type'];
  readonly required: boolean;
  readonly useDefault: boolean;
  readonly defaultValue: string;
}

function draftParameter(parameter: PageParameterDefinition): ParameterDraft {
  return {
    key: crypto.randomUUID(),
    name: parameter.name,
    type: parameter.type,
    required: parameter.required,
    useDefault: parameter.defaultValue !== undefined,
    defaultValue: String(parameter.defaultValue ?? (parameter.type === 'boolean' ? false : '')),
  };
}

function parameterValue(row: ParameterDraft): string | number | boolean {
  if (row.type === 'boolean') return row.defaultValue === 'true';
  if (row.type === 'number') return row.defaultValue.trim() === '' ? NaN : Number(row.defaultValue);
  return row.defaultValue;
}

interface PageParametersDialogProps {
  readonly page: PageModel;
  readonly onSave: (parameters: readonly PageParameterDefinition[]) => void;
  readonly onClose: () => void;
}

export function PageParametersDialog({
  page,
  onSave,
  onClose,
}: PageParametersDialogProps): ReactElement {
  const titleId = useId();
  const { dialogRef, handleKeyDown } = useRowConfigurationDialog(onClose);
  const [rows, setRows] = useState(() => (page.parameters ?? []).map(draftParameter));
  const [changed, setChanged] = useState(false);
  useEditorDraftPending(changed);
  const parsed = PageParametersSchema.safeParse(
    rows.map((row) => ({
      name: row.name,
      type: row.type,
      required: row.required,
      ...(row.useDefault ? { defaultValue: parameterValue(row) } : {}),
    })),
  );
  const invalidNumber = rows.findIndex(
    (row) => row.useDefault && row.type === 'number' && !Number.isFinite(parameterValue(row)),
  );
  const error =
    invalidNumber >= 0
      ? `Parameter ${String(invalidNumber + 1)}: enter a finite numeric default.`
      : parsed.success
        ? null
        : parsed.error.issues
            .map((issue) => {
              const row =
                typeof issue.path[0] === 'number' ? `Parameter ${String(issue.path[0] + 1)}: ` : '';
              return row + issue.message;
            })
            .join(' ');
  const change = (key: string, patch: Partial<ParameterDraft>): void => {
    setChanged(true);
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  return createPortal(
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-page-parameters-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Page / {page.name}</span>
            <h2 id={titleId}>Page parameters</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close page parameters"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (parsed.success) onSave(parsed.data);
          }}
        >
          <div className="wr-page-parameters-content">
            <div className="wr-page-parameters-toolbar">
              <button
                type="button"
                aria-label="Add parameter"
                disabled={rows.length >= 100}
                onClick={() => {
                  const names = new Set(rows.map((row) => row.name));
                  let number = 1;
                  while (names.has(`parameter${String(number)}`)) number += 1;
                  const parameter = draftParameter({
                    name: `parameter${String(number)}`,
                    type: 'string',
                    required: false,
                  });
                  setRows((current) => [...current, parameter]);
                  setChanged(true);
                  requestAnimationFrame(() => {
                    const input = dialogRef.current?.querySelector<HTMLInputElement>(
                      `[data-parameter-key="${parameter.key}"] input`,
                    );
                    input?.focus();
                    input?.select();
                  });
                }}
              >
                Add parameter
              </button>
            </div>
            {rows.length === 0 ? (
              <p className="wr-modal-description">
                Add the inputs this page receives when navigating.
              </p>
            ) : (
              <div className="wr-page-parameters-table-scroll">
                <table className="wr-page-parameters-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Required</th>
                      <th scope="col">Default</th>
                      <th scope="col">Value</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={row.key} data-parameter-key={row.key}>
                        <td>
                          <input
                            className="wr-inspector-input"
                            aria-label={`Parameter ${String(index + 1)} name`}
                            spellCheck={false}
                            value={row.name}
                            onChange={(event) =>
                              change(row.key, { name: event.currentTarget.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            className="wr-inspector-select"
                            aria-label={`Parameter ${String(index + 1)} type`}
                            value={row.type}
                            onChange={(event) => {
                              const type = event.currentTarget.value as ParameterDraft['type'];
                              change(row.key, {
                                type,
                                defaultValue: type === 'boolean' ? 'false' : '',
                              });
                            }}
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Parameter ${String(index + 1)} required`}
                            checked={row.required}
                            onChange={(event) =>
                              change(row.key, { required: event.currentTarget.checked })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Parameter ${String(index + 1)} use default`}
                            checked={row.useDefault}
                            onChange={(event) =>
                              change(row.key, { useDefault: event.currentTarget.checked })
                            }
                          />
                        </td>
                        <td>
                          {row.type === 'boolean' ? (
                            <select
                              className="wr-inspector-select"
                              aria-label={`Parameter ${String(index + 1)} default value`}
                              disabled={!row.useDefault}
                              value={row.defaultValue}
                              onChange={(event) =>
                                change(row.key, { defaultValue: event.currentTarget.value })
                              }
                            >
                              <option value="false">False</option>
                              <option value="true">True</option>
                            </select>
                          ) : (
                            <input
                              className="wr-inspector-input"
                              aria-label={`Parameter ${String(index + 1)} default value`}
                              disabled={!row.useDefault}
                              type={row.type === 'number' ? 'number' : 'text'}
                              step="any"
                              value={row.defaultValue}
                              onChange={(event) =>
                                change(row.key, { defaultValue: event.currentTarget.value })
                              }
                            />
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Remove parameter ${String(index + 1)}`}
                            onClick={() => {
                              setRows((current) =>
                                current.filter((entry) => entry.key !== row.key),
                              );
                              setChanged(true);
                            }}
                          >
                            <Icon name="close" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {error !== null && <p role="alert">{error}</p>}
          </div>
          <footer className="wr-modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!parsed.success}>
              Save
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
