import { expect, it } from 'vitest';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { parseReportTemplate, serializeReportTemplate } from '../src/report-template.js';
import { generateReportPdf } from '../src/report-pdf.js';
import { reportBandBlocks } from '../src/report-pdf-layout.js';
import {
  nestedReportData,
  nestedReportTemplate,
  reportSectionColumnsTemplate,
} from '../../../tests/fixtures/report-builder-nested.js';

it('persists distinct Header/Footer columns and places each field once at its own column origin', () => {
  const template = reportSectionColumnsTemplate();
  expect(parseReportTemplate(serializeReportTemplate(template))).toEqual(template);
  const placements = reportBandBlocks(template.bands[0]!, {
    parameters: {},
    operation: () => nestedReportData,
  }).flatMap((block) => block.elements);
  const x = (id: string): number[] =>
    placements
      .filter((item) => item.element.type !== 'frame' && item.element.id === id)
      .map((item) => item.x);
  expect(x('group-header')).toEqual([0]);
  expect(x('header-right')).toEqual([92]);
  expect(x('group-footer')).toEqual([0]);
  expect(x('footer-middle')).toEqual([61]);
  expect(x('footer-right')).toEqual([122]);
  const frames = placements
    .filter((item) => item.element.type === 'frame')
    .map((item) => item.element);
  expect(frames).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ columns: 2, columnGap: 4, height: 8 }),
      expect.objectContaining({ columns: 3, columnGap: 3, height: 8 }),
    ]),
  );
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing group.');
  for (const header of [
    { ...group.header, columns: 1.5 },
    { ...group.header, columnGap: 180 },
    { ...group.header, elements: [{ ...group.header!.elements[0], column: 2 }] },
    { ...group.header, elements: [{ ...group.header!.elements[0], width: 89 }] },
  ])
    expect(() =>
      parseReportTemplate({
        ...template,
        bands: [{ ...template.bands[0], elements: [{ ...group, header }] }],
      }),
    ).toThrow();
});

it('round-trips nested report sections, sources, geometry and appearance without altering legacy defaults', () => {
  const template = nestedReportTemplate();
  expect(parseReportTemplate(serializeReportTemplate(template))).toEqual(template);
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing group.');
  for (const changed of [
    { ...group, layout: { ...group.layout, columns: 1.5 } },
    { ...group, layout: { ...group.layout, columnGap: 200 } },
    { ...group, appearance: { ...group.appearance, backgroundColor: 'url(x)' } },
    { ...group, header: { height: 100, elements: [] } },
    { ...group, source: { ...group.source, scope: 'row' } },
    { ...group, footer: { height: 8, elements: [{ ...group.header!.elements[0] }] } },
  ])
    expect(() =>
      parseReportTemplate({ ...template, bands: [{ ...template.bands[0], elements: [changed] }] }),
    ).toThrow();
});

it('lays out columns and expands parent-relative lists with independent header/record/footer contexts', () => {
  const template = nestedReportTemplate();
  const blocks = reportBandBlocks(template.bands[0]!, {
    parameters: {},
    operation: () => nestedReportData,
  });
  const all = blocks.flatMap((block) => block.elements);
  const customers = all.filter(
    (item) => item.element.type === 'text' && item.element.id === 'customer-name',
  );
  expect(customers.map((item) => item.x)).toEqual([0, 92, 0, 92, 0, 92, 0, 92]);
  expect(customers.map((item) => (item.row as { name: string }).name)).toEqual(
    nestedReportData.customers.map((row) => row.name),
  );
  const products = all.filter(
    (item) => item.element.type === 'text' && item.element.id === 'order-product',
  );
  expect(products).toHaveLength(16);
  expect((products[0]!.row as { product: string }).product).toBe('Product 1A');
  expect(
    (
      all.find((item) => item.element.type === 'text' && item.element.id === 'order-header')!
        .row as { name: string }
    ).name,
  ).toBe('Customer 1');
  expect(
    all.filter((item) => item.element.type === 'text' && item.element.id === 'group-header'),
  ).toHaveLength(1);
  expect(
    all.filter((item) => item.element.type === 'text' && item.element.id === 'group-footer'),
  ).toHaveLength(1);
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing group.');
  const down = reportBandBlocks(
    {
      ...template.bands[0]!,
      elements: [{ ...group, layout: { ...group.layout!, fill: 'columns' } }],
    },
    { parameters: {}, operation: () => nestedReportData },
  );
  expect(
    down
      .flatMap((block) => block.elements)
      .filter((item) => item.element.type === 'text' && item.element.id === 'customer-name')
      .map((item) => (item.row as { name: string }).name),
  ).toEqual([1, 3, 2, 4, 5, 7, 6, 8].map((index) => `Customer ${index}`));
});

it('prints every nested record and its sections into paginated PDFs with actual fill, borders and dividers', async () => {
  const data = {
    customers: Array.from({ length: 40 }, (_, index) => ({
      name: `Customer ${index + 1}`,
      orders: [{ product: `Product ${index + 1}` }],
    })),
  };
  const pdf = await generateReportPdf(parseReportTemplate(nestedReportTemplate()), {
    parameters: {},
    operation: () => data,
  });
  expect(pdf.pageCount).toBeGreaterThan(1);
  const document = await PDFDocument.load(new Uint8Array(await pdf.blob.arrayBuffer()));
  const contents = document.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [new TextDecoder().decode(decodePDFRawStream(object).decode())]
        : [],
    )
    .join('\n');
  const encoded = (value: string): string =>
    `<${Array.from(value)
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}>`;
  for (const row of data.customers)
    expect(contents.split(encoded(row.orders[0]!.product))).toHaveLength(2);
  expect(contents.split(encoded('Customer header'))).toHaveLength(2);
  expect(contents.split(encoded('Customer footer'))).toHaveLength(2);
  expect(contents).toContain(' rg');
  expect(contents).toContain(' d');
  expect(contents).toContain(' l');
  expect(contents).toContain('f\n');
});
