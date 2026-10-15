import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont } from 'pdf-lib';
import {
  reportPaperSize,
  reportGroupAppearance,
  resolveReportPointer,
  type WebReportBand,
  type WebReportTemplate,
  type WebReportValueSource,
} from './report-template.js';
import {
  reportBandBlocks,
  type ReportDataSnapshot,
  type ReportPlacement as Placement,
} from './report-pdf-layout.js';
export type { ReportDataSnapshot } from './report-pdf-layout.js';

const PT = 72 / 25.4;
export interface ReportPdfOutput {
  readonly blob: Blob;
  readonly pageCount: number;
}

function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
function valueOf(
  source: WebReportValueSource,
  data: ReportDataSnapshot,
  row: unknown,
  pageNumber: number,
  pageCount: number,
): unknown {
  switch (source.kind) {
    case 'static':
      return source.value;
    case 'parameter':
      return data.parameters[source.name];
    case 'field':
      return resolveReportPointer(
        data.operation(source.apiClientId, source.operationId),
        source.path,
      );
    case 'row':
      return resolveReportPointer(row, source.path);
    case 'system':
      return source.value === 'pageNumber' ? pageNumber : pageCount;
  }
}
function display(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  throw new TypeError(
    'Report fields must resolve to text, a number or a boolean. Select a concrete field.',
  );
}
function parseColor(value: string): ReturnType<typeof rgb> {
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
}
function roundedRectanglePath(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  const k = r * 0.5522847498307936;
  return `M ${r} 0 L ${width - r} 0 C ${width - r + k} 0 ${width} ${r - k} ${width} ${r}
    L ${width} ${height - r} C ${width} ${height - r + k} ${width - r + k} ${height} ${width - r} ${height}
    L ${r} ${height} C ${r - k} ${height} 0 ${height - r + k} 0 ${height - r}
    L 0 ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`;
}
function linesFor(value: string, font: PDFFont, size: number, width: number): readonly string[] {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n?/gu, '\n').split('\n')) {
    let current = '';
    for (const token of paragraph.split(/(\s+)/u)) {
      if (!token) continue;
      if (font.widthOfTextAtSize(current + token, size) <= width) {
        current += token;
        continue;
      }
      if (current.trim()) {
        lines.push(current.trimEnd());
        current = '';
      }
      for (const character of token.trimStart()) {
        if (font.widthOfTextAtSize(character, size) > width)
          throw new RangeError('Text element is narrower than a single character.');
        if (font.widthOfTextAtSize(current + character, size) > width) {
          lines.push(current);
          current = '';
        }
        current += character;
      }
    }
    lines.push(current.trimEnd());
  }
  return lines;
}
async function imageFor(
  document: PDFDocument,
  value: string,
  signal?: AbortSignal,
): Promise<PDFImage> {
  const url = new URL(value, globalThis.location?.href ?? 'https://localhost/');
  if (!['https:', 'http:', 'data:', 'blob:'].includes(url.protocol))
    throw new TypeError('Report images must use HTTP, HTTPS, data or blob URLs.');
  const response = await fetch(url.href, signal ? { signal } : {});
  if (!response.ok) throw new Error(`Could not load report image (${String(response.status)}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024)
    throw new RangeError('Report images must be smaller than 20 MiB.');
  checkAbort(signal);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return document.embedPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return document.embedJpg(bytes);
  throw new TypeError('Report images must be PNG or JPEG.');
}

/** Produces a real paginated PDF without DOM, presentation or API execution. */
export async function generateReportPdf(
  template: WebReportTemplate,
  data: ReportDataSnapshot,
  signal?: AbortSignal,
): Promise<ReportPdfOutput> {
  checkAbort(signal);
  const paper = reportPaperSize(template);
  const margins = template.paper.margins;
  const header = template.bands.find((band) => band.kind === 'pageHeader');
  const footer = template.bands.find((band) => band.kind === 'pageFooter');
  const bodyTop = margins.top + (header?.height ?? 0);
  const bodyBottom = paper.height - margins.bottom - (footer?.height ?? 0);
  const bodyHeight = bodyBottom - bodyTop;
  const pages: Placement[][] = [[]];
  let cursor = bodyTop;
  for (const kind of ['title', 'detail', 'summary'] as const) {
    const band = template.bands.find((candidate) => candidate.kind === kind);
    if (!band) continue;
    for (const block of reportBandBlocks(band, data)) {
      checkAbort(signal);
      if (block.height > bodyHeight + 0.001)
        throw new RangeError(
          `The ${kind} band or repeater row is taller than the printable content area. Reduce its height.`,
        );
      if (cursor + block.height > bodyBottom + 0.001) {
        pages.push([]);
        cursor = bodyTop;
      }
      if (pages.length > 10_000) throw new RangeError('A report supports at most 10,000 pages.');
      const current = pages[pages.length - 1]!;
      for (const placement of block.elements)
        current.push({ ...placement, x: margins.left + placement.x, y: cursor + placement.y });
      cursor += block.height;
    }
  }
  const document = await PDFDocument.create();
  document.setTitle(template.name);
  document.setProducer('WebRad ReportBuilder');
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const images = new Map<string, Promise<PDFImage>>();
  for (const [pageIndex, placements] of pages.entries()) {
    checkAbort(signal);
    const page = document.addPage([paper.width * PT, paper.height * PT]);
    const fixed = (band: WebReportBand | undefined, y: number): readonly Placement[] => {
      let offset = y;
      return band === undefined
        ? []
        : reportBandBlocks(band, data).flatMap((block) => {
            const placements = block.elements.map((item) => ({
              ...item,
              x: margins.left + item.x,
              y: offset + item.y,
            }));
            offset += block.height;
            return placements;
          });
    };
    const all = [
      ...fixed(header, margins.top),
      ...placements,
      ...fixed(footer, paper.height - margins.bottom - (footer?.height ?? 0)),
    ];
    for (const { element, x, y, row } of all) {
      checkAbort(signal);
      if (element.type === 'group') {
        const paint = reportGroupAppearance(element);
        if (paint.backgroundColor === null && paint.borderWidth === 0) continue;
        const stroke = Math.min(paint.borderWidth, element.width, element.height);
        const inset = stroke / 2;
        page.drawSvgPath(
          roundedRectanglePath(
            (element.width - stroke) * PT,
            (element.height - stroke) * PT,
            Math.max(0, paint.borderRadius - inset) * PT,
          ),
          {
            x: (x + inset) * PT,
            y: (paper.height - y - inset) * PT,
            ...(paint.backgroundColor === null ? {} : { color: parseColor(paint.backgroundColor) }),
            borderColor: parseColor(paint.borderColor),
            borderWidth: stroke * PT,
            ...(paint.borderStyle === 'dashed' ? { borderDashArray: [2 * PT, PT] } : {}),
          },
        );
        continue;
      }
      if (element.type === 'frame') {
        const paint = element.appearance;
        if (paint.backgroundColor !== null)
          page.drawRectangle({
            x: x * PT,
            y: (paper.height - y - element.height) * PT,
            width: element.width * PT,
            height: element.height * PT,
            color: parseColor(paint.backgroundColor),
          });
        const line = (
          x1: number,
          y1: number,
          x2: number,
          y2: number,
          width: number,
          color: string,
          dashed = false,
        ): void => {
          if (width === 0) return;
          page.drawLine({
            start: { x: x1 * PT, y: (paper.height - y1) * PT },
            end: { x: x2 * PT, y: (paper.height - y2) * PT },
            thickness: width * PT,
            color: parseColor(color),
            ...(dashed ? { dashArray: [2 * PT, PT] } : {}),
          });
        };
        const border = (x1: number, y1: number, x2: number, y2: number): void =>
          line(
            x1,
            y1,
            x2,
            y2,
            paint.borderWidth,
            paint.borderColor,
            paint.borderStyle === 'dashed',
          );
        const inset = paint.borderWidth / 2;
        if (element.top) border(x, y + inset, x + element.width, y + inset);
        else if (element.rowLine && paint.rowLines)
          line(x, y, x + element.width, y, paint.lineWidth, paint.lineColor);
        if (element.bottom)
          border(x, y + element.height - inset, x + element.width, y + element.height - inset);
        border(x + inset, y, x + inset, y + element.height);
        border(x + element.width - inset, y, x + element.width - inset, y + element.height);
        if (paint.columnLines)
          for (let column = 1; column < element.columns; column++) {
            const columnWidth =
              (element.width - (element.columns - 1) * element.columnGap) / element.columns;
            const left = x + column * columnWidth + (column - 0.5) * element.columnGap;
            line(left, y, left, y + element.height, paint.lineWidth, paint.lineColor);
          }
        continue;
      }
      if (element.type === 'line') {
        const baseline = (paper.height - y - element.height / 2) * PT;
        page.drawLine({
          start: { x: x * PT, y: baseline },
          end: { x: (x + element.width) * PT, y: baseline },
          color: parseColor(element.color),
          thickness: element.strokeWidth,
        });
        continue;
      }
      const value = display(valueOf(element.value, data, row, pageIndex + 1, pages.length));
      if (element.type === 'text') {
        if (!value) continue;
        const font = element.bold ? bold : regular;
        let lines: readonly string[];
        try {
          lines = linesFor(value, font, element.fontSize, element.width * PT);
        } catch (cause) {
          throw new Error(
            `Cannot render text "${element.name}". The PDF font supports Western European text; check the field width and characters.`,
            { cause },
          );
        }
        const lineHeight = element.fontSize * 1.2;
        if (lines.length * lineHeight > element.height * PT + 0.01)
          throw new RangeError(
            `Text "${element.name}" does not fit its height. Increase the element height or reduce its font size.`,
          );
        for (const [lineIndex, line] of lines.entries()) {
          const lineWidth = font.widthOfTextAtSize(line, element.fontSize);
          const offset =
            element.align === 'center'
              ? (element.width * PT - lineWidth) / 2
              : element.align === 'right'
                ? element.width * PT - lineWidth
                : 0;
          page.drawText(line, {
            x: x * PT + offset,
            y: (paper.height - y) * PT - element.fontSize - lineIndex * lineHeight,
            font,
            size: element.fontSize,
            color: parseColor(element.color),
          });
        }
      } else if (value) {
        let pending = images.get(value);
        if (!pending) {
          pending = imageFor(document, value, signal);
          images.set(value, pending);
        }
        const image = await pending;
        const size = image.scaleToFit(element.width * PT, element.height * PT);
        page.drawImage(image, {
          x: x * PT + (element.width * PT - size.width) / 2,
          y: (paper.height - y - element.height) * PT + (element.height * PT - size.height) / 2,
          width: size.width,
          height: size.height,
        });
      }
    }
  }
  checkAbort(signal);
  const bytes = await document.save();
  checkAbort(signal);
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
    pageCount: pages.length,
  };
}
