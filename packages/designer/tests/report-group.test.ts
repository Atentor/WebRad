import { expect, it } from 'vitest';
import { parseReportTemplate, reportElementChildren } from '@webrad/runtime/report-template';
import {
  reportGroupProject,
  reportGroupTemplate,
} from '../../../tests/fixtures/report-builder-group.js';
import {
  copyComponents,
  materializePaste,
  createReportElement,
  duplicateReportElement,
  editReportElement,
  insertReportElement,
  reportContainer,
  reportElementSelection,
  reportSelectedElement,
  reportRowSource,
  reportBindingError,
  renameReportParameter,
  resizeReportRepeaterLayout,
} from '../src/index.js';

it('inserts, selects and removes nested Group contents with local bounds and inherited row sources', () => {
  const template = reportGroupTemplate();
  const target = { bandId: 'detail', elementId: null, parentId: 'record-card' };
  expect(reportContainer(template, target)).toMatchObject({ width: 88, height: 28 });
  expect(reportRowSource(template, target)).toMatchObject({
    apiClientId: 'customers-api',
    listPath: '/customers',
  });
  expect(reportElementSelection(template, 'detail', 'customer-name')).toMatchObject({
    parentId: 'record-card',
  });
  const group = createReportElement('group', 50, 20);
  const inserted = insertReportElement(template, target, group);
  expect(reportSelectedElement(inserted, { ...target, elementId: group.id })).toEqual(group);
  expect(reportContainer(template, target).elements).toHaveLength(2);
  expect(reportContainer(inserted, target).elements).toHaveLength(3);
  expect(editReportElement(inserted, { ...target, elementId: group.id }, () => null)).toEqual(
    template,
  );
  const resized = editReportElement(
    template,
    { bandId: 'detail', elementId: 'customers' },
    (element) =>
      element.type !== 'repeater'
        ? element
        : resizeReportRepeaterLayout(element, { ...element.layout!, columns: 4 }),
  );
  expect(reportContainer(resized, target).width).toBe(42);
  expect(() => parseReportTemplate(resized)).not.toThrow();
});

it('duplicates complete Group trees with independent IDs and renames/remaps bindings at every level', () => {
  let template = reportGroupTemplate();
  const root = template.bands[0]!.elements[0]!;
  const ids = (element: typeof root): string[] => [
    element.id,
    ...reportElementChildren(element).flatMap(ids),
  ];
  const copy = duplicateReportElement(root);
  expect(ids(copy)).toHaveLength(ids(root).length);
  expect(ids(copy).some((id) => ids(root).includes(id))).toBe(false);
  template = editReportElement(
    template,
    { bandId: 'detail', elementId: 'customer-name' },
    (element) =>
      element.type !== 'text'
        ? element
        : { ...element, value: { kind: 'parameter', name: 'Title' } },
  );
  template = renameReportParameter(template, 0, {
    name: 'Heading',
    type: 'string',
    defaultValue: 'Customers',
  });
  const project = reportGroupProject('https://example.test', template);
  const page = project.pages[0]!;
  const report = page.components.find((component) => component.type === 'WebReportBuilder')!;
  expect(reportBindingError(template, page.components)).toBeNull();
  const pasted = materializePaste(page, copyComponents(page, ['customers-api', report.id]), {
    createId: (id) => `copy-${id}`,
  });
  const saved = parseReportTemplate(
    pasted.components.find((component) => component.type === 'WebReportBuilder')!.props
      .reportTemplate,
  );
  expect(
    reportSelectedElement(saved, {
      bandId: 'detail',
      parentId: 'report-group',
      elementId: 'customers',
    }),
  ).toMatchObject({ source: { apiClientId: 'copy-customers-api' } });
  expect(
    reportSelectedElement(saved, {
      bandId: 'detail',
      parentId: 'record-card',
      elementId: 'customer-name',
    }),
  ).toMatchObject({ value: { kind: 'parameter', name: 'Heading' } });
});
