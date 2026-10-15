import { reportBuilderProject } from './report-builder';
import { comboBoxApiConfiguration } from './combo-box';
import {
  createDefaultReportTemplate,
  reportRepeaterAppearance,
  type WebReportRepeaterElement,
  type WebReportTemplate,
  type WebReportTextElement,
} from '@webrad/runtime/report-template';

function text(
  id: string,
  value: WebReportTextElement['value'],
  width = 88,
  y = 0,
): WebReportTextElement {
  return {
    id,
    name: id,
    type: 'text',
    x: 0,
    y,
    width,
    height: 6,
    fontSize: 10,
    color: '#123456',
    bold: false,
    align: 'left',
    value,
  };
}
export function nestedReportTemplate(): WebReportTemplate {
  const child: WebReportRepeaterElement = {
    id: 'orders',
    name: 'Orders',
    type: 'repeater',
    x: 0,
    y: 8,
    width: 88,
    height: 6,
    gap: 0,
    source: { scope: 'row', apiClientId: '', operationId: '', listPath: '/orders' },
    header: { height: 6, elements: [text('order-header', { kind: 'row', path: '/name' })] },
    footer: {
      height: 6,
      elements: [text('order-footer', { kind: 'static', value: 'End orders' })],
    },
    children: [text('order-product', { kind: 'row', path: '/product' })],
  };
  const group: WebReportRepeaterElement = {
    id: 'customers',
    name: 'Customers',
    type: 'repeater',
    x: 0,
    y: 0,
    width: 180,
    height: 28,
    gap: 2,
    source: { apiClientId: 'customers-api', operationId: 'load-customers', listPath: '/customers' },
    header: {
      height: 8,
      elements: [text('group-header', { kind: 'static', value: 'Customer header' }, 180)],
    },
    footer: {
      height: 8,
      elements: [text('group-footer', { kind: 'static', value: 'Customer footer' }, 180)],
    },
    layout: { columns: 2, rows: 2, columnGap: 4, fill: 'rows' },
    appearance: {
      ...reportRepeaterAppearance(child),
      backgroundColor: '#ddeeff',
      borderColor: '#336699',
      borderWidth: 0.3,
      borderStyle: 'dashed',
      rowLines: true,
      columnLines: true,
      lineColor: '#778899',
      lineWidth: 0.2,
    },
    children: [text('customer-name', { kind: 'row', path: '/name' }), child],
  };
  return {
    ...createDefaultReportTemplate(),
    name: 'Nested customer report',
    parameters: [{ name: 'Title', type: 'string', defaultValue: 'Customers' }],
    bands: [{ id: 'detail', kind: 'detail', height: 44, elements: [group] }],
  };
}
export function nestedReportProject(baseUrl: string) {
  const original = reportBuilderProject(baseUrl, nestedReportTemplate());
  const config = comboBoxApiConfiguration();
  return {
    ...original,
    pages: original.pages.map((page) => ({
      ...page,
      components: page.components.map((component) => {
        if (component.type !== 'WebApiClient') return component;
        return {
          ...component,
          props: {
            ...component.props,
            apiClientConfig: {
              ...config,
              operations: config.operations.map((operation) => ({
                ...operation,
                responseSchema:
                  operation.responseSchema === null
                    ? null
                    : {
                        ...operation.responseSchema,
                        root: {
                          ...operation.responseSchema.root,
                          children: operation.responseSchema.root.children.map((list) =>
                            list.name !== 'customers'
                              ? list
                              : {
                                  ...list,
                                  children: list.children.map((item) => ({
                                    ...item,
                                    children: [
                                      ...item.children,
                                      {
                                        id: 'orders-list',
                                        name: 'orders',
                                        path: '/customers/*/orders',
                                        kind: 'list',
                                        fieldType: 'list',
                                        nullable: false,
                                        children: [
                                          {
                                            id: 'order-item',
                                            name: 'Item',
                                            path: '/customers/*/orders/*',
                                            kind: 'object',
                                            fieldType: 'object',
                                            nullable: false,
                                            children: [
                                              {
                                                id: 'product-field',
                                                name: 'product',
                                                path: '/customers/*/orders/*/product',
                                                kind: 'field',
                                                fieldType: 'string',
                                                nullable: false,
                                                children: [],
                                              },
                                            ],
                                          },
                                        ],
                                      },
                                    ],
                                  })),
                                },
                          ),
                        },
                      },
              })),
            },
          },
        };
      }),
    })),
  };
}

export function reportSectionColumnsTemplate(): WebReportTemplate {
  const template = nestedReportTemplate();
  return {
    ...template,
    bands: template.bands.map((band) => ({
      ...band,
      elements: band.elements.map((element) => {
        if (element.type !== 'repeater') return element;
        const header = {
          ...element.header!,
          columns: 2,
          columnGap: 4,
          elements: [
            { ...element.header!.elements[0]!, width: 88 },
            { ...text('header-right', { kind: 'static', value: 'Header right' }), column: 1 },
          ],
        };
        const footer = {
          ...element.footer!,
          columns: 3,
          columnGap: 3,
          elements: [
            { ...element.footer!.elements[0]!, width: 58 },
            { ...text('footer-middle', { kind: 'static', value: 'Footer middle' }, 58), column: 1 },
            { ...text('footer-right', { kind: 'static', value: 'Footer right' }, 58), column: 2 },
          ],
        };
        return { ...element, header, footer };
      }),
    })),
  };
}
export const nestedReportData = {
  codes: ['EXTRA'],
  customers: Array.from({ length: 8 }, (_, index) => ({
    name: `Customer ${index + 1}`,
    orders: [{ product: `Product ${index + 1}A` }, { product: `Product ${index + 1}B` }],
  })),
};
