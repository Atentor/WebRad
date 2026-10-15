import {
  reportRepeaterAppearance,
  reportRepeaterColumnWidth,
  reportRepeaterLayout,
  reportRepeaterTemplateHeight,
  reportRepeaterSectionLayout,
  reportElementChildren,
  resolveReportPointer,
  type WebReportBand,
  type WebReportElement,
  type WebReportLeafElement,
  type WebReportGroupElement,
  type WebReportParameterValue,
  type WebReportRepeaterAppearance,
  type WebReportRepeaterElement,
} from './report-template.js';

export interface ReportDataSnapshot {
  readonly parameters: Readonly<Record<string, WebReportParameterValue>>;
  readonly operation: (apiClientId: string, operationId: string) => unknown;
}
export interface ReportFrame {
  readonly type: 'frame';
  readonly width: number;
  readonly height: number;
  readonly appearance: WebReportRepeaterAppearance;
  readonly top: boolean;
  readonly bottom: boolean;
  readonly rowLine: boolean;
  readonly columns: number;
  readonly columnGap: number;
}
export interface ReportPlacement {
  readonly element: WebReportLeafElement | WebReportGroupElement | ReportFrame;
  readonly x: number;
  readonly y: number;
  readonly row: unknown;
}
export interface ReportBlock {
  readonly height: number;
  readonly elements: readonly ReportPlacement[];
}

