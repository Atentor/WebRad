import { createDefaultReportTemplate, parseReportTemplate } from '@webrad/runtime/report-template';
import type { ComponentDefinition } from './types.js';

/** The report document is authored in its own designer and remains ordinary project data. */
export const webReportBuilder: ComponentDefinition = {
  type: 'WebReportBuilder',
  displayName: 'Report Builder',
  namePrefix: 'ReportBuilder',
  palette: { category: 'Nonvisual', caption: 'Report Builder' },
  icon: 'component-report-builder',
  visual: false,
  supportsStyles: false,
  canHaveChildren: false,
  designerAction: 'report-builder',
  defaultEvent: 'OnSuccess',
  defaultBounds: { width: 160, height: 40 },
  defaults: {
    reportTemplate: createDefaultReportTemplate(),
    previewMode: 'modal',
    fileName: 'report.pdf',
  },
  properties: [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    {
      name: 'reportTemplate',
      label: 'Report template',
      type: 'report-template',
      category: 'Report',
      source: 'props',
      designerAction: 'report-builder',
      defaultValue: createDefaultReportTemplate(),
      description:
        'Open the report designer to edit bands, fields, repeated records and parameters.',
      validateValue: (value) => {
        try {
          parseReportTemplate(value);
          return true;
        } catch {
          return false;
        }
      },
    },
    {
      name: 'previewMode',
      label: 'Preview destination',
      type: 'enum',
      category: 'Report',
      source: 'props',
      options: ['modal', 'new-tab', 'download'],
      defaultValue: 'modal',
      description:
        'Show the generated PDF in a modal, open it in a new tab, or download it directly.',
    },
    {
      name: 'fileName',
      label: 'PDF file name',
      type: 'string',
      category: 'Report',
      source: 'props',
      defaultValue: 'report.pdf',
    },
  ],
  events: [
    { name: 'OnGenerate', category: 'Report', eventDetailType: 'WebReportGenerationOptions' },
    {
      name: 'OnSuccess',
      category: 'Report',
      eventDetailType: 'WebReportResult',
      eventDetailProperties: ['blob', 'pageCount', 'fileName'],
    },
    { name: 'OnError', category: 'Report', eventDetailType: 'Error' },
  ],
};
