import type {
  DataGridGraphQL,
  WebDataGridMutationKind,
  WebDataGridPendingChange,
} from './data-grid-graphql.js';
import type { WebGraphQLParameter, WebGraphQLRow, WebGraphQLValue } from './graphql.js';

export function gridAction(
  document: Document,
  action: string,
  label: string,
  run: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'wr-data-grid-graphql-action';
  button.type = 'button';
  button.textContent = label;
  button.dataset.webradGridAction = action;
  button.disabled = disabled;
  button.addEventListener('click', run);
  return button;
}

function errorText(grid: DataGridGraphQL): string {
  const error = grid.saveError ?? grid.queryError;
  if (error === undefined) return '';
  const uncertain = grid.pendingChanges.some((change) => change.outcome === 'uncertain');
  return uncertain
    ? `${error.message} Refresh and verify the affected record before discarding the draft.`
    : error.message;
}

export function graphQLGridTools(
  document: Document,
  grid: DataGridGraphQL,
  openInsert: () => void,
): HTMLDivElement {
  const tools = document.createElement('div');
  tools.className = 'wr-data-grid-graphql-tools';
  if (grid.mutation('insert') !== undefined) {
    tools.append(gridAction(document, 'insert', 'Add row', openInsert, grid.saving));
  }
  if (grid.hasChanges) {
    tools.append(gridAction(document, 'discard', 'Discard drafts', () => grid.cancelChanges(), grid.saving));
  }
  const status = document.createElement('span');
  status.className = 'wr-data-grid-graphql-status';
  status.setAttribute('role', 'status');
  const error = errorText(grid);
  status.textContent = error || (grid.saving ? 'Saving changes…' : grid.loading ? 'Loading…' :
    grid.hasChanges ? 'Unsaved changes' : '');
  status.dataset.error = String(error.length > 0);
  tools.append(status);
  if (grid.queryError !== undefined) {
    tools.append(gridAction(document, 'retry', 'Retry', () => { void grid.retryPage(); }));
  }
  if (!grid.showPager) {
    tools.hidden = tools.children.length === 1 && status.textContent === '';
    return tools;
  }

  const pagination = document.createElement('nav');
  pagination.className = 'wr-data-grid-graphql-pager';
  pagination.setAttribute('aria-label', 'Data Grid pagination');
  const previous = gridAction(document, 'previous', 'Previous', () => { void grid.previousPage(); }, !grid.canGoBack);
  const next = gridAction(document, 'next', 'Next', () => { void grid.nextPage(); }, !grid.canGoForward);
  const summary = document.createElement('span');
  summary.className = 'wr-data-grid-graphql-page';
  summary.dataset.webradGridAction = 'page-summary';
  summary.tabIndex = -1;
  summary.setAttribute('aria-live', 'polite');
  const total = grid.totalCount;
  summary.textContent = `Page ${String(grid.pageNumber)}` + (total === null ? '' : ` · ${String(total)} total`);
  const pageSize = document.createElement('select');
  pageSize.setAttribute('aria-label', 'Rows per page');
  pageSize.dataset.webradGridAction = 'page-size';
  const sizes = new Set([
    grid.pageSize,
    grid.defaultPageSize,
    grid.maxPageSize,
    ...[5, 10, 20, 50, 100].filter((size) => size <= grid.maxPageSize),
  ]);
  for (const size of [...sizes].sort((a, b) => a - b)) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = `${String(size)} / page`;
    pageSize.append(option);
  }
  pageSize.value = String(grid.pageSize);
  pageSize.addEventListener('change', () => { void grid.setPageSize(Number(pageSize.value)); });
  pagination.append(previous, summary, next, pageSize);
  tools.append(pagination);
  return tools;
}

function valueLabel(parameter: WebGraphQLParameter): string {
  const field = parameter.source.fieldPath.split('/').at(-1);
  return field === undefined || field === '' ? parameter.name : field.replaceAll('~1', '/').replaceAll('~0', '~');
}

function usesJsonEditor(parameter: WebGraphQLParameter): boolean {
  return parameter.type.startsWith('[') || parameter.kind === 'json';
}

