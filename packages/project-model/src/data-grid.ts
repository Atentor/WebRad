import { z } from 'zod';

import { WEBRAD_ICON_NAMES, type WebRadIconName } from '@webrad/runtime/icons';

/** Version of the persisted Data Grid contract stored in a component property. */
export const DATA_GRID_CONFIGURATION_VERSION = 2 as const;

const LEGACY_DATA_GRID_CONFIGURATION_VERSION = 1 as const;

export const DATA_GRID_CELL_KINDS = ['text', 'image', 'button', 'checkbox'] as const;
export type DataGridCellKind = (typeof DATA_GRID_CELL_KINDS)[number];

/** The way one column claims horizontal space in the grid. */
export const DATA_GRID_COLUMN_WIDTH_MODES = ['fixed', 'dynamic'] as const;
export type DataGridColumnWidthMode = (typeof DATA_GRID_COLUMN_WIDTH_MODES)[number];

/** The way repeated data rows determine their height. */
export const DATA_GRID_ROW_HEIGHT_MODES = ['fixed', 'dynamic'] as const;
export type DataGridRowHeightMode = (typeof DATA_GRID_ROW_HEIGHT_MODES)[number];

export const DATA_GRID_HORIZONTAL_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type DataGridHorizontalAlignment = (typeof DATA_GRID_HORIZONTAL_ALIGNMENTS)[number];

/** One repeated grid cell, optionally bound to a field relative to the selected list item. */
export interface DataGridColumn {
  readonly id: string;
  readonly header: string;
  /** JSON Pointer relative to one item, such as `/customer/name`; empty means unbound. */
  readonly fieldPath: string;
  readonly cellKind: DataGridCellKind;
  /** Static caption rendered by button and checkbox cells. */
  readonly fixedCaption: string;
  /** Optional catalogue icon rendered by button cells. */
  readonly buttonIcon: WebRadIconName | null;
  /** Static content for the optional fixed footer row. */
  readonly footer: string;
  /** A fixed pixel width or a dynamic track that shares available space. */
  readonly widthMode: DataGridColumnWidthMode;
  /** Pixel width retained for this column when `widthMode` is `fixed`. */
  readonly width: number;
  /** Smallest usable width of a dynamic column in pixels. */
  readonly minWidth: number;
  /** Optional largest width of a dynamic column in pixels. */
  readonly maxWidth: number | null;
  /** Relative share of the remaining space for a dynamic column. */
  readonly flex: number;
  readonly headerAlign: DataGridHorizontalAlignment;
  readonly cellAlign: DataGridHorizontalAlignment;
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
  /** Fixed rows clip overflowing cell content; dynamic rows follow their content. */
  readonly rowHeightMode: DataGridRowHeightMode;
  readonly fixedRowHeight: number;
  readonly minRowHeight: number;
  readonly maxRowHeight: number | null;
  readonly cellPaddingHorizontal: number;
  readonly cellPaddingVertical: number;
  readonly wrapText: boolean;
  readonly stripedRows: boolean;
  readonly showHorizontalLines: boolean;
  readonly showVerticalLines: boolean;
  readonly emptyMessage: string;
  readonly columns: readonly DataGridColumn[];
}

const stableIdSchema = z.string().trim().min(1).max(200);
const pointerSchema = z
  .string()
  .max(4_096)
  .refine((value) => value.length === 0 || value.startsWith('/'), {
    message: 'A Data Grid field path must be empty or start with "/".',
  });
const pixelSchema = z.number().finite().min(0).max(10_000);
const positivePixelSchema = z.number().finite().min(1).max(10_000);

export const DataGridColumnSchema: z.ZodType<DataGridColumn> = z
  .object({
    id: stableIdSchema,
    header: z.string().max(256),
    fieldPath: pointerSchema,
    cellKind: z.enum(DATA_GRID_CELL_KINDS),
    // The default keeps persisted v2 configurations written before captions
    // were introduced compatible without incrementing the contract version.
    fixedCaption: z.string().max(256).default(''),
    // A null default likewise keeps existing v2 columns compatible while the
    // shared catalogue rejects icon identifiers that WebButton cannot render.
    buttonIcon: z.enum(WEBRAD_ICON_NAMES).nullable().default(null),
    footer: z.string().max(4_096),
    widthMode: z.enum(DATA_GRID_COLUMN_WIDTH_MODES),
    width: positivePixelSchema,
    minWidth: positivePixelSchema,
    maxWidth: positivePixelSchema.nullable(),
    flex: z.number().finite().min(0.1).max(100),
    headerAlign: z.enum(DATA_GRID_HORIZONTAL_ALIGNMENTS),
    cellAlign: z.enum(DATA_GRID_HORIZONTAL_ALIGNMENTS),
  })
  .strict()
  .superRefine((column, context) => {
    if (column.maxWidth !== null && column.maxWidth < column.minWidth) {
      context.addIssue({
        code: 'custom',
        message:
          'A Data Grid column maximum width must be greater than or equal to its minimum width.',
        path: ['maxWidth'],
      });
    }
  });

