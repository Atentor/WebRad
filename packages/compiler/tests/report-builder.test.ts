import { JSDOM } from 'jsdom';
import { PDFDocument } from 'pdf-lib';
import { expect, it, vi } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  bindComponentEvent,
  createProject,
  updatePage,
  addReusableElement,
  createReusableElement,
} from '@webrad/project-model';
import {
  createDefaultReportTemplate,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { comboBoxApiConfiguration } from '../../../tests/fixtures/combo-box.js';
import { nestedReportProject } from '../../../tests/fixtures/report-builder-nested.js';
import {
  reportGroupProject,
  reportGroupTemplate,
} from '../../../tests/fixtures/report-builder-group.js';
import { compileProjectToMemory } from '../src/index.js';

function reportProject(clientKey = 'CustomersApi') {
  const project = createProject('ReportIntegration');
  let page = project.pages[0]!;
  const template: WebReportTemplate = {
    ...createDefaultReportTemplate(),
    parameters: [{ name: 'Title', type: 'string', defaultValue: 'Default' }],
    bands: [
      {
        id: 'detail',
        kind: 'detail',
        height: 20,
        elements: [
          {
            id: 'repeat',
            name: 'Customers',
            type: 'repeater',
            x: 0,
            y: 0,
            width: 180,
            height: 20,
            gap: 0,
            source: { apiClientId: clientKey, operationId: 'Load', listPath: '/customers' },
            children: [
              {
                id: 'customer-name',
                name: 'CustomerName',
                type: 'text',
                x: 0,
                y: 0,
                width: 180,
                height: 10,
                fontSize: 10,
                bold: false,
                color: '#000000',
                align: 'left',
                value: { kind: 'row', path: '/name' },
              },
            ],
          },
        ],
      },
    ],
  };
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'report-api',
      name: 'CustomersApi',
      parentId: page.rootComponentId,
      props: { baseUrl: 'https://api.example.test', apiClientConfig: comboBoxApiConfiguration() },
    }),
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebReportBuilder', {
      id: 'report-service',
      name: 'ReportBuilder1',
      parentId: page.rootComponentId,
      props: { reportTemplate: template, fileName: 'customers.pdf' },
    }),
  );
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'run');
  return updatePage(project, page.id, () => page);
}

it('validates API references inside report Groups before compiling', async () => {
  const template = reportGroupTemplate();
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'group') throw new Error('Missing Group.');
  const invalid = {
    ...template,
    bands: [
      {
        ...template.bands[0]!,
        elements: [
          {
            ...group,
            children: group.children.map((child) =>
              child.type !== 'repeater'
                ? child
                : { ...child, source: { ...child.source, apiClientId: 'missing-api' } },
            ),
          },
        ],
      },
    ],
  };
  const result = await compileProjectToMemory(reportGroupProject('https://example.test', invalid), {
    userSources: {},
  });
  expect(result.success).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: 'Report field must reference an API Client in the same document.',
        path: expect.arrayContaining(['children', 'source']),
      }),
    ]),
  );
});

it('validates API references in deep report Header and Footer sections', async () => {
  const project = nestedReportProject('https://example.test');
  const page = project.pages[0]!;
  const broken = {
    ...project,
    pages: [
      {
        ...page,
        components: page.components.map((component) => {
          if (component.type !== 'WebReportBuilder') return component;
          const template = component.props.reportTemplate as WebReportTemplate;
          return {
            ...component,
            props: {
              ...component.props,
              reportTemplate: {
                ...template,
                bands: template.bands.map((band) => ({
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
                                        ...child.footer!.elements[0],
                                        value: {
                                          kind: 'field',
                                          apiClientId: 'Missing',
                                          operationId: 'Load',
                                          path: '/name',
                                        },
                                      },
                                    ],
                                  },
                                },
                          ),
                        },
                  ),
                })),
              },
            },
          };
        }),
      },
    ],
  };
  const result = await compileProjectToMemory(broken, { userSources: {} });
  expect(result.success).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'registry',
        message: 'Report field must reference an API Client in the same document.',
        path: expect.arrayContaining(['footer', 'elements']),
      }),
    ]),
  );
});

