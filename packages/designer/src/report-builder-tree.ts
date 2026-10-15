import {
  reportRepeaterColumnWidth,
  reportElementChildren,
  reportRepeaterTemplateHeight,
  reportRepeaterSectionColumnWidth,
  type WebReportElement,
  type WebReportRepeaterElement,
  type WebReportRepeaterLayout,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';

export type ReportRepeaterSection = 'header' | 'row' | 'footer';
export interface ReportSelection {
  readonly bandId: string;
  readonly elementId: string | null;
  readonly parentId?: string;
  readonly section?: ReportRepeaterSection;
  readonly column?: number;
  /** Transient identity of a canvas projection; never part of the saved report tree. */
  readonly canvasPath?: string;
}
export function findReportElement(
  elements: readonly WebReportElement[],
  id: string,
): WebReportElement | undefined {
  for (const element of elements) {
    if (element.id === id) return element;
    const match = findReportElement(reportElementChildren(element), id);
    if (match !== undefined) return match;
  }
  return undefined;
}
export function mapReportElements(
  elements: readonly WebReportElement[],
  edit: (element: WebReportElement) => WebReportElement | null,
): WebReportElement[] {
  return elements.flatMap((element) => {
    const nested =
      element.type === 'group'
        ? { ...element, children: mapReportElements(element.children, edit) }
        : element.type !== 'repeater'
          ? element
          : {
              ...element,
              children: mapReportElements(element.children, edit),
              ...(element.header === undefined
                ? {}
                : {
                    header: {
                      ...element.header,
                      elements: mapReportElements(element.header.elements, edit),
                    },
                  }),
              ...(element.footer === undefined
                ? {}
                : {
                    footer: {
                      ...element.footer,
                      elements: mapReportElements(element.footer.elements, edit),
                    },
                  }),
            };
    const next = edit(nested);
    return next === null ? [] : [next];
  });
}
export function reportContainer(template: WebReportTemplate, selection: ReportSelection) {
  const band = template.bands.find((item) => item.id === selection.bandId);
  const element =
    selection.parentId === undefined
      ? undefined
      : findReportElement(band?.elements ?? [], selection.parentId);
  const parent = element?.type === 'repeater' || element?.type === 'group' ? element : undefined;
  const section = selection.section ?? 'row';
  return {
    band,
    parent,
    elements:
      parent === undefined
        ? (band?.elements ?? [])
        : parent.type === 'group' || section === 'row'
          ? parent.children
          : (parent[section]?.elements ?? []).filter(
              (element) => (element.column ?? 0) === (selection.column ?? 0),
            ),
    width:
      parent === undefined
        ? undefined
        : parent.type === 'group'
          ? parent.width
          : section === 'row'
            ? reportRepeaterColumnWidth(parent)
            : reportRepeaterSectionColumnWidth(parent, section),
    height:
      parent === undefined
        ? band?.height
        : parent.type === 'group' || section === 'row'
          ? parent.height
          : parent[section]?.height,
  };
}
export function reportElementSelection(
  template: WebReportTemplate,
  bandId: string,
  elementId: string,
): ReportSelection | undefined {
  const visit = (
    elements: readonly WebReportElement[],
    parentId?: string,
    section?: ReportRepeaterSection,
  ): ReportSelection | undefined => {
    for (const element of elements) {
      if (element.id === elementId)
        return {
          bandId,
          elementId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(section === undefined ? {} : { section }),
          ...(section === undefined || section === 'row' ? {} : { column: element.column ?? 0 }),
        };
      if (element.type === 'group') {
        const found = visit(element.children, element.id);
        if (found !== undefined) return found;
      } else if (element.type === 'repeater')
        for (const kind of ['header', 'row', 'footer'] as const) {
          const found = visit(
            kind === 'row' ? element.children : (element[kind]?.elements ?? []),
            element.id,
            kind,
          );
          if (found !== undefined) return found;
        }
    }
    return undefined;
  };
  return visit(template.bands.find((band) => band.id === bandId)?.elements ?? []);
}
export function reportRowSource(
  template: WebReportTemplate,
  selection: ReportSelection,
): WebReportRepeaterElement['source'] | undefined {
  const { parent } = reportContainer(template, selection);
  if (parent === undefined) return undefined;
  if (parent.type === 'group') {
    const owner = reportElementSelection(template, selection.bandId, parent.id);
    return owner === undefined ? undefined : reportRowSource(template, owner);
  }
  if (selection.section !== undefined && selection.section !== 'row') {
    const owner = reportElementSelection(template, selection.bandId, parent.id);
    return owner === undefined ? undefined : reportRowSource(template, owner);
  }
  if (parent.source.scope !== 'row') return parent.source;
  const owner = reportElementSelection(template, selection.bandId, parent.id);
  const outer = owner === undefined ? undefined : reportRowSource(template, owner);
  return outer === undefined
    ? undefined
    : { ...outer, listPath: `${outer.listPath}/*${parent.source.listPath}` };
}

/** Column changes resize the authored template instead of leaving its children outside the cell. */
export function resizeReportRepeaterLayout(
  element: WebReportRepeaterElement,
  layout: WebReportRepeaterLayout,
): WebReportRepeaterElement {
  const next = { ...element, layout };
  const ratio = reportRepeaterColumnWidth(next) / reportRepeaterColumnWidth(element);
  if (!Number.isFinite(ratio) || ratio <= 0) return next;
  return { ...next, children: scaleReportElementsWidth(element.children, ratio) };
}

function scaleReportElementsWidth(
  items: readonly WebReportElement[],
  ratio: number,
): WebReportElement[] {
  return items.map((child) => {
    const base = { ...child, x: child.x * ratio, width: child.width * ratio };
    return base.type === 'group'
      ? { ...base, children: scaleReportElementsWidth(base.children, ratio) }
      : base.type !== 'repeater'
        ? base
        : {
            ...base,
            children: scaleReportElementsWidth(base.children, ratio),
            ...(base.header === undefined
              ? {}
              : {
                  header: {
                    ...base.header,
                    ...(base.header.columnGap === undefined
                      ? {}
                      : { columnGap: base.header.columnGap * ratio }),
                    elements: scaleReportElementsWidth(base.header.elements, ratio),
                  },
                }),
            ...(base.footer === undefined
              ? {}
              : {
                  footer: {
                    ...base.footer,
                    ...(base.footer.columnGap === undefined
                      ? {}
                      : { columnGap: base.footer.columnGap * ratio }),
                    elements: scaleReportElementsWidth(base.footer.elements, ratio),
                  },
                }),
            ...(base.layout === undefined
              ? {}
              : { layout: { ...base.layout, columnGap: base.layout.columnGap * ratio } }),
          };
  });
}

export function resizeReportRepeaterSectionColumns(
  element: WebReportRepeaterElement,
  section: 'header' | 'footer',
  layout: { readonly columns: number; readonly columnGap: number },
): WebReportRepeaterElement {
  const original = element[section];
  if (original === undefined) return element;
  const next = { ...element, [section]: { ...original, ...layout } };
  const ratio =
    reportRepeaterSectionColumnWidth(next, section) /
    reportRepeaterSectionColumnWidth(element, section);
  if (
    !Number.isInteger(layout.columns) ||
    layout.columns < 1 ||
    !Number.isFinite(ratio) ||
    ratio <= 0
  )
    return next;
  const elements = scaleReportElementsWidth(original.elements, ratio).map((child) => ({
    ...child,
    y: child.y + Math.floor((child.column ?? 0) / layout.columns) * original.height,
    ...(child.column === undefined ? {} : { column: child.column % layout.columns }),
  }));
  const height = Math.max(
    original.height,
    ...elements.map(
      (child) =>
        child.y + (child.type === 'repeater' ? reportRepeaterTemplateHeight(child) : child.height),
    ),
  );
  return { ...next, [section]: { ...original, ...layout, height, elements } };
}

/** Adding sections grows their owning containers without moving adjacent authored elements. */
export function fitReportContainers(
  template: WebReportTemplate,
  selection: ReportSelection,
): WebReportTemplate {
  const container = reportContainer(template, selection);
  const height = Math.max(
    container.height ?? 0,
    ...container.elements.map(
      (element) =>
        element.y +
        (element.type === 'repeater' ? reportRepeaterTemplateHeight(element) : element.height),
    ),
  );
  if (container.parent === undefined)
    return {
      ...template,
      bands: template.bands.map((band) =>
        band.id === selection.bandId ? { ...band, height } : band,
      ),
    };
  const parent = container.parent;
  const section = selection.section ?? 'row';
  const bands = template.bands.map((band) =>
    band.id !== selection.bandId
      ? band
      : {
          ...band,
          elements: mapReportElements(band.elements, (element) =>
            element.id !== parent.id || (element.type !== 'repeater' && element.type !== 'group')
              ? element
              : element.type === 'group' || section === 'row'
                ? { ...element, height }
                : { ...element, [section]: { ...element[section], height } },
          ),
        },
  );
  const next = { ...template, bands };
  const owner = reportElementSelection(next, selection.bandId, parent.id);
  return owner === undefined ? next : fitReportContainers(next, owner);
}
