import { z } from 'zod';

/** Version of the persisted Data Grid contract stored in a component property. */
export const DATA_GRID_CONFIGURATION_VERSION = 1 as const;

export const DATA_GRID_CELL_KINDS = ['text', 'image', 'button', 'checkbox'] as const;
export type DataGridCellKind = (typeof DATA_GRID_CELL_KINDS)[number];

/** One repeated table cell, bound to a field relative to the selected list item. */
export interface DataGridColumn {
  readonly id: string;
  readonly header: string;
  /** JSON Pointer relative to one item, such as `/customer/name`. */
  readonly fieldPath: string;
  readonly cellKind: DataGridCellKind;
  /** Static content for the optional fixed footer row. */
  readonly footer: string;
}

/**
 * Saved binding between a visual WebDataGrid and one named API operation.
 * Results remain transient in WebApiClient; only this declarative binding is
 * persisted in the Project Model.
 */
export interface DataGridConfiguration {
  readonly schemaVersion: typeof DATA_GRID_CONFIGURATION_VERSION;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  /** JSON Pointer to a list in the selected operation response contract. */
  readonly listPath: string;
  readonly columnCount: number;
  readonly showHeader: boolean;
  readonly stickyHeader: boolean;
  readonly showFooter: boolean;
  readonly stickyFooter: boolean;
  readonly columns: readonly DataGridColumn[];
}

const stableIdSchema = z.string().trim().min(1).max(200);
const pointerSchema = z
  .string()
  .max(4_096)
  .refine((value) => value.length === 0 || value.startsWith('/'), {
    message: 'A Data Grid field path must be empty or start with "/".',
  });

export const DataGridColumnSchema: z.ZodType<DataGridColumn> = z
  .object({
    id: stableIdSchema,
    header: z.string().max(256),
    fieldPath: pointerSchema,
    cellKind: z.enum(DATA_GRID_CELL_KINDS),
    footer: z.string().max(4_096),
  })
  .strict();

export const DataGridConfigurationSchema: z.ZodType<DataGridConfiguration> = z
  .object({
    schemaVersion: z.literal(DATA_GRID_CONFIGURATION_VERSION),
    apiClientId: stableIdSchema.nullable(),
    operationId: stableIdSchema.nullable(),
    listPath: pointerSchema,
    columnCount: z.number().int().min(1).max(50),
    showHeader: z.boolean(),
    stickyHeader: z.boolean(),
    showFooter: z.boolean(),
    stickyFooter: z.boolean(),
    columns: z.array(DataGridColumnSchema).min(1).max(50),
  })
  .strict()
  .superRefine((configuration, context) => {
    if (configuration.columns.length !== configuration.columnCount) {
      context.addIssue({
        code: 'custom',
        message: 'Data Grid columnCount must equal the number of configured columns.',
        path: ['columnCount'],
      });
    }
    const ids = new Set<string>();
    configuration.columns.forEach((column, index) => {
      if (ids.has(column.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate Data Grid column ID "${column.id}".`,
          path: ['columns', index, 'id'],
        });
      }
      ids.add(column.id);
    });
  });

const DEFAULT_DATA_GRID_CONFIGURATION = Object.freeze({
  schemaVersion: DATA_GRID_CONFIGURATION_VERSION,
  apiClientId: null,
  operationId: null,
  listPath: '',
  columnCount: 3,
  showHeader: true,
  stickyHeader: true,
  showFooter: false,
  stickyFooter: true,
  columns: [
    { id: 'column-1', header: 'Column 1', fieldPath: '', cellKind: 'text', footer: '' },
    { id: 'column-2', header: 'Column 2', fieldPath: '', cellKind: 'text', footer: '' },
    { id: 'column-3', header: 'Column 3', fieldPath: '', cellKind: 'text', footer: '' },
  ],
} satisfies DataGridConfiguration);

/** Returns a new independent configuration for a newly inserted Data Grid. */
export function createDefaultDataGridConfiguration(): DataGridConfiguration {
  return structuredClone(DEFAULT_DATA_GRID_CONFIGURATION);
}

export function parseDataGridConfiguration(input: unknown): DataGridConfiguration {
  return DataGridConfigurationSchema.parse(input);
}

/** Uses defaults for legacy or incomplete nodes until a user configures the grid. */
export function normalizeDataGridConfiguration(input: unknown): DataGridConfiguration {
  const parsed = DataGridConfigurationSchema.safeParse(input);
  return parsed.success ? parsed.data : createDefaultDataGridConfiguration();
}
