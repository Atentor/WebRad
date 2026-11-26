import type {
  DataGridGraphQL,
  WebDataGridMutationKind,
  WebDataGridPendingChange,
} from './data-grid-graphql.js';
import { formatDataGridLabel, type ResolvedDataGridLabels } from './data-grid-labels.js';
import { createLucideIconElement, type LucideIconName } from './icon.js';
import type { WebGraphQLParameter, WebGraphQLRow, WebGraphQLValue } from './graphql.js';

const actionIcons = {
  insert: 'plus',
  edit: 'pencil',
  delete: 'trash',
  undo: 'undo',
  save: 'save',
  discard: 'x',
  retry: 'refresh-cw',
  previous: 'chevron-left',
  next: 'chevron-right',
  'cancel-editor': 'x',
  apply: 'check',
} as const satisfies Record<string, LucideIconName>;

function createGridAction(
  document: Document,
  action: keyof typeof actionIcons,
  label: string,
  row?: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'wr-data-grid-graphql-action';
  button.type = 'button';
  button.dir = 'auto';
  button.dataset.webradGridAction = row === undefined ? action : `${action}-${row}`;
  button.dataset.kind = action;
  if (action === 'insert' || action === 'edit') button.setAttribute('aria-haspopup', 'dialog');
  button.append(createLucideIconElement(document, actionIcons[action]));
  if (row === undefined) {
    button.append(label);
  } else {
    button.classList.add('wr-data-grid-graphql-icon-only');
    button.setAttribute('aria-label', label);
    button.title = label;
    const caption = document.createElement('span');
    caption.className = 'wr-data-grid-graphql-action-label';
    caption.textContent = label;
    button.append(caption);
  }
  return button;
}

export function gridAction(
  document: Document,
  action: keyof typeof actionIcons,
  label: string,
  run: () => void,
  disabled = false,
  row?: string,
): HTMLButtonElement {
  const button = createGridAction(document, action, label, row);
  button.disabled = disabled;
  button.addEventListener('click', run);
  return button;
}

function errorText(grid: DataGridGraphQL, labels: ResolvedDataGridLabels): string {
  const error = grid.saveError ?? grid.queryError;
  if (error === undefined) return '';
  const uncertain = grid.hasUncertainChanges;
  return uncertain ? `${error.message} ${labels.uncertainSave}` : error.message;
}

export function graphQLGridTools(
  document: Document,
  grid: DataGridGraphQL,
  labels: ResolvedDataGridLabels,
  showSaveButton: boolean,
  openInsert: () => void,
): HTMLDivElement {
  const tools = document.createElement('div');
  tools.className = 'wr-data-grid-graphql-tools';
  if (grid.mutation('insert') !== undefined) {
    tools.append(gridAction(document, 'insert', labels.addRow, openInsert, grid.saving));
  }
  if (grid.hasChanges) {
    if (showSaveButton) {
      tools.append(
        gridAction(
          document,
          'save',
          labels.save,
          () => {
            void grid.saveChanges().catch(() => {
              // The controller records the error in the toolbar and emits OnSaveError.
            });
          },
          grid.saving,
        ),
      );
    }
    tools.append(
      gridAction(document, 'discard', labels.discard, () => grid.cancelChanges(), grid.saving),
    );
  }
  const status = document.createElement('span');
  status.className = 'wr-data-grid-graphql-status';
  status.setAttribute('role', 'status');
  const error = errorText(grid, labels);
  const state = grid.saving
    ? 'saving'
    : error
      ? 'error'
      : grid.loading
        ? 'loading'
        : grid.hasChanges
          ? 'draft'
          : 'idle';
  status.dataset.state = state;
  status.textContent = {
    error,
    saving: labels.saving,
    loading: labels.loading,
    draft: labels.unsaved,
    idle: '',
  }[state];
  tools.append(status);
  if (grid.queryError !== undefined) {
    tools.append(
      gridAction(document, 'retry', labels.retry, () => {
        void grid.retryPage();
      }),
    );
  }
  if (!grid.showPager) {
    tools.hidden = tools.children.length === 1 && status.textContent === '';
    return tools;
  }

  const pagination = document.createElement('nav');
  pagination.className = 'wr-data-grid-graphql-pager';
  pagination.setAttribute('aria-label', labels.pagination);
  const previous = gridAction(
    document,
    'previous',
    labels.previous,
    () => {
      void grid.previousPage();
    },
    !grid.canGoBack,
  );
  const next = gridAction(
    document,
    'next',
    labels.next,
    () => {
      void grid.nextPage();
    },
    !grid.canGoForward,
  );
  const summary = document.createElement('span');
  summary.className = 'wr-data-grid-graphql-page';
  summary.dataset.webradGridAction = 'page-summary';
  summary.tabIndex = -1;
  summary.setAttribute('aria-live', 'polite');
  const total = grid.totalCount;
  const pageNumber = grid.pageNumber;
  summary.textContent =
    (pageNumber === null
      ? labels.cursorSummary
      : formatDataGridLabel(labels.pageSummary, 'page', pageNumber)) +
    (total === null ? '' : ` · ${formatDataGridLabel(labels.totalSummary, 'total', total)}`);
  const pageSize = document.createElement('select');
  pageSize.setAttribute('aria-label', labels.rowsPerPage);
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
    option.textContent = formatDataGridLabel(labels.pageSizeOption, 'size', size);
    pageSize.append(option);
  }
  pageSize.value = String(grid.pageSize);
  pageSize.addEventListener('change', () => {
    void grid.setPageSize(Number(pageSize.value));
  });
  pagination.append(previous, summary, next, pageSize);
  tools.append(pagination);
  return tools;
}

