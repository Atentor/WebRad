/** Browser-only counterpart of the persisted ComboBox API binding. */
export interface WebComboBoxConfiguration {
  readonly schemaVersion: 1;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly displayField: string;
  readonly keyField: string;
}

export function normalizeWebComboBoxConfiguration(value: unknown): WebComboBoxConfiguration | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const source = value as Readonly<Record<string, unknown>>;
  if (source.schemaVersion !== 1) return null;
  return {
    schemaVersion: 1,
    apiClientId: typeof source.apiClientId === 'string' ? source.apiClientId : null,
    operationId: typeof source.operationId === 'string' ? source.operationId : null,
    listPath: typeof source.listPath === 'string' ? source.listPath : '',
    displayField: typeof source.displayField === 'string' ? source.displayField : '',
    keyField: typeof source.keyField === 'string' ? source.keyField : '',
  };
}

/** An empty pointer selects the item itself, including lists of scalar values. */
export function comboBoxItemText(item: unknown, path: string): string | undefined {
  let value = item;
  if (path !== '') {
    if (!path.startsWith('/') || /~(?![01])/u.test(path)) return undefined;
    for (const encoded of path.slice(1).split('/')) {
      const token = encoded.replace(/~1/gu, '/').replace(/~0/gu, '~');
      if (typeof value !== 'object' || value === null || !Object.hasOwn(value, token))
        return undefined;
      value = (value as Readonly<Record<string, unknown>>)[token];
    }
  }
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
