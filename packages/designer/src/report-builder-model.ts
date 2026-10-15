import type { ComponentNode } from '@webrad/project-model';
import {
  reportPaperSize,
  type WebReportBandKind,
  type WebReportElement,
  type WebReportParameter,
  type WebReportTemplate,
  type WebReportValueSource,
} from '@webrad/runtime/report-template';
import { reportApiSource } from './report-builder-data.js';
import { mapReportElements, reportContainer, type ReportSelection } from './report-builder-tree.js';
export type { ReportSelection } from './report-builder-tree.js';

export const REPORT_BAND_LABELS: Readonly<Record<WebReportBandKind, string>> = {
  title: 'Title',
  pageHeader: 'Page header',
  detail: 'Detail',
  pageFooter: 'Page footer',
  summary: 'Summary',
};

export function reportOrderedBands(template: WebReportTemplate) {
  const order: readonly WebReportBandKind[] = [
    'title',
    'pageHeader',
    'detail',
    'summary',
    'pageFooter',
  ];
  return [...template.bands].sort(
    (left, right) => order.indexOf(left.kind) - order.indexOf(right.kind),
  );
}

export function reportSelectedElement(
  template: WebReportTemplate,
  selection: ReportSelection,
): WebReportElement | undefined {
  const container = reportContainer(template, selection);
  const elements =
    container.parent !== undefined && selection.section !== undefined && selection.section !== 'row'
      ? (container.parent[selection.section]?.elements ?? [])
      : container.elements;
  return elements.find((item) => item.id === selection.elementId);
}

export function editReportElement(
  template: WebReportTemplate,
  selection: ReportSelection,
  edit: (element: WebReportElement) => WebReportElement | null,
): WebReportTemplate {
  return {
    ...template,
    bands: template.bands.map((band) =>
      band.id === selection.bandId
        ? {
            ...band,
            elements: mapReportElements(band.elements, (element) =>
              element.id === selection.elementId ? edit(element) : element,
            ),
          }
        : band,
    ),
  };
}

export function reportContentWidth(template: WebReportTemplate): number {
  return (
    reportPaperSize(template).width - template.paper.margins.left - template.paper.margins.right
  );
}

export function createReportElement(
  type: WebReportElement['type'],
  width: number,
  height: number,
): WebReportElement {
  const base = {
    id: crypto.randomUUID(),
    name: { text: 'Text', image: 'Image', line: 'Line', repeater: 'Repeater' }[type],
    x: 0,
    y: 0,
    width: Math.min(width, type === 'repeater' ? width : type === 'image' ? 30 : 60),
    height: Math.min(
      height,
      type === 'line' ? 1 : type === 'repeater' ? 18 : type === 'image' ? 20 : 8,
    ),
  };
  switch (type) {
    case 'text':
      return {
        ...base,
        type,
        value: { kind: 'static', value: 'Text' },
        fontSize: 11,
        color: '#1e293b',
        bold: false,
        align: 'left',
      };
    case 'image':
      return { ...base, type, value: { kind: 'static', value: '' }, fit: 'contain' };
    case 'line':
      return { ...base, type, color: '#94a3b8', strokeWidth: 0.75 };
    case 'repeater':
      return {
        ...base,
        type,
        source: { apiClientId: '', operationId: '', listPath: '' },
        gap: 0,
        children: [],
      };
  }
}

export function insertReportElement(
  template: WebReportTemplate,
  selection: ReportSelection,
  element: WebReportElement,
): WebReportTemplate {
  if (selection.parentId !== undefined) {
    const parentSelection = { bandId: selection.bandId, elementId: selection.parentId };
    return editReportElement(template, parentSelection, (parent) =>
      parent.type !== 'repeater'
        ? parent
        : selection.section === undefined || selection.section === 'row'
          ? { ...parent, children: [...parent.children, element] }
          : {
              ...parent,
              [selection.section]: {
                ...parent[selection.section],
                elements: [
                  ...(parent[selection.section]?.elements ?? []),
                  {
                    ...element,
                    ...(selection.column === undefined ? {} : { column: selection.column }),
                  },
                ],
              },
            },
    );
  }
  return {
    ...template,
    bands: template.bands.map((band) =>
      band.id === selection.bandId ? { ...band, elements: [...band.elements, element] } : band,
    ),
  };
}

