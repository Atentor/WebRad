import type { ComponentNode } from '@webrad/project-model';
import {
  reportPaperSize,
  type WebReportBandKind,
  type WebReportElement,
  type WebReportLeafElement,
  type WebReportParameter,
  type WebReportTemplate,
  type WebReportValueSource,
} from '@webrad/runtime/report-template';
import { reportApiSource } from './report-builder-data.js';

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

export interface ReportSelection {
  readonly bandId: string;
  readonly elementId: string | null;
  readonly parentId?: string;
}

export function reportSelectedElement(
  template: WebReportTemplate,
  selection: ReportSelection,
): WebReportElement | undefined {
  const band = template.bands.find((item) => item.id === selection.bandId);
  if (selection.parentId === undefined)
    return band?.elements.find((item) => item.id === selection.elementId);
  const parent = band?.elements.find((item) => item.id === selection.parentId);
  return parent?.type === 'repeater'
    ? parent.children.find((item) => item.id === selection.elementId)
    : undefined;
}

export function editReportElement(
  template: WebReportTemplate,
  selection: ReportSelection,
  edit: (element: WebReportElement) => WebReportElement | null,
): WebReportTemplate {
  const update = (elements: readonly WebReportElement[]): WebReportElement[] =>
    elements.flatMap((element) => {
      if (
        selection.parentId !== undefined &&
        element.id === selection.parentId &&
        element.type === 'repeater'
      ) {
        return [
          {
            ...element,
            children: element.children.flatMap((child) => {
              const next = child.id === selection.elementId ? edit(child) : child;
              return next !== null && next.type !== 'repeater' ? [next] : [];
            }),
          },
        ];
      }
      const next =
        selection.parentId === undefined && element.id === selection.elementId
          ? edit(element)
          : element;
      return next === null ? [] : [next];
    });
  return {
    ...template,
    bands: template.bands.map((band) =>
      band.id === selection.bandId ? { ...band, elements: update(band.elements) } : band,
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
      parent.type === 'repeater' && element.type !== 'repeater'
        ? { ...parent, children: [...parent.children, element] }
        : parent,
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
        children: base.children.map(
          (child) => duplicateReportElement(child) as WebReportLeafElement,
        ),
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
    if (element.type === 'repeater')
      return {
        ...element,
        children: element.children.map((child) => update(child) as WebReportLeafElement),
      };
    if ('value' in element && element.value.kind === 'parameter' && element.value.name === oldName)
      return { ...element, value: { kind: 'parameter', name: parameter.name } };
    return element;
  };
  return {
    ...template,
    parameters: template.parameters.map((item, position) =>
      position === index ? parameter : item,
    ),
    bands: template.bands.map((band) => ({ ...band, elements: band.elements.map(update) })),
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
      const source = reportApiSource(
        components,
        element.source.apiClientId,
        element.source.operationId,
        element.source.listPath,
      );
      if (
        source.operation === undefined ||
        !source.lists.some((item) => item.path === element.source.listPath)
      )
        return `${element.name}: choose an API Client, operation and response list.`;
      for (const child of element.children) {
        const error = visit(child, element.source);
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
