// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { WebApiClient, type WebApiClientConfiguration } from '../src/api-client.js';
import { WebReportBuilder } from '../src/report-builder.js';
import {
  nestedReportData,
  nestedReportTemplate,
} from '../../../tests/fixtures/report-builder-nested.js';
import {
  createDefaultReportTemplate,
  parseReportTemplate,
  serializeReportTemplate,
  type WebReportTemplate,
  type WebReportTextElement,
} from '../src/report-template.js';

const clients: { dispose(): void }[] = [];
const apiConfiguration: WebApiClientConfiguration = {
  schemaVersion: 1,
  defaultHeaders: [],
  timeoutMs: 30_000,
  operations: [
    {
      id: 'load-id',
      name: 'Load',
      method: 'GET',
      path: '/items',
      headers: [],
      query: [],
      body: { kind: 'none', content: '' },
      credentials: 'omit',
      timeoutMs: null,
      responseSchema: null,
    },
  ],
};
function text(id: string, value: WebReportTextElement['value'], x = 0): WebReportTextElement {
  return {
    id,
    name: id,
    type: 'text',
    x,
    y: 0,
    width: 80,
    height: 8,
    fontSize: 10,
    bold: false,
    color: '#000000',
    align: 'left',
    value,
  };
}
function template(): WebReportTemplate {
  return {
    ...createDefaultReportTemplate(),
    name: 'Customers',
    parameters: [{ name: 'Heading', type: 'string', defaultValue: 'Default heading' }],
    bands: [
      {
        id: 'header',
        kind: 'pageHeader',
        height: 10,
        elements: [text('heading', { kind: 'parameter', name: 'Heading' })],
      },
      {
        id: 'footer',
        kind: 'pageFooter',
        height: 10,
        elements: [
          text('page', { kind: 'system', value: 'pageNumber' }),
          text('total', { kind: 'system', value: 'pageCount' }, 90),
        ],
      },
      {
        id: 'detail',
        kind: 'detail',
        height: 20,
        elements: [
          {
            id: 'rows',
            name: 'Rows',
            type: 'repeater',
            x: 0,
            y: 0,
            width: 180,
            height: 20,
            source: { apiClientId: 'client-id', operationId: 'load-id', listPath: '/items' },
            gap: 0,
            children: [text('row-name', { kind: 'row', path: '/name' })],
          },
        ],
      },
    ],
  };
}
function builder(document: WebReportTemplate = createDefaultReportTemplate()): WebReportBuilder {
  const report = new WebReportBuilder({ id: 'report', reportTemplate: document });
  clients.push(report);
  return report;
}
async function pdfText(
  blob: Blob,
): Promise<{ readonly document: PDFDocument; readonly text: string }> {
  const document = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
  const text = document.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFRawStream
        ? [new TextDecoder().decode(decodePDFRawStream(object).decode())]
        : [],
    )
    .join('\n');
  return { document, text };
}
function encoded(value: string): string {
  return `<${Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}>`;
}

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:report-${String(Math.random())}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  for (const report of clients.splice(0)) report.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Report templates and typed parameters', () => {
  it('retains typed authored parameter access and validates dynamic names after external template replacement', async () => {
    const report = new WebReportBuilder<{ Title: string }>({
      reportTemplate: {
        ...createDefaultReportTemplate(),
        parameters: [{ name: 'Title', type: 'string', defaultValue: 'Authored' }],
      },
    });
    clients.push(report);
    report.Parameters.Set('Title', 'Typed title');
    expect(report.Parameters.Get('Title')).toBe('Typed title');
    await report.LoadTemplate({
      ...createDefaultReportTemplate(),
      parameters: [{ name: 'Other', type: 'number', defaultValue: 0 }],
    });
    report.Parameters.SetValue('Other', 42);
    expect(report.Parameters.GetValue('Other')).toBe(42);
    expect(() => report.Parameters.SetValue('Other', 'wrong type')).toThrow('must be number');
    expect(() => report.Parameters.SetValue('Unknown', 42)).toThrow('Unknown report parameter');
    expect(() => report.Parameters.GetValue('Unknown')).toThrow('Unknown report parameter');
    report.Parameters.Clear();
    expect(report.Parameters.GetValue('Other')).toBe(0);
  });
  it('roundtrips versioned JSON and validates geometry, bindings and nested repeaters', () => {
    expect(parseReportTemplate(serializeReportTemplate(template()))).toEqual(template());
    expect(() => parseReportTemplate({ ...template(), schemaVersion: 2 })).toThrow('version 1');
    expect(() =>
      parseReportTemplate({
        ...template(),
        parameters: [{ name: 'Heading', type: 'date', defaultValue: '2026-02-31' }],
      }),
    ).toThrow('must be date');
    expect(() =>
      parseReportTemplate({
        ...template(),
        bands: [
          {
            id: 'detail',
            kind: 'detail',
            height: 10,
            elements: [text('outside', { kind: 'row', path: '/name' })],
          },
        ],
      }),
    ).toThrow('require a repeater');
    expect(() =>
      parseReportTemplate({
        ...template(),
        bands: [
          {
            id: 'detail',
            kind: 'detail',
            height: 10,
            elements: [{ ...text('outside', { kind: 'static', value: 'x' }), width: 190 }],
          },
        ],
      }),
    ).toThrow('geometry exceeds');
    const row = template().bands.find((band) => band.kind === 'detail')!.elements[0]!;
    expect(() =>
      parseReportTemplate({
        ...template(),
        bands: [
          {
            id: 'detail',
            kind: 'detail',
            height: 20,
            elements: [{ ...row, children: [{ ...row, id: 'nested' }] }],
          },
        ],
      }),
    ).not.toThrow();
  });
  it('loads objects, JSON, files and external URLs atomically while retaining compatible overrides', async () => {
    const report = builder(template());
    report.Parameters.Set('Heading', 'Code title');
    expect(report.Parameters.Get('Heading')).toBe('Code title');
    expect(() => report.Parameters.Set('Heading', 42)).toThrow('must be string');
    await report.LoadTemplate(
      new Blob([serializeReportTemplate({ ...template(), name: 'File model' })], {
        type: 'application/json',
      }),
    );
    expect(report.template.name).toBe('File model');
    expect(report.Parameters.values.Heading).toBe('Code title');
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(serializeReportTemplate({ ...template(), name: 'External model' })),
    );
    vi.stubGlobal('fetch', fetch);
    await report.LoadTemplate('https://example.test/model.json');
    expect(report.template.name).toBe('External model');
    await expect(report.LoadTemplate('{"schemaVersion":2}')).rejects.toThrow('version 1');
    expect(report.template.name).toBe('External model');
    expect(report.Parameters.Get('Heading')).toBe('Code title');
    await report.LoadTemplate({
      ...template(),
      parameters: [{ name: 'Heading', type: 'number', defaultValue: 12 }],
    });
    expect(report.Parameters.Get('Heading')).toBe(12);
    report.Parameters.Set('Heading', 99);
    report.Parameters.Clear();
    expect(report.Parameters.Get('Heading')).toBe(12);
    expect(JSON.parse(report.SaveTemplate()) as unknown).toEqual(report.template);
  });
  it('uses the latest requested external template and rejects unsafe protocols', async () => {
    const report = builder();
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const pending = report.LoadTemplate('https://example.test/slow.json');
    await report.LoadTemplate({ ...createDefaultReportTemplate(), name: 'Latest model' });
    finish!(
      new Response(
        serializeReportTemplate({ ...createDefaultReportTemplate(), name: 'Old model' }),
      ),
    );
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(report.template.name).toBe('Latest model');
    await expect(report.LoadTemplate('javascript:alert(1)')).rejects.toThrow('HTTP');
  });
});

