import { expect, it } from 'vitest';
import {
  componentRegistry,
  resolveComponentDesignerPresentation,
} from '@webrad/component-registry';
import { createDefaultReportTemplate } from '@webrad/runtime/report-template';
import {
  addComponent,
  createPage,
  deserializePage,
  serializePage,
  ReportTemplateSchema,
} from '../src/index.js';

it('persists the report template and typed defaults as nonvisual project data', () => {
  const template = {
    ...createDefaultReportTemplate(),
    parameters: [{ name: 'Title', type: 'string' as const, defaultValue: 'Sales' }],
  };
  const initial = createPage('PageReports');
  const page = addComponent(
    initial,
    componentRegistry.createComponent('WebReportBuilder', {
      id: 'stable-report',
      parentId: initial.rootComponentId,
      props: { reportTemplate: template, previewMode: 'new-tab', fileName: 'sales.pdf' },
    }),
  );
  expect(deserializePage(serializePage(page))).toEqual(page);
  const metadata = componentRegistry.require('WebReportBuilder');
  expect(resolveComponentDesignerPresentation(metadata)).toBe('tray');
  expect(metadata).toMatchObject({
    visual: false,
    canHaveChildren: false,
    supportsStyles: false,
    designerAction: 'report-builder',
  });
  expect(metadata.properties.find((property) => property.name === 'reportTemplate')).toMatchObject({
    type: 'report-template',
    designerAction: 'report-builder',
  });
});

it('rejects malformed saved templates and preview options during deserialization', () => {
  const initial = createPage('PageReports');
  const page = addComponent(
    initial,
    componentRegistry.createComponent('WebReportBuilder', { parentId: initial.rootComponentId }),
  );
  for (const reportTemplate of [
    { schemaVersion: 2 },
    {
      ...createDefaultReportTemplate(),
      parameters: [{ name: 'Count', type: 'number', defaultValue: 'invalid' }],
    },
  ]) {
    const invalid = {
      ...page,
      components: page.components.map((component) =>
        component.type === 'WebReportBuilder'
          ? { ...component, props: { ...component.props, reportTemplate } }
          : component,
      ),
    };
    expect(() => deserializePage(JSON.stringify(invalid))).toThrow(
      'The WebRAD model failed validation.',
    );
    expect(ReportTemplateSchema.safeParse(reportTemplate).success).toBe(false);
  }
  const invalidMode = {
    ...page,
    components: page.components.map((component) =>
      component.type === 'WebReportBuilder'
        ? { ...component, props: { ...component.props, previewMode: 'popup' } }
        : component,
    ),
  };
  expect(() => deserializePage(JSON.stringify(invalidMode))).toThrow();
});
