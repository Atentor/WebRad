export const WEB_DATA_GRID_LABEL_MAX_LENGTH = 256;

export const WEB_DATA_GRID_DEFAULT_LABELS = Object.freeze({
  previous: 'Previous',
  next: 'Next',
  pagination: 'Pagination',
  pageSummary: 'Page {page}',
  cursorSummary: 'Cursor results',
  totalSummary: '{total} total',
  rowsPerPage: 'Rows per page',
  pageSizeOption: '{size} / page',
  actions: 'Actions',
  addRow: 'Add',
  edit: 'Edit',
  delete: 'Delete',
  undo: 'Undo',
  save: 'Save',
  discard: 'Discard',
  addRecord: 'Add',
  editRecord: 'Edit',
  cancel: 'Cancel',
  apply: 'Apply',
  selectValue: 'Select…',
  noValue: 'No value',
  trueValue: 'True',
  falseValue: 'False',
  invalidList: '{field}: enter a JSON array.',
  invalidJson: '{field}: enter valid JSON.',
  invalidNumber: '{field}: enter a number.',
  invalidInteger: '{field}: enter an integer.',
  unsupportedInput: '{field}: unsupported input.',
  draft: 'Draft',
  deletePending: 'Pending deletion',
  review: 'Review',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  loading: 'Loading…',
  loadingRecords: 'Loading records…',
  signIn: 'Sign in to view records.',
  retry: 'Retry',
  uncertainSave: 'Refresh and check the record before discarding.',
});

export type WebDataGridLabel = keyof typeof WEB_DATA_GRID_DEFAULT_LABELS;
export type WebDataGridLabels = Readonly<Partial<Record<WebDataGridLabel, string>>>;
export type ResolvedDataGridLabels = Readonly<Record<WebDataGridLabel, string>>;

export const WEB_DATA_GRID_LABEL_LANGUAGES = ['pt', 'en', 'es', 'custom'] as const;
export type WebDataGridLabelLanguage = (typeof WEB_DATA_GRID_LABEL_LANGUAGES)[number];

const labelPresets: Readonly<
  Record<Exclude<WebDataGridLabelLanguage, 'custom'>, ResolvedDataGridLabels>
> = {
  en: WEB_DATA_GRID_DEFAULT_LABELS,
  pt: Object.freeze({
    previous: 'Anterior',
    next: 'Próxima',
    pagination: 'Paginação',
    pageSummary: 'Página {page}',
    cursorSummary: 'Resultados do cursor',
    totalSummary: '{total} no total',
    rowsPerPage: 'Linhas por página',
    pageSizeOption: '{size} / página',
    actions: 'Ações',
    addRow: 'Adicionar',
    edit: 'Editar',
    delete: 'Excluir',
    undo: 'Desfazer',
    save: 'Salvar',
    discard: 'Descartar',
    addRecord: 'Adicionar',
    editRecord: 'Editar',
    cancel: 'Cancelar',
    apply: 'Aplicar',
    selectValue: 'Selecione…',
    noValue: 'Sem valor',
    trueValue: 'Verdadeiro',
    falseValue: 'Falso',
    invalidList: '{field}: insira uma lista JSON.',
    invalidJson: '{field}: insira um JSON válido.',
    invalidNumber: '{field}: insira um número.',
    invalidInteger: '{field}: insira um número inteiro.',
    unsupportedInput: '{field}: entrada incompatível.',
    draft: 'Rascunho',
    deletePending: 'Exclusão pendente',
    review: 'Revisar',
    unsaved: 'Alterações não salvas',
    saving: 'Salvando…',
    loading: 'Carregando…',
    loadingRecords: 'Carregando registros…',
    signIn: 'Entre para ver os registros.',
    retry: 'Tentar novamente',
    uncertainSave: 'Atualize e confira o registro antes de descartar.',
  }),
  es: Object.freeze({
    previous: 'Anterior',
    next: 'Siguiente',
    pagination: 'Paginación',
    pageSummary: 'Página {page}',
    cursorSummary: 'Resultados del cursor',
    totalSummary: '{total} en total',
    rowsPerPage: 'Filas por página',
    pageSizeOption: '{size} / página',
    actions: 'Acciones',
    addRow: 'Añadir',
    edit: 'Editar',
    delete: 'Eliminar',
    undo: 'Deshacer',
    save: 'Guardar',
    discard: 'Descartar',
    addRecord: 'Añadir',
    editRecord: 'Editar',
    cancel: 'Cancelar',
    apply: 'Aplicar',
    selectValue: 'Seleccione…',
    noValue: 'Sin valor',
    trueValue: 'Verdadero',
    falseValue: 'Falso',
    invalidList: '{field}: introduzca una lista JSON.',
    invalidJson: '{field}: introduzca un JSON válido.',
    invalidNumber: '{field}: introduzca un número.',
    invalidInteger: '{field}: introduzca un número entero.',
    unsupportedInput: '{field}: entrada incompatible.',
    draft: 'Borrador',
    deletePending: 'Eliminación pendiente',
    review: 'Revisar',
    unsaved: 'Cambios sin guardar',
    saving: 'Guardando…',
    loading: 'Cargando…',
    loadingRecords: 'Cargando registros…',
    signIn: 'Inicie sesión para ver los registros.',
    retry: 'Volver a intentar',
    uncertainSave: 'Actualice y revise el registro antes de descartar.',
  }),
};

export function isWebDataGridLabelLanguage(value: unknown): value is WebDataGridLabelLanguage {
  return WEB_DATA_GRID_LABEL_LANGUAGES.some((language) => language === value);
}

export function getDataGridLabelLanguage(configuration: {
  readonly labelLanguage?: WebDataGridLabelLanguage;
  readonly labels?: WebDataGridLabels;
}): WebDataGridLabelLanguage {
  const { labelLanguage, labels } = configuration;
  return labelLanguage ?? (Object.keys(labels ?? {}).length > 0 ? 'custom' : 'en');
}

export function resolveDataGridLabels(configuration: {
  readonly labelLanguage?: WebDataGridLabelLanguage;
  readonly labels?: WebDataGridLabels;
}): ResolvedDataGridLabels {
  const language = getDataGridLabelLanguage(configuration);
  return language === 'custom'
    ? { ...WEB_DATA_GRID_DEFAULT_LABELS, ...configuration.labels }
    : labelPresets[language];
}

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

export function formatDataGridLabel(
  template: string,
  token: string,
  value: string | number,
): string {
  return template.replaceAll(`{${token}}`, () => String(value));
}