describe('Report PDF generation', () => {
  it('snapshots additional API fields in deeply nested Footer sections without starting requests', async () => {
    const primaryFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify(nestedReportData), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const secondaryFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ stamp: 'Footer source' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const primary = new WebApiClient({
      baseUrl: 'https://example.test',
      apiClientConfig: {
        ...apiConfiguration,
        operations: apiConfiguration.operations.map((operation) => ({
          ...operation,
          id: 'load-customers',
        })),
      },
      fetch: primaryFetch,
    });
    const secondary = new WebApiClient({
      baseUrl: 'https://example.test',
      apiClientConfig: apiConfiguration,
      fetch: secondaryFetch,
    });
    clients.push(primary, secondary);
    await primary.execute('Load');
    await secondary.execute('Load');
    const original = nestedReportTemplate();
    const report = builder({
      ...original,
      bands: original.bands.map((band) => ({
        ...band,
        elements: band.elements.map((group) =>
          group.type !== 'repeater'
            ? group
            : {
                ...group,
                children: group.children.map((child) =>
                  child.type !== 'repeater'
                    ? child
                    : {
                        ...child,
                        footer: {
                          ...child.footer!,
                          elements: [
                            {
                              ...(child.footer!.elements[0] as WebReportTextElement),
                              value: {
                                kind: 'field',
                                apiClientId: 'secondary',
                                operationId: 'Load',
                                path: '/stamp',
                              },
                            },
                          ],
                        },
                      },
                ),
              },
        ),
      })),
    });
    report.bindApiClient('customers-api', primary);
    report.bindApiClient('secondary', secondary);
    const pdf = await pdfText((await report.GeneratePDF()).blob);
    expect(pdf.text.split(encoded('Footer source'))).toHaveLength(9);
    expect(primaryFetch).toHaveBeenCalledOnce();
    expect(secondaryFetch).toHaveBeenCalledOnce();
  });
  it('resolves client and operation names and embeds a field-bound PNG into the PDF', async () => {
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    const apiFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({ account: { name: 'Ana', logo: 'https://example.test/logo.png' } }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const api = new WebApiClient({
      baseUrl: 'https://example.test',
      apiClientConfig: apiConfiguration,
      fetch: apiFetch,
    });
    await api.execute('Load');
    const imageFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(Uint8Array.from(atob(png), (character) => character.charCodeAt(0))),
    );
    vi.stubGlobal('fetch', imageFetch);
    const report = builder({
      ...createDefaultReportTemplate(),
      bands: [
        {
          id: 'detail',
          kind: 'detail',
          height: 20,
          elements: [
            text('account', {
              kind: 'field',
              apiClientId: 'Clients',
              operationId: 'Load',
              path: '/account/name',
            }),
            {
              id: 'logo',
              name: 'Logo',
              type: 'image',
              x: 90,
              y: 0,
              width: 20,
              height: 20,
              fit: 'contain',
              value: {
                kind: 'field',
                apiClientId: 'Clients',
                operationId: 'Load',
                path: '/account/logo',
              },
            },
          ],
        },
      ],
    });
    report.bindApiClient('Clients', api);
    const pdf = await pdfText((await report.GeneratePDF()).blob);
    expect(pdf.text).toContain(encoded('Ana'));
    expect(
      pdf.document.context
        .enumerateIndirectObjects()
        .some(
          ([, object]) =>
            object instanceof PDFRawStream &&
            object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image',
        ),
    ).toBe(true);
    expect(apiFetch).toHaveBeenCalledOnce();
    expect(imageFetch).toHaveBeenCalledOnce();
    api.dispose();
  });
  it('uses loaded responses without executing, repeats complete records, headers and page numbers in real PDF pages', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      name: `Customer${String(index).padStart(2, '0')}`,
    }));
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ items: rows }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const api = new WebApiClient({
      id: 'client-id',
      name: 'Clients',
      baseUrl: 'https://example.test',
      apiClientConfig: apiConfiguration,
      fetch,
    });
    await api.execute('Load');
    const report = builder(template());
    report.bindApiClient('client-id', api);
    report.Parameters.Set('Heading', 'Customer report');
    const success = vi.fn();
    report.OnSuccess = success;
    const result = await report.GeneratePDF({ fileName: 'Customers' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.pageCount).toBe(3);
    expect(result.fileName).toBe('Customers.pdf');
    const pdf = await pdfText(result.blob);
    expect(pdf.document.getPageCount()).toBe(3);
    for (const row of rows) expect(pdf.text.split(encoded(row.name))).toHaveLength(2);
    expect(pdf.text.split(encoded('Customer report'))).toHaveLength(4);
    expect(pdf.text).toContain(encoded('3'));
    expect(success).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    api.dispose();
  });
  it('reports unloaded data, oversized rows and text overflow instead of dropping content', async () => {
    const report = builder(template());
    const onError = vi.fn();
    report.OnError = onError;
    await expect(report.GeneratePDF()).rejects.toThrow('no successfully loaded response');
    expect(onError).toHaveBeenCalledOnce();
    expect(report.busy).toBe(false);
    const tall = builder({
      ...createDefaultReportTemplate(),
      bands: [
        { id: 'header', kind: 'pageHeader', height: 100, elements: [] },
        { id: 'detail', kind: 'detail', height: 200, elements: [] },
      ],
    });
    await expect(tall.GeneratePDF()).rejects.toThrow('taller than');
    const overflow = builder({
      ...createDefaultReportTemplate(),
      bands: [
        {
          id: 'detail',
          kind: 'detail',
          height: 10,
          elements: [
            {
              ...text('Overflow', {
                kind: 'static',
                value: 'Line one\nLine two\nLine three\nLine four',
              }),
              height: 8,
            },
          ],
        },
      ],
    });
    await expect(overflow.GeneratePDF()).rejects.toThrow('does not fit');
  });
  it('validates per-generation parameters without mutating persistent overrides and respects cancellation', async () => {
    const report = builder({
      ...createDefaultReportTemplate(),
      parameters: [{ name: 'Heading', type: 'string', defaultValue: 'Original' }],
      bands: [
        {
          id: 'detail',
          kind: 'detail',
          height: 10,
          elements: [text('heading', { kind: 'parameter', name: 'Heading' })],
        },
      ],
    });
    const result = await report.GeneratePDF({ parameters: { Heading: 'One generation' } });
    expect((await pdfText(result.blob)).text).toContain(encoded('One generation'));
    expect(report.Parameters.Get('Heading')).toBe('Original');
    const controller = new AbortController();
    controller.abort();
    await expect(report.GeneratePDF({ signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    report.OnGenerate = (_sender, event) => event.preventDefault();
    await expect(report.GeneratePDF()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Report destinations and cleanup', () => {
  it('renders horizontal rules through the element midpoint at every configured height', async () => {
    for (const height of [1, 20]) {
      const report = builder({
        ...createDefaultReportTemplate(),
        bands: [
          {
            id: 'rule-band',
            kind: 'detail',
            height: 40,
            elements: [
              {
                id: 'rule',
                name: 'Rule',
                type: 'line',
                x: 10,
                y: 5,
                width: 60,
                height,
                color: '#000000',
                strokeWidth: 1,
              },
            ],
          },
        ],
      });
      const output = await report.GeneratePDF();
      const stream = (await pdfText(output.blob)).text;
      const line = /([-\d.]+) ([-\d.]+) m\s+([-\d.]+) ([-\d.]+) l/u.exec(stream);
      expect(line, stream).not.toBeNull();
      expect(Number(line![1])).toBeLessThan(Number(line![3]));
      expect(Number(line![2])).toBeCloseTo(Number(line![4]), 8);
      expect(Number(line![2])).toBeCloseTo(((297 - 15 - 5 - height / 2) * 72) / 25.4, 6);
    }
  });
  it('shows a labelled PDF modal, restores focus and releases its object URL', async () => {
    const report = builder();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    await report.Generate();
    const dialog = document.querySelector<HTMLDialogElement>('[data-report-preview]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Relatório');
    expect(dialog.querySelector('iframe')?.src).toContain('blob:report-');
    expect(dialog.querySelector('a')?.download).toBe('report.pdf');
    const url = dialog.querySelector('iframe')!.src;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-report-preview]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
  it('reserves a new tab synchronously, replaces it with PDF and handles blocked popups', async () => {
    const report = builder();
    const popup = { opener: window, closed: false, close: vi.fn(), location: { replace: vi.fn() } };
    popup.location.replace.mockImplementation(() => expect(popup.opener).toBe(window));
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const pending = report.Generate({ previewMode: 'new-tab' });
    expect(open).toHaveBeenCalledWith(expect.stringContaining('blob:report-'), 'webrad-report');
    await pending;
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(open.mock.calls[0]![0]);
    open.mockReturnValue(null);
    await expect(report.Generate({ previewMode: 'new-tab' })).rejects.toThrow('blocked');
  });
  it('downloads with the chosen name and releases all remaining URLs on disposal', async () => {
    const report = builder();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('Export.pdf');
    });
    await report.Generate({ previewMode: 'download', fileName: 'Export.pdf' });
    expect(click).toHaveBeenCalledOnce();
    report.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(expect.stringContaining('blob:report-'));
    await expect(report.GeneratePDF()).rejects.toThrow('disposed');
  });
});
