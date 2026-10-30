import { WEBRAD_FONT_FAMILIES } from './fonts.js';
import { isLucideIconName, type LucideIconName } from './icon.js';

/** Browser-only chart contracts, shared by runtime and Designer projections. */
export const WEB_CHART_TYPES = [
  'doughnut',
  'pie',
  'bar',
  'horizontalBar',
  'line',
  'area',
  'radar',
  'polarArea',
] as const;
export type WebChartType = (typeof WEB_CHART_TYPES)[number];

export type WebChartFontFamily =
  | 'inherit'
  | 'roboto'
  | 'open-sans'
  | 'jetbrains-mono'
  | 'inter'
  | 'lato'
  | 'montserrat'
  | 'poppins'
  | 'nunito';

export interface WebChartSeriesConfiguration {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly apiClientId: string | null;
  readonly operationId: string | null;
  readonly listPath: string;
  readonly labelField: string;
  readonly valueField: string;
}

export interface WebChartsConfiguration {
  readonly schemaVersion: 1;
  readonly type: WebChartType;
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
  readonly series: readonly WebChartSeriesConfiguration[];
}

export interface WebChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface WebChartSeriesData {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly points: readonly WebChartPoint[];
}

/** The original numeric value and category of one activated chart mark. */
export interface WebChartPointEventDetail {
  readonly label: string;
  readonly value: number;
  readonly seriesId: string;
  readonly seriesName: string;
  readonly index: number;
}

export const WEB_CHART_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#38bdf8'] as const;

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function fontFamily(value: unknown): WebChartFontFamily {
  return WEBRAD_FONT_FAMILIES.some((font) => font.id === value)
    ? (value as WebChartFontFamily)
    : 'inherit';
}

function textColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value) ? value : null;
}

export function webChartColor(value: unknown, index = 0): string {
  return typeof value === 'string' && /^#[\da-f]{6}$/iu.test(value)
    ? value
    : (WEB_CHART_COLORS[index % WEB_CHART_COLORS.length] ?? '#6366f1');
}

/** Distinct shades keep a circular series tied to its authored base color. */
export function webChartSliceColor(baseColor: string, index: number): string {
  const base = webChartColor(baseColor);
  const shade = [0, 0.24, -0.2, 0.44, -0.38][index % 5] ?? 0;
  const channel = (offset: number): string => {
    const value = Number.parseInt(base.slice(offset, offset + 2), 16);
    return Math.round(shade >= 0 ? value + (255 - value) * shade : value * (1 + shade))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function normalizeWebChartsConfiguration(value: unknown): WebChartsConfiguration {
  const source = record(value);
  const series = Array.isArray(source.series) ? source.series.slice(0, 5) : [];
  const ids = new Set<string>();
  return Object.freeze({
    schemaVersion: 1,
    type: WEB_CHART_TYPES.includes(source.type as WebChartType)
      ? (source.type as WebChartType)
      : 'bar',
    title: text(source.title, 'Chart title'),
    subtitle: text(source.subtitle),
    fontFamily: fontFamily(source.fontFamily),
    legendFontFamily: fontFamily(source.legendFontFamily),
    textColor: textColor(source.textColor),
    titleColor: textColor(source.titleColor),
    subtitleColor: textColor(source.subtitleColor),
    legendColor: textColor(source.legendColor),
    titleIcon: isLucideIconName(source.titleIcon) ? source.titleIcon : null,
    showLegend: source.showLegend !== false,
    legendPosition: source.legendPosition === 'right' ? 'right' : 'bottom',
    showGrid: source.showGrid !== false,
    showLabels: source.showLabels === true,
    smooth: source.smooth !== false,
    stacked: source.stacked === true,
    innerRadius: number(source.innerRadius, 65, 20, 85),
    valuePrefix: text(source.valuePrefix),
    valueSuffix: text(source.valueSuffix),
    decimalPlaces: Math.round(number(source.decimalPlaces, 0, 0, 6)),
    emptyText: text(source.emptyText, 'No data to display'),
    series: Object.freeze(
      series.map((entry: unknown, index: number) => {
        const item = record(entry);
        const requested = text(item.id, `series-${String(index + 1)}`);
        let id = requested || `series-${String(index + 1)}`;
        let suffix = 1;
        while (ids.has(id)) id = `${requested || 'series'}-${String(suffix++)}`;
        ids.add(id);
        return Object.freeze({
          id,
          name: text(item.name, `Series ${String(index + 1)}`),
          color: webChartColor(item.color, index),
          apiClientId: typeof item.apiClientId === 'string' ? item.apiClientId : null,
          operationId: typeof item.operationId === 'string' ? item.operationId : null,
          listPath: text(item.listPath),
          labelField: text(item.labelField),
          valueField: text(item.valueField),
        });
      }),
    ),
  });
}

/** Invalid pointers and missing properties never select a different value. */
export function webChartPointer(value: unknown, pointer: string): unknown {
  if (pointer === '') return value;
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) return undefined;
  let current = value;
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key))
      return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

export function webChartPoints(
  rows: readonly unknown[],
  configuration: WebChartSeriesConfiguration,
): readonly WebChartPoint[] {
  const points: WebChartPoint[] = [];
  for (const row of rows) {
    const label = webChartPointer(row, configuration.labelField);
    const value = webChartPointer(row, configuration.valueField);
    if (
      (typeof label === 'string' || typeof label === 'number' || typeof label === 'boolean') &&
      (typeof label !== 'number' || Number.isFinite(label)) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      points.push(Object.freeze({ label: String(label), value }));
    }
  }
  return Object.freeze(points);
}

const formatters = new WeakMap<WebChartsConfiguration, Intl.NumberFormat>();

export function formatWebChartValue(value: number, configuration: WebChartsConfiguration): string {
  let formatter = formatters.get(configuration);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: configuration.decimalPlaces,
      maximumFractionDigits: configuration.decimalPlaces,
    });
    formatters.set(configuration, formatter);
  }
  return `${configuration.valuePrefix}${formatter.format(value)}${configuration.valueSuffix}`;
}

export function freezeWebChartData(
  value: readonly WebChartSeriesData[],
): readonly WebChartSeriesData[] {
  if (!Array.isArray(value) || value.length > 5)
    throw new RangeError('Charts supports at most five series.');
  const ids = new Set<string>();
  return Object.freeze(
    value.map((series: WebChartSeriesData, index: number) => {
      if (
        typeof series.id !== 'string' ||
        !series.id ||
        ids.has(series.id) ||
        typeof series.name !== 'string' ||
        !Array.isArray(series.points)
      ) {
        throw new TypeError('Invalid or duplicate chart series.');
      }
      ids.add(series.id);
      return Object.freeze({
        id: series.id,
        name: series.name,
        color: webChartColor(series.color, index),
        points: Object.freeze(
          series.points.map((point: WebChartPoint) => {
            if (
              typeof point.label !== 'string' ||
              typeof point.value !== 'number' ||
              !Number.isFinite(point.value)
            ) {
              throw new TypeError(
                'Chart points require a string label and a finite numeric value.',
              );
            }
            return Object.freeze({ label: point.label, value: point.value });
          }),
        ),
      });
    }),
  );
}