const DataGridConfigurationV2Schema: z.ZodType<DataGridConfiguration> = z
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
    rowHeightMode: z.enum(DATA_GRID_ROW_HEIGHT_MODES),
    fixedRowHeight: positivePixelSchema,
    minRowHeight: pixelSchema,
    maxRowHeight: positivePixelSchema.nullable(),
    cellPaddingHorizontal: pixelSchema,
    cellPaddingVertical: pixelSchema,
    wrapText: z.boolean(),
    stripedRows: z.boolean(),
    showHorizontalLines: z.boolean(),
    showVerticalLines: z.boolean(),
    emptyMessage: z.string().max(4_096),
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
    if (
      configuration.maxRowHeight !== null &&
      configuration.maxRowHeight < configuration.minRowHeight
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A Data Grid maximum row height must be greater than or equal to its minimum row height.',
        path: ['maxRowHeight'],
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

interface LegacyDataGridColumn {
  readonly id: string;
  readonly header: string;
  readonly fieldPath: string;
  readonly cellKind: DataGridCellKind;
  readonly footer: string;
}

interface LegacyDataGridConfiguration {
  readonly schemaVersion: typeof LEGACY_DATA_GRID_CONFIGURATION_VERSION;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly columnCount: number;
  readonly showHeader: boolean;
  readonly stickyHeader: boolean;
  readonly showFooter: boolean;
  readonly stickyFooter: boolean;
  readonly columns: readonly LegacyDataGridColumn[];
}

const LegacyDataGridColumnSchema: z.ZodType<LegacyDataGridColumn> = z
  .object({
    id: stableIdSchema,
    header: z.string().max(256),
    fieldPath: pointerSchema,
    cellKind: z.enum(DATA_GRID_CELL_KINDS),
    footer: z.string().max(4_096),
  })
  .strict();

const LegacyDataGridConfigurationSchema: z.ZodType<LegacyDataGridConfiguration> = z
  .object({
    schemaVersion: z.literal(LEGACY_DATA_GRID_CONFIGURATION_VERSION),
    apiClientId: stableIdSchema.nullable(),
    operationId: stableIdSchema.nullable(),
    listPath: pointerSchema,
    columnCount: z.number().int().min(1).max(50),
    showHeader: z.boolean(),
    stickyHeader: z.boolean(),
    showFooter: z.boolean(),
    stickyFooter: z.boolean(),
    columns: z.array(LegacyDataGridColumnSchema).min(1).max(50),
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

function migrateLegacyDataGridConfiguration(value: unknown): unknown {
  const legacy = LegacyDataGridConfigurationSchema.safeParse(value);
  if (!legacy.success) return value;

  return {
    ...legacy.data,
    schemaVersion: DATA_GRID_CONFIGURATION_VERSION,
    rowHeightMode: 'dynamic',
    fixedRowHeight: 40,
    minRowHeight: 36,
    maxRowHeight: null,
    cellPaddingHorizontal: 10,
    cellPaddingVertical: 8,
    wrapText: false,
    stripedRows: false,
    showHorizontalLines: true,
    showVerticalLines: false,
    emptyMessage: 'No data',
    columns: legacy.data.columns.map((column) => ({
      ...column,
      fixedCaption: '',
      buttonIcon: null,
      widthMode: 'dynamic',
      width: 180,
      minWidth: 96,
      maxWidth: null,
      flex: 1,
      headerAlign: 'start',
      cellAlign: 'start',
    })),
  } satisfies DataGridConfiguration;
}

/**
 * Reads both persisted v1 Data Grids and the current v2 configuration. A v1
 * value is upgraded in memory on its next edit/save without changing the page
 * format version or dropping its source and column bindings.
 */
export const DataGridConfigurationSchema: z.ZodType<DataGridConfiguration> = z.preprocess(
  migrateLegacyDataGridConfiguration,
  DataGridConfigurationV2Schema,
);

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
  rowHeightMode: 'dynamic',
  fixedRowHeight: 40,
  minRowHeight: 36,
  maxRowHeight: null,
  cellPaddingHorizontal: 10,
  cellPaddingVertical: 8,
  wrapText: false,
  stripedRows: false,
  showHorizontalLines: true,
  showVerticalLines: false,
  emptyMessage: 'No data',
  columns: [
    {
      id: 'column-1',
      header: 'Column 1',
      fieldPath: '',
      cellKind: 'text',
      fixedCaption: '',
      buttonIcon: null,
      footer: '',
      widthMode: 'dynamic',
      width: 180,
      minWidth: 96,
      maxWidth: null,
      flex: 1,
      headerAlign: 'start',
      cellAlign: 'start',
    },
    {
      id: 'column-2',
      header: 'Column 2',
      fieldPath: '',
      cellKind: 'text',
      fixedCaption: '',
      buttonIcon: null,
      footer: '',
      widthMode: 'dynamic',
      width: 180,
      minWidth: 96,
      maxWidth: null,
      flex: 1,
      headerAlign: 'start',
      cellAlign: 'start',
    },
    {
      id: 'column-3',
      header: 'Column 3',
      fieldPath: '',
      cellKind: 'text',
      fixedCaption: '',
      buttonIcon: null,
      footer: '',
      widthMode: 'dynamic',
      width: 180,
      minWidth: 96,
      maxWidth: null,
      flex: 1,
      headerAlign: 'start',
      cellAlign: 'start',
    },
  ],
} satisfies DataGridConfiguration);

/** Returns a new independent configuration for a newly inserted Data Grid. */
export function createDefaultDataGridConfiguration(): DataGridConfiguration {
  return structuredClone(DEFAULT_DATA_GRID_CONFIGURATION);
}

export function parseDataGridConfiguration(input: unknown): DataGridConfiguration {
  return DataGridConfigurationSchema.parse(input);
}

/** Uses defaults for incomplete nodes until a user configures the grid. */
export function normalizeDataGridConfiguration(input: unknown): DataGridConfiguration {
  const parsed = DataGridConfigurationSchema.safeParse(input);
  return parsed.success ? parsed.data : createDefaultDataGridConfiguration();
}
