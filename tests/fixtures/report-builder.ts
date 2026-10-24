import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent, bindComponentEvent, createProject, updatePage } from '@webrad/project-model';
import {
  createDefaultReportTemplate,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';
import { comboBoxApiConfiguration } from './combo-box';
export function reportBuilderTemplate(): WebReportTemplate {
  const template = createDefaultReportTemplate();
  return {
    ...template,
    name: 'Clientes',
    parameters: [{ name: 'Title', type: 'string', defaultValue: 'Clientes' }],
    bands: template.bands.map((band) => {
      if (band.kind === 'title')
        return {
          ...band,
          elements: band.elements.map((element) =>
            element.type === 'text'
              ? { ...element, value: { kind: 'parameter' as const, name: 'Title' } }
              : element,
          ),
        };
      if (band.kind === 'detail')
        return {
          ...band,
          height: 8,
          elements: [
            {
              id: 'customer-row',
              name: 'Customers',
              type: 'repeater' as const,
              x: 0,
              y: 0,
              width: 180,
              height: 8,
              gap: 1,
              source: {
                apiClientId: 'customers-api',
                operationId: 'load-customers',
                listPath: '/customers',
              },
              children: [
                {
                  id: 'customer-name',
                  name: 'Customer name',
                  type: 'text' as const,
                  x: 0,
                  y: 0,
                  width: 160,
                  height: 8,
                  fontSize: 11,
                  bold: false,
                  color: '#1e293b',
                  align: 'left' as const,
                  value: { kind: 'row' as const, path: '/name' },
                },
              ],
            },
          ],
        };
      return band;
    }),
  };
}
export function reportBuilderProject(
  baseUrl: string,
  reportTemplate: WebReportTemplate = reportBuilderTemplate(),
) {
  const project = createProject('ReportExample');
  let page = project.pages[0]!;
  const add = (type: string, id: string, name: string, props = {}, index = 0): void => {
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent(type, {
        id,
        name,
        parentId: page.rootComponentId,
        props,
        x: 20 + index * 170,
        y: 24,
      }),
      page.rootComponentId,
    );
  };
  add('WebApiClient', 'customers-api', 'ApiClient1', {
    baseUrl,
    apiClientConfig: comboBoxApiConfiguration(),
  });
  add('WebReportBuilder', 'report', 'ReportBuilder1', { reportTemplate });
  for (const [index, [name, handler]] of [
    ['PDF', 'pdf'],
    ['Modal', 'modal'],
    ['NewTab', 'newTab'],
    ['Download', 'download'],
    ['External', 'external'],
    ['BlobTemplate', 'blobTemplate'],
  ].entries()) {
    add('WebButton', name!, name!, { caption: name }, index);
    page = bindComponentEvent(page, name!, 'OnClick', handler!);
  }
  page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'prepare');
  return updatePage(project, page.id, page);
}
export function reportBuilderSources(): Record<string, string> {
  return {
    'pages/index.ts': `import { indexGenerated } from "./index.generated";
export class index extends indexGenerated {
  async prepare(): Promise<void> {
    try {
      await ApiClient1.Load.execute();
      this.ReportBuilder1.Parameters.Set('Title', 'Clientes de S\u00E3o Paulo');
      this.element.dataset.ready = 'true';
    } catch (error) { this.element.dataset.error = String(error); }
  }
  async pdf(): Promise<void> {
    try {
      const result = await ReportBuilder1.GeneratePDF();
      const bytes = new Uint8Array(await result.blob.arrayBuffer());
      this.element.dataset.pdf = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
      this.element.dataset.pages = String(result.pageCount);
    } catch (error) { this.element.dataset.error = String(error); }
  }
  async modal(): Promise<void> {
    try { await this.ReportBuilder1.Generate({ previewMode: 'modal' }); }
    catch (error) { this.element.dataset.error = String(error); }
  }
  async newTab(): Promise<void> {
    try { await ReportBuilder1.Generate({ previewMode: 'new-tab' }); this.element.dataset.tab = 'true'; }
    catch (error) { this.element.dataset.error = String(error); }
  }
  async download(): Promise<void> {
    try { await ReportBuilder1.Generate({ previewMode: 'download', fileName: 'clientes.pdf' }); this.element.dataset.download = 'true'; }
    catch (error) { this.element.dataset.error = String(error); }
  }
  async external(): Promise<void> {
    try {
      await this.ReportBuilder1.LoadTemplate(ApiClient1.baseUrl + '/external.report.json');
      this.element.dataset.template = ReportBuilder1.template.name;
      this.element.dataset.parameter = String(ReportBuilder1.Parameters.Get('Title'));
    } catch (error) { this.element.dataset.error = String(error); }
  }
  async blobTemplate(): Promise<void> {
    const url = URL.createObjectURL(new Blob([
      JSON.stringify({ ...ReportBuilder1.template, name: 'Blob template' }),
    ], { type: 'application/json' }));
    try {
      await this.ReportBuilder1.LoadTemplate(url);
      this.element.dataset.blobTemplate = ReportBuilder1.template.name;
      this.element.dataset.blobParameter = String(ReportBuilder1.Parameters.Get('Title'));
    } catch (error) { this.element.dataset.error = String(error); }
    finally { URL.revokeObjectURL(url); }
  }
}`,
  };
}
