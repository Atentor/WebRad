import type { PageModel } from '@webrad/project-model';

/** Copy identities owned by the document; shared styles and reusable definitions stay shared. */
export function duplicateDocument(document: PageModel, name: string): PageModel {
  const ids = new Map(document.components.map((node) => [node.id, crypto.randomUUID()]));
  const idFor = (id: string): string => {
    const copy = ids.get(id);
    if (!copy) throw new Error(`Missing component in copied document: ${id}`);
    return copy;
  };
  return {
    ...structuredClone(document),
    id: crypto.randomUUID(),
    name,
    rootComponentId: idFor(document.rootComponentId),
    components: document.components.map((node) => ({
      ...structuredClone(node),
      id: idFor(node.id),
      parentId: node.parentId === null ? null : idFor(node.parentId),
      children: node.children.map(idFor),
      ...(node.id === document.rootComponentId
        ? {
            name,
          }
        : {}),
    })),
  };
}
