import { ChartsConfigurationSchema, createDefaultChartsConfiguration } from '@webrad/project-model';
import type { ComponentDefinition, ComponentPropertyDefinition } from './types.js';

export function createWebChartsDefinition(
  geometry: readonly ComponentPropertyDefinition[],
): ComponentDefinition {
  return {
    type: 'WebCharts',
    displayName: 'Charts',
    namePrefix: 'Charts',
    palette: { category: 'Standard', caption: 'Charts' },
    icon: 'chart-no-axes-combined',
    visual: true,
    canHaveChildren: false,
    defaultEvent: 'OnPointClick',
    designerAction: 'charts-configurator',
    defaultBounds: { width: 480, height: 320 },
    defaults: {
      chartsConfig: createDefaultChartsConfiguration(),
      visible: true,
      collapseWhenHidden: true,
      enabled: true,
    },
    styleEditor: {
      essentialProperties: [
        'backgroundColor',
        'textColor',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'borderRadius',
        'borderWidth',
        'borderColor',
        'borderStyle',
        'boxShadow',
      ],
    },
    properties: [
      ...geometry,
      {
        name: 'chartsConfig',
        label: 'Chart and data series',
        type: 'charts-config',
        category: 'Charts',
        source: 'props',
        defaultValue: createDefaultChartsConfiguration(),
        designerAction: 'charts-configurator',
        validateValue: (value) => ChartsConfigurationSchema.safeParse(value).success,
        description:
          'Choose a chart, customize its appearance and bind up to five API response series.',
      },
    ],
    events: [
      {
        name: 'OnPointClick',
        category: 'Data',
        description: 'Runs when a chart point is clicked or activated with the keyboard.',
        eventDetailType: 'WebChartPointEventDetail',
        eventDetailProperties: ['label', 'value', 'seriesId', 'seriesName', 'index'],
      },
      { name: 'OnClick', category: 'Mouse', eventType: 'MouseEvent' },
      { name: 'OnMouseEnter', category: 'Mouse', eventType: 'MouseEvent' },
      { name: 'OnMouseLeave', category: 'Mouse', eventType: 'MouseEvent' },
    ],
  };
}
