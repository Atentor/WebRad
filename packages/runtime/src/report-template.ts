/** Browser-safe, versioned report document. Geometry is expressed in millimetres. */
export type WebReportParameterType = 'string' | 'number' | 'boolean' | 'date';
export type WebReportParameterValue = string | number | boolean | null;
export interface WebReportParameter {
  readonly name: string;
  readonly type: WebReportParameterType;
  readonly defaultValue: WebReportParameterValue;
}
export type WebReportValueSource =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'parameter'; readonly name: string }
  | {
      readonly kind: 'field';
      readonly apiClientId: string;
      readonly operationId: string;
      readonly path: string;
    }
  | { readonly kind: 'row'; readonly path: string }
  | { readonly kind: 'system'; readonly value: 'pageNumber' | 'pageCount' };
export interface WebReportElementBase {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Zero-based owning column when placed directly in a Repeater Header or Footer. */
  readonly column?: number;
}
export interface WebReportTextElement extends WebReportElementBase {
  readonly type: 'text';
  readonly value: WebReportValueSource;
  /** PDF point size (1/72 inch). */
  readonly fontSize: number;
  readonly color: string;
  readonly bold: boolean;
  readonly align: 'left' | 'center' | 'right';
}
export interface WebReportImageElement extends WebReportElementBase {
  readonly type: 'image';
  readonly value: WebReportValueSource;
  readonly fit: 'contain';
}
export interface WebReportLineElement extends WebReportElementBase {
  readonly type: 'line';
  readonly color: string;
  /** PDF point size. */
  readonly strokeWidth: number;
}
export type WebReportLeafElement =
  WebReportTextElement | WebReportImageElement | WebReportLineElement;
export interface WebReportRepeaterSection {
  readonly height: number;
  readonly elements: readonly WebReportElement[];
  readonly columns?: number;
  readonly columnGap?: number;
}
export interface WebReportRepeaterAppearance {
  readonly backgroundColor: string | null;
  readonly borderColor: string;
  /** Millimetres, matching the editor's geometry. */
  readonly borderWidth: number;
  readonly borderStyle: 'solid' | 'dashed';
  readonly rowLines: boolean;
  readonly columnLines: boolean;
  readonly lineColor: string;
  readonly lineWidth: number;
}
export interface WebReportRepeaterLayout {
  readonly columns: number;
  /** Rows per grid block; zero fits all records into the configured columns. */
  readonly rows: number;
  readonly columnGap: number;
  readonly fill: 'rows' | 'columns';
}
export interface WebReportRepeaterElement extends WebReportElementBase {
  readonly type: 'repeater';
  readonly source: {
    readonly apiClientId: string;
    readonly operationId: string;
    readonly listPath: string;
    /** Nested repeaters can read a list relative to the enclosing record. */
    readonly scope?: 'api' | 'row';
  };
  /** Space in millimetres between complete records. */
  readonly gap: number;
  readonly children: readonly WebReportElement[];
  readonly header?: WebReportRepeaterSection;
  readonly footer?: WebReportRepeaterSection;
  readonly appearance?: WebReportRepeaterAppearance;
  readonly layout?: WebReportRepeaterLayout;
}
export type WebReportElement = WebReportLeafElement | WebReportRepeaterElement;
export type WebReportBandKind = 'title' | 'pageHeader' | 'detail' | 'pageFooter' | 'summary';
export interface WebReportBand {
  readonly id: string;
  readonly kind: WebReportBandKind;
  readonly height: number;
  readonly elements: readonly WebReportElement[];
}
export interface WebReportTemplate {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly paper: {
    readonly size: 'A4' | 'Letter';
    readonly orientation: 'portrait' | 'landscape';
    readonly margins: {
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };
  };
  readonly parameters: readonly WebReportParameter[];
  readonly bands: readonly WebReportBand[];
}

