import { z } from 'zod';

/** Only the template and declarative bindings are saved; API results stay transient. */
export const REPEATING_GROUP_CONFIGURATION_VERSION = 1 as const;

export interface RepeatingGroupConfiguration {
  readonly schemaVersion: typeof REPEATING_GROUP_CONFIGURATION_VERSION;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  /** JSON Pointer to the response list; empty selects the response itself. */
  readonly listPath: string;
  readonly rowHeightMode: 'fixed' | 'dynamic';
  readonly fixedRowHeight: number;
  readonly minRowHeight: number;
  readonly maxRowHeight: number | null;
  /** Space between rows, independent of the template's container layout gap. */
  readonly gap: number;
  readonly emptyMessage: string;
}

export interface CurrentRowBinding {
  readonly property: string;
  /** JSON Pointer relative to the current row; empty selects its scalar value. */
  readonly fieldPath: string;
}

const pointerSchema = z
  .string()
  .max(4_096)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value)),
    'A row field path must be a valid JSON Pointer.',
  );
const pixelSchema = z.number().finite().min(0).max(10_000);
const idSchema = z.string().trim().min(1).max(200).nullable();

export const RepeatingGroupConfigurationSchema: z.ZodType<RepeatingGroupConfiguration> = z
  .object({
    schemaVersion: z.literal(REPEATING_GROUP_CONFIGURATION_VERSION),
    apiClientId: idSchema,
    operationId: idSchema,
    listPath: pointerSchema,
    rowHeightMode: z.enum(['fixed', 'dynamic']),
    fixedRowHeight: pixelSchema.min(1),
    minRowHeight: pixelSchema,
    maxRowHeight: pixelSchema.min(1).nullable(),
    gap: pixelSchema,
    emptyMessage: z.string().max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.maxRowHeight !== null && value.maxRowHeight < value.minRowHeight)
      context.addIssue({
        code: 'custom',
        path: ['maxRowHeight'],
        message: 'Maximum row height must be at least the minimum row height.',
      });
    if ((value.apiClientId === null) !== (value.operationId === null))
      context.addIssue({
        code: 'custom',
        path: ['operationId'],
        message: 'Select both the API Client and its operation.',
      });
  });

export const CurrentRowBindingsSchema: z.ZodType<readonly CurrentRowBinding[]> = z
  .array(
    z
      .object({
        property: z
          .string()
          .regex(/^[$A-Z_a-z][$\w]*$/u)
          .refine(
            (value) =>
              !['__proto__', 'prototype', 'constructor', 'element', 'id', 'name'].includes(value),
            'A row binding must target a writable visual property.',
          ),
        fieldPath: pointerSchema,
      })
      .strict(),
  )
  .max(100)
  .superRefine((bindings, context) => {
    const names = new Set<string>();
    bindings.forEach((binding, index) => {
      if (names.has(binding.property))
        context.addIssue({
          code: 'custom',
          path: [index, 'property'],
          message: 'A visual property can have only one row binding.',
        });
      names.add(binding.property);
    });
  });

export function createDefaultRepeatingGroupConfiguration(): RepeatingGroupConfiguration {
  return {
    schemaVersion: REPEATING_GROUP_CONFIGURATION_VERSION,
    apiClientId: null,
    operationId: null,
    listPath: '',
    rowHeightMode: 'dynamic',
    fixedRowHeight: 120,
    minRowHeight: 80,
    maxRowHeight: null,
    gap: 8,
    emptyMessage: 'No data',
  };
}

export function normalizeRepeatingGroupConfiguration(value: unknown): RepeatingGroupConfiguration {
  const parsed = RepeatingGroupConfigurationSchema.safeParse(value);
  return parsed.success ? parsed.data : createDefaultRepeatingGroupConfiguration();
}

export function normalizeCurrentRowBindings(value: unknown): readonly CurrentRowBinding[] {
  const parsed = CurrentRowBindingsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