function valueLabel(
  parameter: WebGraphQLParameter,
  fieldLabels: Readonly<Record<string, string>>,
): string {
  const path = parameter.source.fieldPath;
  if (Object.hasOwn(fieldLabels, path)) return fieldLabels[path] ?? parameter.name;
  const field = path.split('/').at(-1);
  return field === undefined || field === ''
    ? parameter.name
    : field.replaceAll('~1', '/').replaceAll('~0', '~');
}

function usesJsonEditor(parameter: WebGraphQLParameter): boolean {
  return parameter.type.startsWith('[') || parameter.kind === 'json';
}

function readInput(
  parameter: WebGraphQLParameter,
  value: string,
  label: string,
  labels: ResolvedDataGridLabels,
): WebGraphQLValue {
  if (usesJsonEditor(parameter)) {
    if (value === '') return null;
    try {
      const parsed = JSON.parse(value) as WebGraphQLValue;
      if (parameter.type.startsWith('[') && parsed !== null && !Array.isArray(parsed)) {
        throw new TypeError('Expected a list.');
      }
      return parsed;
    } catch {
      const template = parameter.type.startsWith('[') ? labels.invalidList : labels.invalidJson;
      throw new Error(formatDataGridLabel(template, 'field', label));
    }
  }
  if (parameter.enumValues.length > 0) return value === '' ? null : value;
  if (value.length === 0 && parameter.kind !== 'string') return null;
  if (parameter.kind === 'string') return value;
  switch (parameter.kind) {
    case 'number':
    case 'integer': {
      const number = Number(value);
      if (
        !Number.isFinite(number) ||
        (parameter.kind === 'integer' && !Number.isSafeInteger(number))
      ) {
        const template =
          parameter.kind === 'integer' ? labels.invalidInteger : labels.invalidNumber;
        throw new Error(formatDataGridLabel(template, 'field', label));
      }
      return number;
    }
    case 'boolean':
      return value === 'true';
    default:
      throw new TypeError(formatDataGridLabel(labels.unsupportedInput, 'field', label));
  }
}

function editorField(
  document: Document,
  parameter: WebGraphQLParameter,
  current: WebGraphQLValue | undefined,
  labels: ResolvedDataGridLabels,
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
      option.textContent =
        value === ''
          ? parameter.required
            ? labels.selectValue
            : labels.noValue
          : parameter.enumValues.length > 0
            ? value
            : value === 'true'
              ? labels.trueValue
              : labels.falseValue;
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
  options: {
    readonly labels: ResolvedDataGridLabels;
    readonly fieldLabels: Readonly<Record<string, string>>;
  },
  closed: () => void,
): HTMLDialogElement | null {
  const operation = grid.mutation(kind, row);
  if (operation === undefined || grid.saving) return null;
  const dialog = document.createElement('dialog');
  dialog.className = 'wr-data-grid-graphql-editor';
  const { labels } = options;
  const fieldLabels = { ...operation.fieldLabels, ...options.fieldLabels };
  const title = kind === 'insert' ? labels.addRecord : labels.editRecord;
  dialog.setAttribute('aria-label', title);
  const form = document.createElement('form');
  const heading = document.createElement('h2');
  heading.textContent = title;
  const header = document.createElement('header');
  header.className = 'wr-data-grid-graphql-editor-header';
  const icon = createLucideIconElement(document, kind === 'insert' ? 'plus' : 'pencil');
  header.append(icon, heading);
  const body = document.createElement('div');
  body.className = 'wr-data-grid-graphql-editor-fields';
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'alert');
  let invalidControl: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null;
  form.append(header, body);
  const fields = operation.parameters.flatMap((parameter) => {
    if (parameter.source.role !== 'input') return [];
    const current = grid.inputValue(operation, parameter, row, draft);
    const label = document.createElement('label');
    const caption = document.createElement('span');
    const text = valueLabel(parameter, fieldLabels);
    caption.textContent = text;
    const control = editorField(document, parameter, current, labels);
    const field = { parameter, control, text, changed: false };
    const changed = (): void => {
      field.changed = true;
      control.removeAttribute('aria-invalid');
      if (invalidControl === null || invalidControl === control) {
        invalidControl = null;
        feedback.textContent = '';
      }
    };
    control.addEventListener('input', changed);
    control.addEventListener('change', changed);
    label.append(caption, control);
    body.append(label);
    return [field];
  });
  const firstField = fields[0];
  if (firstField !== undefined) firstField.control.autofocus = true;
  const footer = document.createElement('footer');
  footer.className = 'wr-data-grid-graphql-editor-footer';
  const actions = document.createElement('div');
  actions.className = 'wr-data-grid-graphql-editor-actions';
  const cancel = gridAction(document, 'cancel-editor', labels.cancel, () => dialog.close());
  const apply = createGridAction(document, 'apply', labels.apply);
  apply.type = 'submit';
  actions.append(cancel, apply);
  footer.append(feedback, actions);
  form.append(footer);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(
        fields.flatMap(({ parameter, control, text, changed }) => {
          if (!changed) return [];
          try {
            return [[parameter.name, readInput(parameter, control.value, text, labels)]] as const;
          } catch (reason: unknown) {
            invalidControl?.removeAttribute('aria-invalid');
            invalidControl = control;
            control.setAttribute('aria-invalid', 'true');
            control.focus();
            throw reason;
          }
        }),
      );
      grid.stage(kind, row, values, draft?.id);
      dialog.close();
    } catch (reason: unknown) {
      feedback.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  });
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      closed();
    },
    { once: true },
  );
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
