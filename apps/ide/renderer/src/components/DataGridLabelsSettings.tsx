import type { DataGridConfiguration, ProjectGraphQLOperation } from '@webrad/project-model';
import {
  WEB_DATA_GRID_DEFAULT_LABELS,
  WEB_DATA_GRID_LABEL_LANGUAGES,
  WEB_DATA_GRID_LABEL_MAX_LENGTH,
  getDataGridLabelLanguage,
  isWebDataGridLabelLanguage,
  resolveDataGridLabels,
  type WebDataGridLabel,
  type WebDataGridLabelLanguage,
} from '@webrad/runtime/data-grid-labels';
import type { ReactElement } from 'react';

const languageNames: Readonly<Record<WebDataGridLabelLanguage, string>> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
  custom: 'Custom',
};

const labelGroups = [
  {
    title: 'Pagination',
    hint: 'Use {page}, {total}, and {size} in the corresponding labels to show the current numbers.',
    fields: {
      previous: 'Previous page button',
      next: 'Next page button',
      pageSummary: 'Current page',
      cursorSummary: 'Results without a known page number',
      totalSummary: 'Total records',
      rowsPerPage: 'Page size selector accessible name',
      pageSizeOption: 'Page size option',
      pagination: 'Pagination accessible name',
    },
  },
  {
    title: 'Record actions',
    fields: {
      actions: 'Actions column header',
      addRow: 'Add button',
      edit: 'Edit button',
      delete: 'Delete button',
      undo: 'Undo button',
      save: 'Save button',
      discard: 'Discard button',
    },
  },
  {
    title: 'Record editor',
    fields: {
      addRecord: 'Add dialog title',
      editRecord: 'Edit dialog title',
      cancel: 'Cancel button',
      apply: 'Apply button',
      selectValue: 'Required selection placeholder',
      noValue: 'Optional selection placeholder',
      trueValue: 'True option',
      falseValue: 'False option',
    },
  },
  {
    title: 'Status and feedback',
    fields: {
      draft: 'Draft badge',
      deletePending: 'Pending deletion badge',
      review: 'Review badge',
      unsaved: 'Unsaved changes status',
      saving: 'Saving status',
      loading: 'Loading status',
      loadingRecords: 'Loading records message',
      signIn: 'Sign-in message',
      retry: 'Retry button',
      uncertainSave: 'Uncertain save guidance',
    },
  },
  {
    title: 'Editor validation',
    hint: 'Use {field} to show the field label in the message.',
    fields: {
      invalidList: 'Invalid JSON array',
      invalidJson: 'Invalid JSON',
      invalidNumber: 'Invalid number',
      invalidInteger: 'Invalid integer',
      unsupportedInput: 'Unsupported input',
    },
  },
] as const satisfies readonly {
  readonly title: string;
  readonly hint?: string;
  readonly fields: Partial<Record<WebDataGridLabel, string>>;
}[];

interface DataGridLabelsSettingsProps {
  readonly draft: DataGridConfiguration;
  readonly operations: readonly ProjectGraphQLOperation[];
  readonly onChange: (update: (current: DataGridConfiguration) => DataGridConfiguration) => void;
}

export function DataGridLabelsSettings({
  draft,
  operations,
  onChange,
}: DataGridLabelsSettingsProps): ReactElement {
  const language = getDataGridLabelLanguage(draft);
  const custom = language === 'custom';
  const labels = resolveDataGridLabels(draft);
  const mutationIds = [draft.graphql?.insertOperationId, draft.graphql?.updateOperationId];
  const fields = new Map<string, string>();
  for (const operation of operations) {
    if (!mutationIds.includes(operation.id)) continue;
    for (const parameter of operation.runtime.parameters) {
      const { fieldPath, role } = parameter.source;
      if (role !== 'input' || !fieldPath.startsWith('/')) continue;
      const field = fieldPath.split('/').at(-1)?.replaceAll('~1', '/').replaceAll('~0', '~');
      fields.set(fieldPath, operation.runtime.fieldLabels?.[fieldPath] ?? (field || parameter.name));
    }
  }

  return (
    <>
      <div className="wr-data-grid-configuration-fields wr-data-grid-label-language">
        <label>
          <span>Language</span>
          <select
            data-grid-label="language"
            value={language}
            onChange={(event) => {
              const labelLanguage = event.currentTarget.value;
              if (isWebDataGridLabelLanguage(labelLanguage)) {
                onChange((current) => ({ ...current, labelLanguage }));
              }
            }}
          >
            {WEB_DATA_GRID_LABEL_LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {languageNames[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {custom
          ? 'Edit the GraphQL pagination and record editing labels. Empty labels use the English defaults.'
          : 'This language applies to GraphQL pagination and record editing. Choose Custom to edit these labels.'}
      </p>
      {labelGroups.map((group) => (
        <fieldset className="wr-data-grid-label-group" key={group.title}>
          <legend>{group.title}</legend>
          {'hint' in group && <p>{group.hint}</p>}
          {group.title === 'Record actions' && (
            <label className="wr-data-grid-label-toggle">
              <input
                type="checkbox"
                data-grid-label="showSaveButton"
                checked={draft.showSaveButton === true}
                onChange={(event) => {
                  const showSaveButton = event.currentTarget.checked;
                  onChange((current) => ({ ...current, showSaveButton }));
                }}
              />
              Show a Save button when there are drafts
            </label>
          )}
          <div className="wr-data-grid-configuration-fields wr-data-grid-label-fields">
            {(Object.entries(group.fields) as [WebDataGridLabel, string][]).map(([key, title]) => (
              <label key={key}>
                <span>{title}</span>
                <input
                  data-grid-label={key}
                  value={custom ? (draft.labels?.[key] ?? '') : labels[key]}
                  readOnly={!custom}
                  tabIndex={custom ? undefined : -1}
                  placeholder={WEB_DATA_GRID_DEFAULT_LABELS[key]}
                  maxLength={WEB_DATA_GRID_LABEL_MAX_LENGTH}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onChange((current) => ({
                      ...current,
                      labels: { ...current.labels, [key]: value },
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {fields.size > 0 && (
        <fieldset className="wr-data-grid-label-group">
          <legend>Mutation fields</legend>
          <div className="wr-data-grid-configuration-fields wr-data-grid-label-fields">
            {[...fields].map(([path, label]) => (
              <label key={path}>
                <span>{path}</span>
                <input
                  value={draft.editorFieldLabels?.[path] ?? ''}
                  placeholder={label}
                  maxLength={WEB_DATA_GRID_LABEL_MAX_LENGTH}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    onChange((current) => ({
                      ...current,
                      editorFieldLabels: { ...current.editorFieldLabels, [path]: value },
                    }));
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
