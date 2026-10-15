import { expect, it } from 'vitest';
import { parseReportTemplate } from '@webrad/runtime/report-template';
import {
  nestedReportProject,
  nestedReportTemplate,
} from '../../../tests/fixtures/report-builder-nested.js';
import {
  editReportElement,
  insertReportElement,
  duplicateReportElement,
  reportSelectedElement,
  reportBindingError,
  reportContainer,
  reportRowSource,
  reportApiSource,
  resizeReportRepeaterLayout,
  resizeReportRepeaterSectionColumns,
  copyComponents,
  materializePaste,
  renameReportParameter,
} from '../src/index.js';

it('selects and edits deep sections, duplicates stable subtrees and resolves parent schemas', () => {
  const template = nestedReportTemplate();
  const selection = {
    bandId: 'detail',
    parentId: 'orders',
    section: 'row' as const,
    elementId: 'order-product',
  };
  const product = reportSelectedElement(template, selection)!;
  expect(product.id).toBe('order-product');
  const renamed = editReportElement(template, selection, (element) => ({
    ...element,
    name: 'Product',
  }));
  expect(reportSelectedElement(renamed, selection)?.name).toBe('Product');
  const copy = duplicateReportElement(product);
  const inserted = insertReportElement(
    renamed,
    { ...selection, section: 'footer', elementId: null },
    copy,
  );
  expect(reportContainer(inserted, { ...selection, section: 'footer' }).elements).toHaveLength(2);
  expect(reportSelectedElement(template, selection)?.name).toBe('order-product');
  const components = nestedReportProject('https://example.test').pages[0]!.components;
  expect(reportBindingError(template, components)).toBeNull();
  const source = reportRowSource(template, selection)!;
  expect(source.listPath).toBe('/customers/*/orders');
  expect(
    reportApiSource(components, source.apiClientId, source.operationId, source.listPath).rowFields,
  ).toEqual([{ path: '/product', label: '/product' }]);
  expect(reportRowSource(template, { ...selection, section: 'header' })?.listPath).toBe(
    '/customers',
  );
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing group.');
  const duplicated = duplicateReportElement(group);
  expect(duplicated.type).toBe('repeater');
  expect(() =>
    parseReportTemplate({
      ...template,
      bands: [{ ...template.bands[0], elements: [group, duplicated] }],
    }),
  ).not.toThrow();
  const resized = resizeReportRepeaterLayout(group, { ...group.layout!, columns: 4 });
  expect(resized.children[0]!.width).toBeCloseTo(42);
  expect(
    parseReportTemplate({ ...template, bands: [{ ...template.bands[0], elements: [resized] }] }),
  ).toBeDefined();
});

it('resizes Header/Footer columns independently and keeps content when reducing their count', () => {
  const template = nestedReportTemplate();
  const group = template.bands[0]!.elements[0]!;
  if (group.type !== 'repeater') throw new Error('Missing group.');
  const two = resizeReportRepeaterSectionColumns(group, 'header', { columns: 2, columnGap: 4 });
  expect(two.children).toBe(group.children);
  expect(two.footer).toBe(group.footer);
  expect(two.header!.elements[0]!.width).toBe(88);
  const extra = { ...two.header!.elements[0]!, id: 'second-header', column: 1 };
  const placed = insertReportElement(
    { ...template, bands: [{ ...template.bands[0]!, elements: [two] }] },
    { bandId: 'detail', parentId: group.id, section: 'header', column: 1, elementId: null },
    extra,
  );
  const target = {
    bandId: 'detail',
    parentId: group.id,
    section: 'header' as const,
    column: 1,
    elementId: extra.id,
  };
  expect(reportContainer(placed, target)).toMatchObject({ width: 88, elements: [extra] });
  const updated = placed.bands[0]!.elements[0]!;
  if (updated.type !== 'repeater') throw new Error('Missing group.');
  const one = resizeReportRepeaterSectionColumns(updated, 'header', { columns: 1, columnGap: 0 });
  expect(one.header!.elements[1]).toMatchObject({ id: extra.id, column: 0, y: 8, width: 180 });
  expect(one.header!.height).toBe(14);
});

it('remaps copied API references and renamed parameters throughout nested Header and Footer sections', () => {
  const project = nestedReportProject('https://example.test');
  const original = project.pages[0]!;
  let template = nestedReportTemplate();
  template = editReportElement(
    template,
    { bandId: 'detail', parentId: 'orders', section: 'footer', elementId: 'order-footer' },
    (element) =>
      element.type !== 'text'
        ? element
        : {
            ...element,
            value: {
              kind: 'field',
              apiClientId: 'customers-api',
              operationId: 'load-customers',
              path: '/company',
            },
          },
  );
  template = editReportElement(
    template,
    { bandId: 'detail', parentId: 'customers', section: 'header', elementId: 'group-header' },
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
  const page = {
    ...original,
    components: original.components.map((component) =>
      component.type !== 'WebReportBuilder'
        ? component
        : { ...component, props: { ...component.props, reportTemplate: template } },
    ),
  };
  const report = page.components.find((component) => component.type === 'WebReportBuilder')!;
  const pasted = materializePaste(page, copyComponents(page, ['customers-api', report.id]), {
    createId: (id) => `copy-${id}`,
  });
  const saved = pasted.components.find((component) => component.type === 'WebReportBuilder')!.props
    .reportTemplate;
  const parsed = parseReportTemplate(saved);
  expect(
    reportSelectedElement(parsed, {
      bandId: 'detail',
      parentId: 'orders',
      section: 'footer',
      elementId: 'order-footer',
    }),
  ).toMatchObject({ value: { apiClientId: 'copy-customers-api' } });
  expect(
    reportSelectedElement(parsed, {
      bandId: 'detail',
      parentId: 'customers',
      section: 'header',
      elementId: 'group-header',
    }),
  ).toMatchObject({ value: { name: 'Heading' } });
});