it.each(['CustomersApi', 'report-api'])(
  'compiles and generates a genuine PDF from loaded API state bound by %s',
  async (key) => {
    const project = reportProject(key);
    const page = project.pages[0]!;
    const result = await compileProjectToMemory(project, {
      userSources: {
        [`pages/${page.name}.ts`]: `import { ${page.name}Generated } from './${page.name}.generated';
export class ${page.name} extends ${page.name}Generated {
  async run(): Promise<void> {
    try {
      await CustomersApi.Load.execute();
      ReportBuilder1.Parameters.Set('Title', 'Customers');
      await this.ReportBuilder1.LoadTemplate(ReportBuilder1.SaveTemplate());
      const result = await ReportBuilder1.GeneratePDF();
      this.element.dataset.pages = String(result.pageCount);
      this.element.dataset.fileName = result.fileName;
      this.element.dataset.bytes = Array.from(new Uint8Array(await result.blob.arrayBuffer())).join(',');
    } catch (error) { this.element.dataset.reportError = String(error); }
  }
}`,
      },
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.files['assets/licenses/pdf-lib-MIT.txt']).toContain('MIT License');
    expect(result.files['assets/app.js']).not.toMatch(/require\(["'](?:electron|node:)/u);
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            customers: Array.from({ length: 30 }, (_, index) => ({
              id: index,
              name: `Customer ${String(index)}`,
            })),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    Object.defineProperties(dom.window, {
      fetch: { value: fetch },
      Headers: { value: globalThis.Headers },
      Blob: { value: globalThis.Blob },
      structuredClone: { value: globalThis.structuredClone },
    });
    try {
      dom.window.eval(result.files['assets/app.js'] ?? '');
      const root = dom.window.document.querySelector<HTMLElement>(
        `[data-webrad-id="${page.rootComponentId}"]`,
      )!;
      await vi.waitFor(() => {
        expect(root.dataset.reportError).toBeUndefined();
        expect(root.dataset.bytes).toBeTruthy();
      });
      const document = await PDFDocument.load(
        Uint8Array.from(root.dataset.bytes!.split(',').map(Number)),
      );
      expect(document.getPageCount()).toBe(3);
      expect(root.dataset.pages).toBe('3');
      expect(root.dataset.fileName).toBe('customers.pdf');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(dom.window.document.querySelector('[data-webrad-type="WebReportBuilder"]')).toBeNull();
    } finally {
      dom.window.close();
    }
  },
  30_000,
);

it('rejects dangling API and operation references in authored report templates', async () => {
  const project = reportProject('MissingApi');
  const result = await compileProjectToMemory(project, { userSources: {} });
  expect(result.success).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'registry',
        message: expect.stringContaining('API Client in the same document'),
      }),
    ]),
  );
});

it('isolates typed parameters in two compiled reusable report placements', async () => {
  let project = createProject('ReusableReports');
  let reusable = createReusableElement('ReportCard');
  const template = {
    ...createDefaultReportTemplate(),
    parameters: [{ name: 'Title', type: 'string' as const, defaultValue: 'Default' }],
  };
  reusable = addComponent(
    reusable,
    defaultComponentRegistry.createComponent('WebReportBuilder', {
      id: 'local-report',
      name: 'ReportBuilder1',
      parentId: reusable.rootComponentId,
      props: { reportTemplate: template },
    }),
  );
  reusable = addComponent(
    reusable,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'local-button',
      name: 'GenerateReport',
      parentId: reusable.rootComponentId,
    }),
  );
  reusable = bindComponentEvent(reusable, 'local-button', 'OnClick', 'generate');
  project = addReusableElement(project, reusable);
  let page = project.pages[0]!;
  for (const id of ['first-card', 'second-card'])
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id,
        name: id === 'first-card' ? 'FirstCard' : 'SecondCard',
        parentId: page.rootComponentId,
        props: { reusableElementId: reusable.id },
      }),
    );
  project = updatePage(project, page.id, page);
  const result = await compileProjectToMemory(project, {
    userSources: {
      'reusables/ReportCard.ts': `import type { WebButton } from '@webrad/runtime';
import { ReportCardGenerated } from './ReportCard.generated';
export class ReportCard extends ReportCardGenerated {
 async generate(sender: WebButton): Promise<void> {
   try {
    const previous = ReportBuilder1.Parameters.Get('Title');
    ReportBuilder1.Parameters.Set('Title', this.instanceId);
    const pdf = await this.ReportBuilder1.GeneratePDF();
    sender.element.dataset.previous = String(previous);
    sender.element.dataset.current = String(ReportBuilder1.Parameters.Get('Title'));
    sender.element.dataset.pages = String(pdf.pageCount);
   } catch (error) { sender.element.dataset.error = String(error); }
 }
}`,
    },
  });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.webrad.test/',
  });
  Object.defineProperties(dom.window, {
    Blob: { value: globalThis.Blob },
    structuredClone: { value: globalThis.structuredClone },
  });
  try {
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const first = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-webrad-id="first-card:local-button"]',
    )!;
    const second = dom.window.document.querySelector<HTMLButtonElement>(
      '[data-webrad-id="second-card:local-button"]',
    )!;
    first.click();
    await vi.waitFor(() => {
      expect(first.dataset.error).toBeUndefined();
      expect(first.dataset.pages).toBe('1');
    });
    second.click();
    await vi.waitFor(() => {
      expect(second.dataset.error).toBeUndefined();
      expect(second.dataset.pages).toBe('1');
    });
    expect(first.dataset.previous).toBe('Default');
    expect(second.dataset.previous).toBe('Default');
    expect(first.dataset.current).toBe('first-card');
    expect(second.dataset.current).toBe('second-card');
  } finally {
    dom.window.close();
  }
}, 30_000);
