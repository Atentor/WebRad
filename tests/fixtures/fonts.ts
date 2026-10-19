import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addComponentStyle,
  createComponentStyle,
  createProject,
  updatePage,
} from '@webrad/project-model';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';

export function fontProject() {
  let project = createProject('FontSamples', { pageWidth: 620, pageHeight: 820 });
  let page = project.pages[0]!;
  for (const [row, font] of WEBRAD_FONT_FAMILIES.entries()) {
    for (const [column, variant] of ['regular', 'bold', 'italic'].entries()) {
      const style = createComponentStyle(`${font.label} ${variant}`, 'WebLabel', {
        states: {
          base: {
            fontFamily: font.id,
            fontSize: { value: 16, unit: 'px' },
            fontWeight: variant === 'bold' ? 'bold' : 'normal',
            fontStyle: variant === 'italic' ? 'italic' : 'normal',
            whiteSpace: 'preLine',
          },
        },
      });
      project = addComponentStyle(project, style);
      const node = defaultComponentRegistry.createComponent('WebLabel', {
        id: `${font.id}-${variant}`,
        name: `Sample${row}_${column}`,
        parentId: page.rootComponentId,
        x: 12 + column * 200,
        y: 16 + row * 88,
        width: 195,
        height: 80,
        props: { caption: `${font.label}\nAção, café, João Āă\n${variant} 012345` },
      });
      page = addComponent(page, { ...node, styleId: style.id }, page.rootComponentId);
    }
  }
  return updatePage(project, page.id, page);
}
