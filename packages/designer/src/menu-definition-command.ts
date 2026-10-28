import { linkMenuDefinition, type ComponentNode, type PageModel } from '@webrad/project-model';
import type { Command } from './command-history.js';
import { findDesignerComponent, replaceComponentNodes } from './model-utils.js';

/** Linking is one undoable edit, including the removal of a former local configuration. */
export class ChangeMenuDefinitionCommand implements Command<PageModel> {
  public readonly label = 'Change Menu definition';
  readonly #before = new Map<string, ComponentNode>();

  public constructor(readonly componentIds: readonly string[], readonly menuId: string) {}

  public execute(document: PageModel): PageModel {
    const replacements = new Map<string, ComponentNode>();
    for (const id of this.componentIds) {
      const node = findDesignerComponent(document, id);
      if (node.type !== 'WebMenu' || id === document.rootComponentId)
        throw new Error('Only Menu placements can reference a Menu definition.');
      if (!this.#before.has(id)) this.#before.set(id, node);
      replacements.set(id, linkMenuDefinition(node, this.menuId));
    }
    return replaceComponentNodes(document, replacements);
  }

  public undo(document: PageModel): PageModel {
    const replacements = new Map<string, ComponentNode>();
    for (const [id, previous] of this.#before) {
      const current = findDesignerComponent(document, id);
      replacements.set(id, { ...current, bounds: previous.bounds, props: previous.props });
    }
    return replaceComponentNodes(document, replacements);
  }
}