export function reportRepeaterLayout(element: WebReportRepeaterElement): WebReportRepeaterLayout {
  return element.layout ?? { columns: 1, rows: 0, columnGap: 0, fill: 'rows' };
}
export function reportRepeaterAppearance(
  element: WebReportRepeaterElement,
): WebReportRepeaterAppearance {
  return (
    element.appearance ?? {
      backgroundColor: null,
      borderColor: '#94a3b8',
      borderWidth: 0,
      borderStyle: 'solid',
      rowLines: false,
      columnLines: false,
      lineColor: '#cbd5e1',
      lineWidth: 0.2,
    }
  );
}
export function reportRepeaterColumnWidth(element: WebReportRepeaterElement): number {
  const layout = reportRepeaterLayout(element);
  return (element.width - (layout.columns - 1) * layout.columnGap) / layout.columns;
}
export function reportRepeaterSectionLayout(
  section: WebReportRepeaterSection | undefined,
): Pick<WebReportRepeaterLayout, 'columns' | 'columnGap'> {
  return { columns: section?.columns ?? 1, columnGap: section?.columnGap ?? 0 };
}
export function reportRepeaterSectionColumnWidth(
  element: WebReportRepeaterElement,
  section: 'header' | 'footer',
): number {
  const layout = reportRepeaterSectionLayout(element[section]);
  return (element.width - (layout.columns - 1) * layout.columnGap) / layout.columns;
}
export function reportRepeaterTemplateHeight(element: WebReportRepeaterElement): number {
  return (element.header?.height ?? 0) + element.height + (element.footer?.height ?? 0);
}
/** All authored descendants, including sections, without introducing runtime globals. */
export function reportRepeaterElements(
  element: WebReportRepeaterElement,
): readonly WebReportElement[] {
  return [
    ...(element.header?.elements ?? []),
    ...element.children,
    ...(element.footer?.elements ?? []),
  ];
}

export function createDefaultReportTemplate(): WebReportTemplate {
  return {
    schemaVersion: 1,
    name: 'Relatório',
    paper: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 15, right: 15, bottom: 15, left: 15 },
    },
    parameters: [],
    bands: [
      {
        id: 'report-title',
        kind: 'title',
        height: 22,
        elements: [
          {
            id: 'report-heading',
            name: 'Título',
            type: 'text',
            x: 0,
            y: 0,
            width: 180,
            height: 12,
            value: { kind: 'static', value: 'Meu relatório' },
            fontSize: 22,
            color: '#1e293b',
            bold: true,
            align: 'left',
          },
        ],
      },
      { id: 'report-page-header', kind: 'pageHeader', height: 10, elements: [] },
      { id: 'report-detail', kind: 'detail', height: 30, elements: [] },
      {
        id: 'report-page-footer',
        kind: 'pageFooter',
        height: 10,
        elements: [
          {
            id: 'report-page-number',
            name: 'Página',
            type: 'text',
            x: 150,
            y: 0,
            width: 30,
            height: 8,
            value: { kind: 'system', value: 'pageNumber' },
            fontSize: 9,
            color: '#64748b',
            bold: false,
            align: 'right',
          },
        ],
      },
      { id: 'report-summary', kind: 'summary', height: 12, elements: [] },
    ],
  };
}

