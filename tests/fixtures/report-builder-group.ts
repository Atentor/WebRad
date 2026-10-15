import { nestedReportProject, nestedReportTemplate } from './report-builder-nested';
import {
  reportGroupAppearance,
  type WebReportGroupElement,
  type WebReportTemplate,
} from '@webrad/runtime/report-template';

export function reportGroupTemplate(): WebReportTemplate {
  const template = nestedReportTemplate();
  const repeated = template.bands[0]!.elements[0]!;
  if (repeated.type !== 'repeater') throw new Error('Missing fixture repeater.');
  const card: WebReportGroupElement = {
    id: 'record-card',
    name: 'Record card',
    type: 'group',
    x: 0,
    y: 0,
    width: 88,
    height: 28,
    children: repeated.children,
  };
  const group: WebReportGroupElement = {
    id: 'report-group',
    name: 'Report group',
    type: 'group',
    x: 0,
    y: 0,
    width: 180,
    height: 60,
    appearance: {
      ...reportGroupAppearance(card),
      backgroundColor: '#f0f6ff',
      borderWidth: 0.4,
      borderColor: '#336699',
      borderRadius: 4,
    },
    children: [
      {
        ...repeated,
        y: 8,
        children: [
          {
            ...card,
            appearance: {
              ...reportGroupAppearance(card),
              backgroundColor: '#ffffff',
              borderRadius: 2,
            },
          },
        ],
      },
    ],
  };
  return {
    ...template,
    name: 'Grouped customer report',
    bands: [{ ...template.bands[0]!, height: 60, elements: [group] }],
  };
}

export function reportGroupProject(baseUrl: string, template = reportGroupTemplate()) {
  const project = nestedReportProject(baseUrl);
  return {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      components: page.components.map((component) =>
        component.type === 'WebReportBuilder'
          ? { ...component, props: { ...component.props, reportTemplate: template } }
          : component,
      ),
    })),
  };
}