/** Duplicates preserve data bindings but always receive fresh persistent identities. */
export function duplicateReportElement(element: WebReportElement): WebReportElement {
  const base = { ...element, id: crypto.randomUUID(), name: `${element.name} copy` };
  return base.type === 'repeater'
    ? {
        ...base,
        children: base.children.map(duplicateReportElement),
        ...(base.header === undefined
          ? {}
          : {
              header: {
                ...base.header,
                elements: base.header.elements.map(duplicateReportElement),
              },
            }),
        ...(base.footer === undefined
          ? {}
          : {
              footer: {
                ...base.footer,
                elements: base.footer.elements.map(duplicateReportElement),
              },
            }),
      }
    : base;
}

export function renameReportParameter(
  template: WebReportTemplate,
  index: number,
  parameter: WebReportParameter,
): WebReportTemplate {
  const oldName = template.parameters[index]?.name;
  const update = (element: WebReportElement): WebReportElement => {
    if ('value' in element && element.value.kind === 'parameter' && element.value.name === oldName)
      return { ...element, value: { kind: 'parameter', name: parameter.name } };
    return element;
  };
  return {
    ...template,
    parameters: template.parameters.map((item, position) =>
      position === index ? parameter : item,
    ),
    bands: template.bands.map((band) => ({
      ...band,
      elements: mapReportElements(band.elements, update),
    })),
  };
}

export function reportValueLabel(source: WebReportValueSource): string {
  switch (source.kind) {
    case 'static':
      return source.value;
    case 'parameter':
      return `{${source.name}}`;
    case 'row':
      return `Row${source.path || ' value'}`;
    case 'field':
      return `Response${source.path}`;
    case 'system':
      return source.value === 'pageNumber' ? '1' : '{Pages}';
  }
}

/** Prevent silently saving unavailable fields or unfinished bindings. No API calls are made. */
export function reportBindingError(
  template: WebReportTemplate,
  components: readonly ComponentNode[],
): string | null {
  const visit = (
    element: WebReportElement,
    rowSource?: {
      readonly apiClientId: string;
      readonly operationId: string;
      readonly listPath: string;
    },
  ): string | null => {
    if (element.type === 'repeater') {
      const effective =
        element.source.scope === 'row' && rowSource !== undefined
          ? { ...rowSource, listPath: `${rowSource.listPath}/*${element.source.listPath}` }
          : element.source;
      const source = reportApiSource(
        components,
        effective.apiClientId,
        effective.operationId,
        effective.listPath,
      );
      if (source.operation === undefined || !source.listExists)
        return `${element.name}: choose an API Client, operation and response list.`;
      for (const child of [
        ...(element.header?.elements ?? []),
        ...(element.footer?.elements ?? []),
      ]) {
        const error = visit(child, rowSource);
        if (error !== null) return error;
      }
      for (const child of element.children) {
        const error = visit(child, effective);
        if (error !== null) return error;
      }
    } else if ('value' in element) {
      if (element.value.kind === 'field') {
        const value = element.value;
        const source = reportApiSource(components, value.apiClientId, value.operationId);
        if (
          source.operation === undefined ||
          !source.fields.some((item) => item.path === value.path)
        )
          return `${element.name}: choose an available API response field.`;
      }
      if (element.value.kind === 'row' && rowSource !== undefined) {
        const value = element.value;
        const source = reportApiSource(
          components,
          rowSource.apiClientId,
          rowSource.operationId,
          rowSource.listPath,
        );
        if (!source.rowFields.some((item) => item.path === value.path))
          return `${element.name}: choose an available row field.`;
      }
    }
    return null;
  };
  for (const band of template.bands)
    for (const element of band.elements) {
      const error = visit(element);
      if (error !== null) return error;
    }
  return null;
}