function fail(path: string, message: string): never {
  throw new TypeError(`Report template ${path}: ${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail(path, 'expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > 100_000)
    return fail(path, 'expected text.');
  return value;
}
function number(value: unknown, path: string, min = 0, max = 10_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    return fail(path, `expected a number from ${String(min)} to ${String(max)}.`);
  return value;
}
function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T))
    return fail(path, `expected ${options.join(', ')}.`);
  return value as T;
}
function list(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    return fail(path, `expected an array with at most ${String(maximum)} items.`);
  return value;
}
function pointer(value: unknown, path: string): string {
  const result = text(value, path, true);
  if ((result !== '' && !result.startsWith('/')) || /~(?![01])/u.test(result))
    return fail(path, 'expected a JSON Pointer.');
  if (
    result
      .split('/')
      .some((part) =>
        ['__proto__', 'constructor', 'prototype'].includes(
          part.replace(/~1/gu, '/').replace(/~0/gu, '~'),
        ),
      )
  )
    return fail(path, 'unsafe field name.');
  return result;
}
function color(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^#[\da-f]{6}$/iu.test(result)) return fail(path, 'expected #RRGGBB.');
  return result;
}

/** Checks both authored defaults and programmatically supplied values. Dates use ISO text. */
export function validateReportParameterValue(
  parameter: WebReportParameter,
  value: unknown,
): WebReportParameterValue {
  if (value === null) return null;
  const validDate =
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    Number.isFinite(Date.parse(`${value.slice(0, 10)}T00:00:00Z`)) &&
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);
  const valid =
    parameter.type === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : parameter.type === 'boolean'
        ? typeof value === 'boolean'
        : parameter.type === 'date'
          ? validDate
          : typeof value === 'string';
  if (!valid)
    throw new TypeError(`Report parameter "${parameter.name}" must be ${parameter.type}.`);
  return value as WebReportParameterValue;
}

export function reportPaperSize(template: WebReportTemplate): {
  readonly width: number;
  readonly height: number;
} {
  const size =
    template.paper.size === 'Letter'
      ? { width: 215.9, height: 279.4 }
      : { width: 210, height: 297 };
  return template.paper.orientation === 'landscape'
    ? { width: size.height, height: size.width }
    : size;
}

/** Parses into a fresh validated value; unknown properties never enter the runtime model. */
export function parseReportTemplate(value: unknown): WebReportTemplate {
  const source = record(
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value,
    'document',
  );
  if (source.schemaVersion !== 1) return fail('schemaVersion', 'only version 1 is supported.');
  const paper = record(source.paper, 'paper');
  const margins = record(paper.margins, 'paper.margins');
  const parameters = list(source.parameters, 'parameters', 200).map(
    (item, index): WebReportParameter => {
      const param = record(item, `parameters[${String(index)}]`);
      const name = text(param.name, 'parameter.name');
      if (
        !/^[A-Za-z_][A-Za-z\d_]*$/u.test(name) ||
        ['__proto__', 'constructor', 'prototype'].includes(name)
      )
        return fail('parameter.name', 'use a unique identifier.');
      const type = choice(param.type, ['string', 'number', 'boolean', 'date'], 'parameter.type');
      const result: WebReportParameter = { name, type, defaultValue: null };
      return { ...result, defaultValue: validateReportParameterValue(result, param.defaultValue) };
    },
  );
  if (new Set(parameters.map((param) => param.name)).size !== parameters.length)
    return fail('parameters', 'duplicate parameter name.');
  const ids = new Set<string>();
  const id = (value: unknown): string => {
    const result = text(value, 'id');
    if (ids.has(result)) return fail('id', `duplicate identifier "${result}".`);
    ids.add(result);
    return result;
  };
  const binding = (value: unknown, inRow: boolean): WebReportValueSource => {
    const item = record(value, 'element.value');
    switch (item.kind) {
      case 'static':
        return { kind: 'static', value: text(item.value, 'value.value', true) };
      case 'parameter': {
        const name = text(item.name, 'value.name');
        if (!parameters.some((parameter) => parameter.name === name))
          return fail('value.name', `unknown parameter "${name}".`);
        return { kind: 'parameter', name };
      }
      case 'field':
        return {
          kind: 'field',
          apiClientId: text(item.apiClientId, 'value.apiClientId', true),
          operationId: text(item.operationId, 'value.operationId', true),
          path: pointer(item.path, 'value.path'),
        };
      case 'row': {
        if (!inRow) return fail('value.kind', 'row fields require a repeater.');
        return { kind: 'row', path: pointer(item.path, 'value.path') };
      }
      case 'system':
        return {
          kind: 'system',
          value: choice(item.value, ['pageNumber', 'pageCount'], 'value.value'),
        };
      default:
        return fail('value.kind', 'unknown value source.');
    }
  };
  const element = (
    value: unknown,
    inRow: boolean,
    parentWidth: number,
    parentHeight: number,
    kind: WebReportBandKind,
    depth = 0,
    sectionColumns?: number,
  ): WebReportElement => {
    if (depth > 16) return fail('element', 'repeater nesting exceeds 16 levels.');
    const item = record(value, 'element');
    const base: WebReportElementBase = {
      id: id(item.id),
      name: text(item.name, 'element.name'),
      x: number(item.x, 'element.x'),
      y: number(item.y, 'element.y'),
      width: number(item.width, 'element.width', 0.1),
      height: number(item.height, 'element.height', 0.1),
      ...(item.column === undefined
        ? {}
        : { column: number(item.column, 'element.column', 0, (sectionColumns ?? 1) - 1) }),
    };
    if (
      base.column !== undefined &&
      (!Number.isInteger(base.column) || sectionColumns === undefined)
    )
      return fail('element.column', 'choose an existing Header or Footer column.');
    if (base.x + base.width > parentWidth + 0.001 || base.y + base.height > parentHeight + 0.001)
      return fail(`element.${base.name}`, 'geometry exceeds its band or row.');
    switch (item.type) {
      case 'text': {
        if (typeof item.bold !== 'boolean') return fail('element.bold', 'expected a boolean.');
        return {
          ...base,
          type: 'text',
          value: binding(item.value, inRow),
          fontSize: number(item.fontSize, 'element.fontSize', 4, 144),
          color: color(item.color, 'element.color'),
          bold: item.bold,
          align: choice(item.align, ['left', 'center', 'right'], 'element.align'),
        };
      }
      case 'image':
        return {
          ...base,
          type: 'image',
          value: binding(item.value, inRow),
          fit: choice(item.fit, ['contain'], 'element.fit'),
        };
      case 'line':
        return {
          ...base,
          type: 'line',
          color: color(item.color, 'element.color'),
          strokeWidth: number(item.strokeWidth, 'element.strokeWidth', 0.1, 20),
        };
      case 'repeater': {
        if (kind === 'pageHeader' || kind === 'pageFooter')
          return fail('element.type', 'page headers and footers cannot contain repeaters.');
        const data = record(item.source, 'repeater.source');
        const scope =
          data.scope === undefined ? undefined : choice(data.scope, ['api', 'row'], 'source.scope');
        if (scope === 'row' && !inRow)
          return fail('source.scope', 'a parent row source requires an enclosing record.');
        const layoutSource =
          item.layout === undefined ? undefined : record(item.layout, 'repeater.layout');
        const layout: WebReportRepeaterLayout | undefined =
          layoutSource === undefined
            ? undefined
            : {
                columns: number(layoutSource.columns, 'layout.columns', 1, 24),
                rows: number(layoutSource.rows, 'layout.rows', 0, 100_000),
                columnGap: number(layoutSource.columnGap, 'layout.columnGap', 0, 100),
                fill: choice(layoutSource.fill, ['rows', 'columns'], 'layout.fill'),
              };
        if (
          layout !== undefined &&
          (!Number.isInteger(layout.columns) || !Number.isInteger(layout.rows))
        )
          return fail('repeater.layout', 'rows and columns must be whole numbers.');
        const columnWidth =
          (base.width - ((layout?.columns ?? 1) - 1) * (layout?.columnGap ?? 0)) /
          (layout?.columns ?? 1);
        if (columnWidth < 0.1)
          return fail('layout.columnGap', 'columns must have at least 0.1 mm of content width.');
        const section = (value: unknown, name: string): WebReportRepeaterSection | undefined => {
          if (value === undefined) return undefined;
          const source = record(value, `repeater.${name}`);
          const height = number(source.height, `${name}.height`, 0.1, parentHeight);
          const columns =
            source.columns === undefined ? 1 : number(source.columns, `${name}.columns`, 1, 24);
          if (!Number.isInteger(columns))
            return fail(`${name}.columns`, 'columns must be a whole number.');
          const columnGap =
            source.columnGap === undefined
              ? 0
              : number(source.columnGap, `${name}.columnGap`, 0, 100);
          const width = (base.width - (columns - 1) * columnGap) / columns;
          if (width < 0.1)
            return fail(`${name}.columnGap`, 'columns must have at least 0.1 mm of content width.');
          return {
            height,
            ...(source.columns === undefined ? {} : { columns }),
            ...(source.columnGap === undefined ? {} : { columnGap }),
            elements: list(source.elements, `${name}.elements`, 500).map((child) =>
              element(child, inRow, width, height, kind, depth + 1, columns),
            ),
          };
        };
        const header = section(item.header, 'header');
        const footer = section(item.footer, 'footer');
        if (
          base.y + (header?.height ?? 0) + base.height + (footer?.height ?? 0) >
          parentHeight + 0.001
        )
          return fail(
            `element.${base.name}`,
            'geometry including Header and Footer exceeds its band or row.',
          );
        const paint =
          item.appearance === undefined
            ? undefined
            : record(item.appearance, 'repeater.appearance');
        const flag = (value: unknown, name: string): boolean => {
          if (typeof value !== 'boolean') return fail(name, 'expected a boolean.');
          return value;
        };
        const appearance: WebReportRepeaterAppearance | undefined =
          paint === undefined
            ? undefined
            : {
                backgroundColor:
                  paint.backgroundColor === null
                    ? null
                    : color(paint.backgroundColor, 'appearance.backgroundColor'),
                borderColor: color(paint.borderColor, 'appearance.borderColor'),
                borderWidth: number(paint.borderWidth, 'appearance.borderWidth', 0, 10),
                borderStyle: choice(
                  paint.borderStyle,
                  ['solid', 'dashed'],
                  'appearance.borderStyle',
                ),
                rowLines: flag(paint.rowLines, 'appearance.rowLines'),
                columnLines: flag(paint.columnLines, 'appearance.columnLines'),
                lineColor: color(paint.lineColor, 'appearance.lineColor'),
                lineWidth: number(paint.lineWidth, 'appearance.lineWidth', 0.01, 10),
              };
        return {
          ...base,
          type: 'repeater',
          source: {
            apiClientId: text(data.apiClientId, 'source.apiClientId', true),
            operationId: text(data.operationId, 'source.operationId', true),
            listPath: pointer(data.listPath, 'source.listPath'),
            ...(scope === undefined ? {} : { scope }),
          },
          gap: number(item.gap, 'repeater.gap', 0, 100),
          children: list(item.children, 'repeater.children', 500).map((child) =>
            element(child, true, columnWidth, base.height, kind, depth + 1),
          ),
          ...(header === undefined ? {} : { header }),
          ...(footer === undefined ? {} : { footer }),
          ...(appearance === undefined ? {} : { appearance }),
          ...(layout === undefined ? {} : { layout }),
        };
      }
      default:
        return fail('element.type', 'unknown component.');
    }
  };
  const partial = {
    schemaVersion: 1 as const,
    name: text(source.name, 'name'),
    paper: {
      size: choice(paper.size, ['A4', 'Letter'], 'paper.size'),
      orientation: choice(paper.orientation, ['portrait', 'landscape'], 'paper.orientation'),
      margins: {
        top: number(margins.top, 'margins.top', 0, 200),
        right: number(margins.right, 'margins.right', 0, 200),
        bottom: number(margins.bottom, 'margins.bottom', 0, 200),
        left: number(margins.left, 'margins.left', 0, 200),
      },
    },
    parameters,
    bands: [],
  };
  const size = reportPaperSize(partial);
  const width = size.width - partial.paper.margins.left - partial.paper.margins.right;
  const height = size.height - partial.paper.margins.top - partial.paper.margins.bottom;
  if (width < 10 || height < 10)
    return fail('paper.margins', 'leave at least 10 mm of printable area.');
  const bands = list(source.bands, 'bands', 5).map((value): WebReportBand => {
    const item = record(value, 'band');
    const kind = choice(
      item.kind,
      ['title', 'pageHeader', 'detail', 'pageFooter', 'summary'],
      'band.kind',
    );
    const bandHeight = number(item.height, 'band.height', 0, height);
    return {
      id: id(item.id),
      kind,
      height: bandHeight,
      elements: list(item.elements, 'band.elements', 1000).map((child) =>
        element(child, false, width, bandHeight, kind),
      ),
    };
  });
  if (new Set(bands.map((band) => band.kind)).size !== bands.length)
    return fail('bands', 'each band kind may occur once.');
  const fixedHeight = bands
    .filter((band) => band.kind === 'pageHeader' || band.kind === 'pageFooter')
    .reduce((sum, band) => sum + band.height, 0);
  if (height - fixedHeight < 10)
    return fail('bands', 'page header and footer leave less than 10 mm of content.');
  return { ...partial, bands };
}

export function serializeReportTemplate(template: WebReportTemplate): string {
  return JSON.stringify(parseReportTemplate(template), null, 2);
}

/** Own-property JSON Pointer traversal; a missing field displays an empty value. */
export function resolveReportPointer(value: unknown, path: string): unknown {
  if (path === '') return value;
  let current = value;
  for (const token of path.slice(1).split('/')) {
    const key = token.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key))
      return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