function readInput(parameter: WebGraphQLParameter, value: string): WebGraphQLValue {
  if (usesJsonEditor(parameter)) {
    if (value === '') return null;
    try {
      const parsed = JSON.parse(value) as WebGraphQLValue;
      if (parameter.type.startsWith('[') && parsed !== null && !Array.isArray(parsed)) {
        throw new TypeError('Expected a list.');
      }
      return parsed;
    } catch {
      throw new Error(`Enter valid ${parameter.type.startsWith('[') ? 'JSON array data' : 'JSON'} for ${valueLabel(parameter)}.`);
    }
  }
  if (parameter.enumValues.length > 0) return value === '' ? null : value;
  if (value.length === 0 && parameter.kind !== 'string') return null;
  if (parameter.kind === 'string') return value;
  switch (parameter.kind) {
    case 'number':
    case 'integer': {
      const number = Number(value);
      if (!Number.isFinite(number) || (parameter.kind === 'integer' && !Number.isSafeInteger(number))) {
        throw new Error(`Enter a valid ${parameter.kind} for ${valueLabel(parameter)}.`);
      }
      return number;
    }
    case 'boolean':
      return value === 'true';
    default:
      throw new TypeError(`Unsupported input for ${valueLabel(parameter)}.`);
  }
}

function editorField(
  document: Document,
  parameter: WebGraphQLParameter,
  current: WebGraphQLValue | undefined,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (usesJsonEditor(parameter)) {
    const area = document.createElement('textarea');
    area.value = current === undefined ? '' : JSON.stringify(current, null, 2);
    area.placeholder = parameter.type.startsWith('[') ? '[]' : '';
    area.required = parameter.required;
    return area;
  }
  if (parameter.enumValues.length > 0 || parameter.kind === 'boolean') {
    const select = document.createElement('select');
    const options = parameter.enumValues.length > 0 ? parameter.enumValues : ['true', 'false'];
    for (const value of ['', ...options]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || (parameter.required ? 'Select a value' : 'No value');
      select.append(option);
    }
    select.value = current === null || current === undefined ? '' : String(current);
    select.required = parameter.required;
    return select;
  }
  const input = document.createElement('input');
  input.type = parameter.kind === 'number' || parameter.kind === 'integer' ? 'number' : 'text';
  input.step = parameter.kind === 'integer' ? '1' : 'any';
  input.value = current === null || current === undefined ? '' : String(current);
  input.required = parameter.required && parameter.kind !== 'string';
  return input;
}

export function openGraphQLGridEditor(
  document: Document,
  grid: DataGridGraphQL,
  kind: Extract<WebDataGridMutationKind, 'insert' | 'update'>,
  row: WebGraphQLRow | null,
  draft: WebDataGridPendingChange | null,
  closed: () => void,
): HTMLDialogElement | null {
  const operation = grid.mutation(kind, row);
  if (operation === undefined || grid.saving) return null;
  const dialog = document.createElement('dialog');
  dialog.className = 'wr-data-grid-graphql-editor';
  const title = kind === 'insert' ? 'Add record' : 'Edit record';
  dialog.setAttribute('aria-label', title);
  const form = document.createElement('form');
  const heading = document.createElement('h2');
  heading.textContent = title;
  form.append(heading);
  const fields = operation.parameters.flatMap((parameter) => {
    if (parameter.source.role !== 'input') return [];
    const current = grid.inputValue(operation, parameter, row, draft);
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent = valueLabel(parameter);
    const control = editorField(document, parameter, current);
    const field = { parameter, control, changed: false };
    const changed = (): void => { field.changed = true; };
    control.addEventListener('input', changed);
    control.addEventListener('change', changed);
    label.append(caption, control);
    form.append(label);
    return [field];
  });
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'wr-data-grid-graphql-editor-actions';
  const cancel = gridAction(document, 'cancel-editor', 'Cancel', () => dialog.close());
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.className = 'wr-data-grid-graphql-action';
  apply.textContent = 'Apply to draft';
  actions.append(cancel, apply);
  form.append(feedback, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(fields.flatMap(({ parameter, control, changed }) =>
        changed ? [[parameter.name, readInput(parameter, control.value)]] : [],
      ));
      grid.stage(kind, row, values, draft?.id);
      dialog.close();
    } catch (reason: unknown) {
      feedback.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    closed();
  }, { once: true });
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
