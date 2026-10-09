import { z } from 'zod';
import type { ApiClientResponseSchema, ApiClientSchemaNode } from './api-client.js';

export interface ComboBoxConfiguration {
  readonly schemaVersion: 1;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly displayField: string;
  readonly keyField: string;
}

const pointer = z
  .string()
  .max(4_096)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value)),
    'Use an empty path or a JSON Pointer.',
  );
const reference = z.string().min(1).max(128).nullable();

export const ComboBoxConfigurationSchema: z.ZodType<ComboBoxConfiguration> = z
  .object({
    schemaVersion: z.literal(1),
    apiClientId: reference,
    operationId: reference,
    listPath: pointer,
    displayField: pointer,
    keyField: pointer,
  })
  .strict();

export function createDefaultComboBoxConfiguration(): ComboBoxConfiguration {
  return {
    schemaVersion: 1,
    apiClientId: null,
    operationId: null,
    listPath: '',
    displayField: '',
    keyField: '',
  };
}

export interface ComboBoxSchemaChoice {
  readonly path: string;
  readonly label: string;
}

function choiceLabel(path: string, fallback: string): string {
  return path === ''
    ? fallback
    : path
        .slice(1)
        .split('/')
        .map((part) => part.replace(/~1/gu, '/').replace(/~0/gu, '~'))
        .join('.');
}

/** Only scalar fields of one list item can become option labels or keys. */
export function comboBoxSchemaChoices(
  schema: ApiClientResponseSchema | null | undefined,
  listPath: string,
): {
  readonly lists: readonly ComboBoxSchemaChoice[];
  readonly fields: readonly ComboBoxSchemaChoice[];
} {
  const lists: ComboBoxSchemaChoice[] = [];
  const fields: ComboBoxSchemaChoice[] = [];
  let list: ApiClientSchemaNode | undefined;
  const visit = (node: ApiClientSchemaNode): void => {
    if (node.kind === 'list') {
      lists.push({ path: node.path, label: choiceLabel(node.path, 'Response') });
      if (node.path === listPath) list = node;
      return; // A list nested inside another item cannot be a response-level source.
    }
    node.children.forEach(visit);
  };
  if (schema != null) visit(schema.root);
  const prefix = `${listPath}/*`;
  const collect = (node: ApiClientSchemaNode): void => {
    if (node.kind === 'list') return;
    if (
      node.kind === 'field' &&
      ['string', 'number', 'integer', 'boolean', 'date', 'datetime'].includes(node.fieldType)
    ) {
      if (node.path === prefix || node.path.startsWith(`${prefix}/`)) {
        const path = node.path.slice(prefix.length);
        fields.push({ path, label: choiceLabel(path, 'Item value') });
      }
    }
    node.children.forEach(collect);
  };
  list?.children.forEach(collect);
  return { lists, fields };
}
