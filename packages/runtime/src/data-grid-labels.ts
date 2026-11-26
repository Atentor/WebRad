export const WEB_DATA_GRID_LABEL_MAX_LENGTH = 256;

export const WEB_DATA_GRID_DEFAULT_LABELS = Object.freeze({
  previous: 'Previous',
  next: 'Next',
  pagination: 'Data Grid pagination',
  pageSummary: 'Page {page}',
  cursorSummary: 'Results from cursor',
  totalSummary: '{total} total',
  rowsPerPage: 'Rows per page',
  pageSizeOption: '{size} / page',
  actions: 'Actions',
  addRow: 'Add row',
  edit: 'Edit',
  delete: 'Delete',
  undo: 'Undo',
  save: 'Save changes',
  discard: 'Discard drafts',
  addRecord: 'Add record',
  editRecord: 'Edit record',
  cancel: 'Cancel',
  apply: 'Apply to draft',
  selectValue: 'Select a value',
  noValue: 'No value',
  trueValue: 'true',
  falseValue: 'false',
  invalidList: 'Enter valid JSON array data for {field}.',
  invalidJson: 'Enter valid JSON for {field}.',
  invalidNumber: 'Enter a valid number for {field}.',
  invalidInteger: 'Enter a valid integer for {field}.',
  unsupportedInput: 'Unsupported input for {field}.',
  draft: 'Draft',
  deletePending: 'Delete pending',
  review: 'Review',
  unsaved: 'Unsaved changes',
  saving: 'Saving changes…',
  loading: 'Loading…',
  loadingRecords: 'Loading records…',
  signIn: 'Sign in to load records.',
  retry: 'Retry',
  uncertainSave: 'Refresh and verify the affected record before discarding the draft.',
});

export type WebDataGridLabel = keyof typeof WEB_DATA_GRID_DEFAULT_LABELS;
export type WebDataGridLabels = Readonly<Partial<Record<WebDataGridLabel, string>>>;
export type ResolvedDataGridLabels = Readonly<Record<WebDataGridLabel, string>>;

export const WEB_DATA_GRID_LABEL_KEYS: readonly WebDataGridLabel[] = Object.freeze(
  Object.keys(WEB_DATA_GRID_DEFAULT_LABELS) as WebDataGridLabel[],
);

function normalizeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.trim();
  return label.length > 0 && label.length <= WEB_DATA_GRID_LABEL_MAX_LENGTH ? label : undefined;
}

/** An empty override restores the built-in caption. */
export function normalizeWebDataGridLabels(value: unknown): WebDataGridLabels {
  const labels: Partial<Record<WebDataGridLabel, string>> = {};
  if (typeof value !== 'object' || value === null) return labels;
  for (const key of WEB_DATA_GRID_LABEL_KEYS) {
    if (!Object.hasOwn(value, key)) continue;
    const label = normalizeLabel((value as Record<string, unknown>)[key]);
    if (label !== undefined) labels[key] = label;
  }
  return labels;
}

export function normalizeWebDataGridEditorFieldLabels(
  value: unknown,
): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const labels: Record<string, string> = {};
  for (const [path, candidate] of Object.entries(value)) {
    if (!path.startsWith('/') || path.length > 4_096) continue;
    const label = normalizeLabel(candidate);
    if (label !== undefined) labels[path] = label;
  }
  return labels;
}

export function formatDataGridLabel(template: string, token: string, value: string | number): string {
  return template.replaceAll(`{${token}}`, () => String(value));
}
