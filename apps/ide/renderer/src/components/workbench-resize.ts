/** Transient authoring layout; never part of the saved project. */
export const WORKBENCH_RESIZE_END = 'webrad:workbench-resize-end';

export function isWorkbenchResizing(element: Element): boolean {
  return element.closest('.wr-workbench[data-resizing]') !== null;
}
