import { z } from 'zod';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import { isLucideIconName, type LucideIconName } from '@webrad/runtime/icon';
import type { WebChartFontFamily } from '@webrad/runtime';
import type { ApiClientResponseSchema, ApiClientSchemaNode } from './api-client.js';
import { comboBoxSchemaChoices, type ComboBoxSchemaChoice } from './combo-box.js';

export const CHART_TYPES = [
  'doughnut',
  'pie',
  'bar',
  'horizontalBar',
  'line',
  'area',
  'radar',
  'polarArea',
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Each series observes one endpoint; API response rows remain transient. */
export interface ChartSeriesConfiguration {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly labelField: string;
  readonly valueField: string;
}

export interface ChartsConfiguration {
  readonly schemaVersion: 1;
  readonly type: ChartType;
  readonly title: string;
  readonly subtitle: string;
  readonly fontFamily?: WebChartFontFamily;
  readonly legendFontFamily?: WebChartFontFamily;
  readonly textColor?: string | null;
  readonly titleColor?: string | null;
  readonly subtitleColor?: string | null;
  readonly legendColor?: string | null;
  readonly titleIcon?: LucideIconName | null;
  readonly showLegend: boolean;
  readonly legendPosition: 'bottom' | 'right';
  readonly showGrid: boolean;
  readonly showLabels: boolean;
  readonly smooth: boolean;
  readonly stacked: boolean;
  readonly innerRadius: number;
  readonly valuePrefix: string;
  readonly valueSuffix: string;
  readonly decimalPlaces: number;
  readonly emptyText: string;
  readonly series: readonly ChartSeriesConfiguration[];
}

const reference = z.string().min(1).max(128).nullable();
const chartFont = z
  .custom<WebChartFontFamily>(
    (value) => value === 'inherit' || WEBRAD_FONT_FAMILIES.some((font) => font.id === value),
    'Choose an available chart font.',
  )
  .default('inherit');
const chartTextColor = z
  .string()
  .regex(/^#[\da-f]{6}$/iu)
  .nullable()
  .default(null);
const pointer = z
  .string()
  .max(4_096)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value)),
    'Use an empty path or a JSON Pointer.',
  );

export const ChartSeriesConfigurationSchema: z.ZodType<ChartSeriesConfiguration> = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    color: z.string().regex(/^#[\da-f]{6}$/iu, 'Use a six-digit hexadecimal color.'),
    apiClientId: reference,
    operationId: reference,
    listPath: pointer,
    labelField: pointer,
    valueField: pointer,
  })
  .strict()
  .refine(
    (series) => (series.apiClientId === null) === (series.operationId === null),
    'Select both an API Client and an endpoint.',
  );

export const ChartsConfigurationSchema: z.ZodType<ChartsConfiguration> = z
  .object({
    schemaVersion: z.literal(1),
    type: z.enum(CHART_TYPES),
    title: z.string().max(240),
    subtitle: z.string().max(500),
    fontFamily: chartFont,
    legendFontFamily: chartFont,
    textColor: chartTextColor,
    titleColor: chartTextColor,
    subtitleColor: chartTextColor,
    legendColor: chartTextColor,
    titleIcon: z
      .custom<LucideIconName>(isLucideIconName, 'Choose an available Lucide icon.')
      .nullable()
      .default(null),
    showLegend: z.boolean(),
    legendPosition: z.enum(['bottom', 'right']),
    showGrid: z.boolean(),
    showLabels: z.boolean(),
    smooth: z.boolean(),
    stacked: z.boolean(),
    innerRadius: z.number().finite().min(20).max(85),
    valuePrefix: z.string().max(40),
    valueSuffix: z.string().max(40),
    decimalPlaces: z.number().int().min(0).max(6),
    emptyText: z.string().max(500),
    series: z.array(ChartSeriesConfigurationSchema).max(5),
  })
  .strict()
  .superRefine((configuration, context) => {
    const ids = new Set<string>();
    configuration.series.forEach((series, index) => {
      if (ids.has(series.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Series identifiers must be unique.',
          path: ['series', index, 'id'],
        });
      }
      ids.add(series.id);
    });
  });

export function createDefaultChartsConfiguration(): ChartsConfiguration {
  return {
    schemaVersion: 1,
    type: 'bar',
    title: 'Chart title',
    subtitle: '',
    fontFamily: 'inherit',
    legendFontFamily: 'inherit',
    textColor: null,
    titleColor: null,
    subtitleColor: null,
    legendColor: null,
    titleIcon: null,
    showLegend: true,
    legendPosition: 'bottom',
    showGrid: true,
    showLabels: false,
    smooth: true,
    stacked: false,
    innerRadius: 65,
    valuePrefix: '',
    valueSuffix: '',
    decimalPlaces: 0,
    emptyText: 'No data to display',
    series: [],
  };
}

/** Labels accept scalar fields; measurements require a numeric response contract. */
export function chartSchemaChoices(
  schema: ApiClientResponseSchema | null | undefined,
  listPath: string,
): {
  readonly lists: readonly ComboBoxSchemaChoice[];
  readonly labels: readonly ComboBoxSchemaChoice[];
  readonly values: readonly ComboBoxSchemaChoice[];
} {
  const { lists, fields: labels } = comboBoxSchemaChoices(schema, listPath);
  const numeric = new Set<string>();
  const prefix = `${listPath}/*`;
  const collect = (node: ApiClientSchemaNode): void => {
    if (
      node.kind === 'field' &&
      ['number', 'integer'].includes(node.fieldType) &&
      (node.path === prefix || node.path.startsWith(`${prefix}/`))
    ) {
      numeric.add(node.path.slice(prefix.length));
    }
    node.children.forEach(collect);
  };
  if (schema != null) collect(schema.root);
  return { lists, labels, values: labels.filter((field) => numeric.has(field.path)) };
}
