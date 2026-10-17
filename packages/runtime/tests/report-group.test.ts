import { expect, it } from 'vitest';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { parseReportTemplate, serializeReportTemplate } from '../src/report-template.js';
import { generateReportPdf } from '../src/report-pdf.js';
import { reportBandBlocks } from '../src/report-pdf-layout.js';
import { reportGroupTemplate } from '../../../tests/fixtures/report-builder-group.js';
import { nestedReportData } from '../../../tests/fixtures/report-builder-nested.js';

it('round-trips Group containers and validates local geometry, nesting, columns and appearance', () => {
  const template = reportGroupTemplate();
  expect(parseReportTemplate(serializeReportTemplate(template))).toEqual(template);
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'group') throw new Error('Missing Group.');
  for (const changed of [
    { ...group, children: [{ ...group.children[0], x: 1 }] },
    { ...group, appearance: { ...group.appearance, borderRadius: -1 } },
    { ...group, appearance: { ...group.appearance, backgroundColor: 'url(bad)' } },
    { ...group, appearance: { ...group.appearance, borderWidth: 11 } },
    { ...group, appearance: { ...group.appearance, borderStyle: 'invalid' } },
    { ...group, column: 0 },
  ])
    expect(() =>
      parseReportTemplate({ ...template, bands: [{ ...template.bands[0], elements: [changed] }] }),
    ).toThrow();
  expect(() =>
    parseReportTemplate({ ...template, bands: [{ ...template.bands[0], kind: 'pageHeader' }] }),
  ).toThrow('cannot contain repeaters');
});

it('expands nested repeaters within a Group, inherits record fields and places the frame behind children', () => {
  const template = reportGroupTemplate();
  const blocks = reportBandBlocks(template.bands[0]!, {
    parameters: {},
    operation: () => nestedReportData,
  });
  const all = blocks.flatMap((block) => block.elements);
  expect(all[0]!.element).toMatchObject({ type: 'group', id: 'report-group', height: 174 });
  const cards = all.filter(
    (item) => item.element.type === 'group' && item.element.id === 'record-card',
  );
  expect(cards).toHaveLength(8);
  expect(cards[0]!.element.height).toBe(34);
  expect(cards[0]!.row).toBe(nestedReportData.customers[0]);
  const products = all.filter(
    (item) => item.element.type === 'text' && item.element.id === 'order-product',
  );
  expect(products).toHaveLength(16);
  expect(products[0]).toMatchObject({ x: 0, y: 30, row: { product: 'Product 1A' } });
});

it('renders static Groups side by side and in fixed page bands with rounded borders, fills and children', async () => {
  const original = reportGroupTemplate();
  const source = original.bands[0]!.elements[0]!;
  if (source.type !== 'group') throw new Error('Missing Group.');
  const leaf = {
    id: 'inside',
    name: 'Inside',
    type: 'text' as const,
    x: 2,
    y: 2,
    width: 50,
    height: 8,
    fontSize: 10,
    bold: false,
    color: '#000000',
    align: 'left' as const,
    value: { kind: 'static' as const, value: 'Inside Group' },
  };
  const group = {
    ...source,
    width: 80,
    height: 20,
    appearance: { ...source.appearance!, borderStyle: 'dashed' as const },
    children: [leaf],
  };
  const template = parseReportTemplate({
    ...original,
    bands: [
      {
        id: 'detail',
        kind: 'detail',
        height: 20,
        elements: [
          group,
          { ...group, id: 'second', x: 90, children: [{ ...leaf, id: 'second-text' }] },
        ],
      },
      {
        id: 'page-header',
        kind: 'pageHeader',
        height: 20,
        elements: [
          {
            ...group,
            id: 'fixed-group',
            children: [
              { ...leaf, id: 'fixed-text', value: { kind: 'static', value: 'Fixed Group' } },
            ],
          },
        ],
      },
    ],
  });
  const pdf = await generateReportPdf(template, { parameters: {}, operation: () => undefined });
  const document = await PDFDocument.load(new Uint8Array(await pdf.blob.arrayBuffer()));
  expect(document.getPageCount()).toBe(1);
  const contents = document.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [new TextDecoder().decode(decodePDFRawStream(object).decode())]
        : [],
    )
    .join('\n');
  expect(contents).toContain(' c\n');
  expect(contents).toContain(' rg');
  expect(contents).toContain(' d');
  expect(contents).toContain(Buffer.from('Fixed Group').toString('hex').toUpperCase());
  expect(contents.split(Buffer.from('Inside Group').toString('hex').toUpperCase())).toHaveLength(3);
});
