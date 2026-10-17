import { componentRegistry } from '@webrad/component-registry';
import type { ComponentNode } from '@webrad/project-model';
import {
  measureRuntimeFitContentSize,
  type RuntimeFitContentMeasurementOptions,
  type RuntimeFitContentSize,
} from '@webrad/runtime';

/** A repeating preview fits its full row shell, while its width follows the row's children. */
export function measureDesignerFitContentSize(
  component: HTMLElement,
  childHost: HTMLElement,
  node: ComponentNode,
  options: RuntimeFitContentMeasurementOptions,
): RuntimeFitContentSize {
  const size = measureRuntimeFitContentSize(component, childHost, node.layout, options);
  if (
    node.layout.item.height !== 'fit-content' ||
    componentRegistry.get(node.type)?.designerChildHost !== 'repeating-row'
  )
    return size;
  const shell = measureRuntimeFitContentSize(
    component,
    component,
    {
      ...node.layout,
      item: { ...node.layout.item, width: 'fixed' },
    },
    { ...options, isLayoutChild: (child) => child.dataset.webradRepeatingRow === 'template' },
  );
  return { ...size, height: shell.height };
}
