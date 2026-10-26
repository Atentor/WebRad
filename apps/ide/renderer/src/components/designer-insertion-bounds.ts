import { componentRegistry } from '@webrad/component-registry';
import {
  normalizeRepeatingGroupConfiguration,
  type Bounds,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';
import { projectRepeatingGroupRowStyle } from '@webrad/runtime';
import { measureDesignerChildrenHost } from './designer-host-geometry';

/** A repeating template accepts children inside one row, independently of the list height. */
export function designerInsertionBounds(
  parent: ComponentNode,
  page: PageModel,
  surface: HTMLElement | null,
  scale: number,
): Pick<Bounds, 'width' | 'height'> {
  const measured = measureDesignerChildrenHost(surface, parent.id, scale);
  if (measured !== undefined) return measured.bounds;
  if (componentRegistry.get(parent.type)?.designerChildHost !== 'repeating-row')
    return parent.bounds;
  const configuration = normalizeRepeatingGroupConfiguration(parent.props.repeatingGroupConfig);
  const childrenBounds = page.components
    .filter((component) => component.parentId === parent.id)
    .map((component) => component.bounds);
  const rowStyle = projectRepeatingGroupRowStyle(configuration, parent.layout, childrenBounds);
  const projectedHeight = Number.parseFloat(rowStyle.height ?? '');
  return {
    width: parent.bounds.width,
    height: Number.isFinite(projectedHeight) ? projectedHeight : configuration.minRowHeight,
  };
}
