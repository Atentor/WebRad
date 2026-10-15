import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { addComponent } from '@webrad/project-model';
import { parseReportTemplate } from '@webrad/runtime/report-template';
import {
  copyComponents,
  materializePaste,
  PasteComponentsCommand,
  CommandHistory,
  duplicateReportElement,
  renameReportParameter,
  reportBindingError,
} from '../src/index.js';
import {
  reportBuilderProject,
  reportBuilderTemplate,
} from '../../../tests/fixtures/report-builder.js';

it('pastes report bindings with copied stable API IDs while retaining portable names and parameters', () => {
  let page = reportBuilderProject('https://api.example.test').pages[0]!;
  const original = reportBuilderTemplate();
  const template = parseReportTemplate({
    ...original,
    bands: original.bands.map((band) =>
      band.kind !== 'detail'
        ? band
        : {
            ...band,
            elements: band.elements.map((element) =>
              element.type !== 'repeater'
                ? element
                : {
                    ...element,
                    children: [
                      ...element.children,
                      {
                        ...element.children[0],
                        id: 'global-field',
                        name: 'Global field',
                        value: {
                          kind: 'field',
                          apiClientId: 'customers-api',
                          operationId: 'load-customers',
                          path: '/name',
                        },
                      },
                      {
                        ...element.children[0],
                        id: 'portable-field',
                        name: 'Portable field',
                        value: {
                          kind: 'field',
                          apiClientId: 'ApiClient1',
                          operationId: 'Load',
                          path: '/name',
                        },
                      },
                    ],
                  },
            ),
          },
    ),
  });
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebReportBuilder', {
      id: 'second-report',
      name: 'ReportBuilder2',
      parentId: page.rootComponentId,
      props: { reportTemplate: template },
    }),
  );
  const clipboard = copyComponents(page, ['customers-api', 'second-report']);
  const history = new CommandHistory(page);
  history.execute(new PasteComponentsCommand(clipboard, { createId: (id) => `copy-${id}` }));
  const saved = history.state;
  const pasted = parseReportTemplate(
    saved.components.find((component) => component.id === 'copy-second-report')?.props
      .reportTemplate,
  );
  const repeater = pasted.bands.find((band) => band.kind === 'detail')?.elements[0];
  expect(repeater?.type).toBe('repeater');
  if (repeater?.type !== 'repeater') throw new Error('Missing pasted repeater.');
  expect(repeater.source.apiClientId).toBe('copy-customers-api');
  expect(repeater.children.find((element) => element.id === 'global-field')).toMatchObject({
    value: { apiClientId: 'copy-customers-api', operationId: 'load-customers' },
  });
  expect(repeater.children.find((element) => element.id === 'portable-field')).toMatchObject({
    value: { apiClientId: 'ApiClient1', operationId: 'Load' },
  });
  expect(pasted.parameters).toEqual(template.parameters);
  expect(pasted.bands.map((band) => band.id)).toEqual(template.bands.map((band) => band.id));
  history.undo();
  expect(history.state).toEqual(page);
  history.redo();
  expect(history.state).toEqual(saved);
  const alone = materializePaste(page, copyComponents(page, ['second-report']), {
    createId: (id) => `only-${id}`,
  });
  expect(parseReportTemplate(alone.components[0]?.props.reportTemplate)).toEqual(template);
});

it('renames a parameter throughout repeated leaves and duplicates elements with independent identities', () => {
  const template = reportBuilderTemplate();
  const repeated = template.bands.find((band) => band.kind === 'detail')?.elements[0];
  if (repeated?.type !== 'repeater') throw new Error('Missing report repeater.');
  const text = repeated.children[0];
  if (text?.type !== 'text') throw new Error('Missing report text.');
  const withParameter = parseReportTemplate({
    ...template,
    bands: template.bands.map((band) =>
      band.kind !== 'detail'
        ? band
        : {
            ...band,
            elements: [
              { ...repeated, children: [{ ...text, value: { kind: 'parameter', name: 'Title' } }] },
            ],
          },
    ),
  });
  const renamed = renameReportParameter(withParameter, 0, {
    name: 'Heading',
    type: 'string',
    defaultValue: 'Customers',
  });
  const row = renamed.bands.find((band) => band.kind === 'detail')?.elements[0];
  if (row?.type !== 'repeater') throw new Error('Missing renamed repeater.');
  expect(row.children[0]).toMatchObject({
    id: text.id,
    value: { kind: 'parameter', name: 'Heading' },
  });
  expect(renamed.bands.find((band) => band.kind === 'title')?.elements[0]).toMatchObject({
    value: { kind: 'parameter', name: 'Heading' },
  });
  const copied = duplicateReportElement(row);
  expect(copied.id).not.toBe(row.id);
  if (copied.type !== 'repeater') throw new Error('Missing duplicate repeater.');
  expect(copied.children[0]?.id).not.toBe(row.children[0]?.id);
  expect(copied.source).toEqual(row.source);
  expect(copied.children[0]).toMatchObject({ value: { kind: 'parameter', name: 'Heading' } });
  expect(template.parameters[0]?.name).toBe('Title');
});

it('accepts portable report bindings and rejects unknown client names without executing requests', () => {
  const page = reportBuilderProject('https://api.example.test').pages[0]!;
  const template = reportBuilderTemplate();
  const portable = {
    ...template,
    bands: template.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) =>
        element.type !== 'repeater'
          ? element
          : {
              ...element,
              source: { ...element.source, apiClientId: 'ApiClient1', operationId: 'Load' },
            },
      ),
    })),
  };
  expect(reportBindingError(portable, page.components)).toBeNull();
  const unavailable = {
    ...portable,
    bands: portable.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) =>
        element.type !== 'repeater'
          ? element
          : { ...element, source: { ...element.source, apiClientId: 'MissingApi' } },
      ),
    })),
  };
  expect(reportBindingError(unavailable, page.components)).toContain('choose an API Client');
});
