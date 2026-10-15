import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont } from 'pdf-lib';
import {
  reportPaperSize,
  resolveReportPointer,
  type WebReportBand,
  type WebReportLeafElement,
  type WebReportParameterValue,
  type WebReportTemplate,
  type WebReportValueSource,
} from './report-template.js';

const PT = 72 / 25.4;
export interface ReportDataSnapshot {
  readonly parameters: Readonly<Record<string, WebReportParameterValue>>;
  readonly operation: (apiClientId: string, operationId: string) => unknown;
}
interface Placement {
  readonly element: WebReportLeafElement;
  readonly x: number;
  readonly y: number;
  readonly row: unknown;
}
interface Block {
  readonly height: number;
  readonly elements: readonly Placement[];
}
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
function blocksFor(band: WebReportBand, data: ReportDataSnapshot): readonly Block[] {
  const leaves = band.elements.filter(
    (element): element is WebReportLeafElement => element.type !== 'repeater',
  );
  const repeaters = band.elements
    .filter((element) => element.type === 'repeater')
    .sort((left, right) => left.y - right.y);
  const blocks: Block[] = [];
  let cursor = 0;
  const staticBlock = (end: number): void => {
    const elements = leaves.filter(
      (element) => element.y >= cursor - 0.001 && element.y < end - 0.001,
    );
    if (elements.some((element) => element.y + element.height > end + 0.001))
      throw new RangeError('Report elements cannot cross the beginning or end of a repeater row.');
    if (end > cursor)
      blocks.push({
        height: end - cursor,
        elements: elements.map((element) => ({
          element,
          x: element.x,
          y: element.y - cursor,
          row: undefined,
        })),
      });
    cursor = end;
  };
  for (const repeater of repeaters) {
    if (repeater.y < cursor - 0.001) throw new RangeError('Report repeater rows cannot overlap.');
    staticBlock(repeater.y);
    if (
      leaves.some(
        (element) =>
          element.y < repeater.y + repeater.height && element.y + element.height > repeater.y,
      )
    )
      throw new RangeError(
        'Place ordinary elements above or below the repeater. Put row elements inside it.',
      );
    if (!repeater.source.apiClientId || !repeater.source.operationId)
      throw new Error(`Select an ApiClient and operation for repeater "${repeater.name}".`);
    const values = resolveReportPointer(
      data.operation(repeater.source.apiClientId, repeater.source.operationId),
      repeater.source.listPath,
    );
    if (!Array.isArray(values))
      throw new TypeError(
        `Repeater "${repeater.name}" must point to an array in an already loaded ApiClient response.`,
      );
    if (values.length > 100_000)
      throw new RangeError('A report supports at most 100,000 records per repeater.');
    for (let index = 0; index < values.length; index++)
      blocks.push({
        height: repeater.height + (index + 1 < values.length ? repeater.gap : 0),
        elements: repeater.children.map((element) => ({
          element,
          x: repeater.x + element.x,
          y: element.y,
          row: values[index] as unknown,
        })),
      });
    cursor = repeater.y + repeater.height;
  }
  staticBlock(band.height);
  return blocks;
}
function parseColor(value: string): ReturnType<typeof rgb> {
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
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
    for (const block of blocksFor(band, data)) {
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
    const fixed = (band: WebReportBand | undefined, y: number): readonly Placement[] =>
      band?.elements.flatMap((element) =>
        element.type === 'repeater'
          ? []
          : [{ element, x: margins.left + element.x, y: y + element.y, row: undefined }],
      ) ?? [];
    const all = [
      ...fixed(header, margins.top),
      ...placements,
      ...fixed(footer, paper.height - margins.bottom - (footer?.height ?? 0)),
    ];
    for (const { element, x, y, row } of all) {
      checkAbort(signal);
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