/** Complete records remain indivisible, including their expanded nested groups. */
export function reportBandBlocks(
  band: WebReportBand,
  data: ReportDataSnapshot,
): readonly ReportBlock[] {
  let recordCount = 0;
  const expands = (element: WebReportElement): boolean =>
    element.type === 'repeater' || reportElementChildren(element).some(expands);
  const container = (
    elements: readonly WebReportElement[],
    height: number,
    row: unknown,
    depth: number,
  ): ReportBlock[] => {
    if (depth > 16) throw new RangeError('Report container nesting exceeds 16 levels.');
    const leaves = elements.filter((element) => !expands(element));
    const flowing = elements.filter(expands).sort((a, b) => a.y - b.y);
    const blocks: ReportBlock[] = [];
    let cursor = 0;
    const staticBlock = (end: number): void => {
      const items = leaves.filter(
        (element) => element.y >= cursor - 0.001 && element.y < end - 0.001,
      );
      if (items.some((element) => element.y + element.height > end + 0.001))
        throw new RangeError(
          'Report elements cannot cross the beginning or end of a repeater row.',
        );
      if (end > cursor)
        blocks.push({
          height: end - cursor,
          elements: items.flatMap((element): ReportPlacement[] => {
            if (element.type === 'repeater') return [];
            const origin = { element, x: element.x, y: element.y - cursor, row };
            if (element.type !== 'group') return [origin];
            return [
              origin,
              ...container(element.children, element.height, row, depth + 1).flatMap((block) =>
                block.elements.map((child) => ({
                  ...child,
                  x: child.x + origin.x,
                  y: child.y + origin.y,
                })),
              ),
            ];
          }),
        });
      cursor = end;
    };
    for (const element of flowing) {
      if (element.y < cursor - 0.001)
        throw new RangeError('Report expanded containers cannot overlap.');
      staticBlock(element.y);
      const templateHeight =
        element.type === 'repeater' ? reportRepeaterTemplateHeight(element) : element.height;
      if (
        leaves.some(
          (leaf) => leaf.y < element.y + templateHeight && leaf.y + leaf.height > element.y,
        )
      )
        throw new RangeError(
          'Place ordinary elements above or below the repeater. Put row elements inside it.',
        );
      if (element.type === 'group') {
        const content = container(element.children, element.height, row, depth + 1);
        let offset = 0;
        const placements: ReportPlacement[] = [];
        for (const block of content) {
          placements.push(
            ...block.elements.map((child) => ({
              ...child,
              x: child.x + element.x,
              y: child.y + offset,
            })),
          );
          offset += block.height;
        }
        blocks.push({
          height: offset,
          elements: [
            { element: { ...element, height: offset }, x: element.x, y: 0, row },
            ...placements,
          ],
        });
        cursor = element.y + templateHeight;
        continue;
      }
      if (element.type !== 'repeater') continue;
      const repeater = element;
      const values = resolveReportPointer(
        repeater.source.scope === 'row'
          ? row
          : data.operation(repeater.source.apiClientId, repeater.source.operationId),
        repeater.source.listPath,
      );
      if (!Array.isArray(values))
        throw new TypeError(
          `Repeater "${repeater.name}" must point to an array in its ${repeater.source.scope === 'row' ? 'parent record' : 'already loaded ApiClient response'}.`,
        );
      recordCount += values.length;
      if (recordCount > 100_000)
        throw new RangeError('A report band supports at most 100,000 expanded records.');
      const layout = reportRepeaterLayout(repeater);
      const appearance = reportRepeaterAppearance(repeater);
      const frame = (
        height: number,
        top: boolean,
        bottom: boolean,
        rowLine: boolean,
        columns = 1,
        columnGap = layout.columnGap,
      ): ReportPlacement => ({
        element: {
          type: 'frame',
          width: repeater.width,
          height,
          appearance,
          top,
          bottom,
          rowLine,
          columns,
          columnGap,
        },
        x: repeater.x,
        y: 0,
        row,
      });
      const appendSection = (
        section: WebReportRepeaterElement['header'],
        top: boolean,
        bottom: boolean,
      ): void => {
        if (section === undefined) return;
        const sectionLayout = reportRepeaterSectionLayout(section);
        const width =
          (repeater.width - (sectionLayout.columns - 1) * sectionLayout.columnGap) /
          sectionLayout.columns;
        const placements: ReportPlacement[] = [];
        let height = section.height;
        for (let column = 0; column < sectionLayout.columns; column++) {
          const content = container(
            section.elements.filter((element) => (element.column ?? 0) === column),
            section.height,
            row,
            depth + 1,
          );
          let offset = 0;
          for (const block of content) {
            placements.push(
              ...block.elements.map((item) => ({
                ...item,
                x: item.x + repeater.x + column * (width + sectionLayout.columnGap),
                y: item.y + offset,
              })),
            );
            offset += block.height;
          }
          height = Math.max(height, offset);
        }
        blocks.push({
          height,
          elements: [
            frame(height, top, bottom, !top, sectionLayout.columns, sectionLayout.columnGap),
            ...placements,
          ],
        });
      };
      appendSection(repeater.header, true, values.length === 0 && repeater.footer === undefined);
      const rowsPerBlock = layout.rows || Math.max(1, Math.ceil(values.length / layout.columns));
      const blockSize = rowsPerBlock * layout.columns;
      let renderedRow = 0;
      for (let start = 0; start < values.length; start += blockSize) {
        const count = Math.min(blockSize, values.length - start);
        const rowCount = Math.ceil(count / layout.columns);
        for (let r = 0; r < rowCount; r++) {
          let height = 0;
          const placements: ReportPlacement[] = [];
          for (let c = 0; c < layout.columns; c++) {
            const index =
              start + (layout.fill === 'columns' ? c * rowCount + r : r * layout.columns + c);
            if (index >= start + count) continue;
            const content = container(
              repeater.children,
              repeater.height,
              values[index] as unknown,
              depth + 1,
            );
            let offset = 0;
            for (const block of content) {
              placements.push(
                ...block.elements.map((item) => ({
                  ...item,
                  x:
                    repeater.x +
                    c * (reportRepeaterColumnWidth(repeater) + layout.columnGap) +
                    item.x,
                  y: item.y + offset,
                })),
              );
              offset += block.height;
            }
            height = Math.max(height, offset);
          }
          const last = start + count === values.length && r === rowCount - 1;
          blocks.push({
            height: height + (last ? 0 : repeater.gap),
            elements: [
              frame(
                height,
                renderedRow === 0 && repeater.header === undefined,
                last && repeater.footer === undefined,
                renderedRow > 0 || repeater.header !== undefined,
                layout.columns,
              ),
              ...placements,
            ],
          });
          renderedRow++;
        }
      }
      appendSection(repeater.footer, values.length === 0 && repeater.header === undefined, true);
      cursor = repeater.y + templateHeight;
    }
    staticBlock(height);
    return blocks;
  };
  return container(band.elements, band.height, undefined, 0);
}
