import type { Command } from '@webrad/designer';
import type { ComponentNode, PageModel } from '@webrad/project-model';
import type { CodexProposal } from '../../../shared/codex-contracts';
import type { ProjectController } from './project-controller';
import { componentRegistry } from '@webrad/component-registry';

interface NodeDelta {
  readonly node: ComponentNode;
  readonly index: number;
}

/** One reversible command, retaining only changed nodes, source and new styles. */
export class CodexProjectCommand implements Command<PageModel> {
  public readonly label = 'Apply Codex proposal';
  readonly #before: readonly NodeDelta[];
  readonly #after: readonly NodeDelta[];
  readonly #affected: ReadonlySet<string>;
  readonly #beforeMetadata: Partial<Pick<PageModel, 'width' | 'height' | 'caption'>>;
  readonly #afterMetadata: Partial<Pick<PageModel, 'width' | 'height' | 'caption'>>;
  #state: 'new' | 'applied' | 'undone' = 'new';

  public constructor(
    before: PageModel,
    private readonly proposal: CodexProposal,
    private readonly controller: ProjectController,
  ) {
    if (before.id !== proposal.documentId || proposal.page.id !== before.id || proposal.page.rootComponentId !== before.rootComponentId || proposal.page.name !== before.name) {
      throw new Error('The Codex proposal cannot replace a different document or its identity.');
    }
    const beforeNodes = new Map(before.components.map((node) => [node.id, node]));
    const afterNodes = new Map(proposal.page.components.map((node) => [node.id, node]));
    this.#affected = new Set([...beforeNodes.keys(), ...afterNodes.keys()].filter((id) => JSON.stringify(beforeNodes.get(id)) !== JSON.stringify(afterNodes.get(id))));
    this.#before = before.components.flatMap((node, index) => this.#affected.has(node.id) ? [{ node, index }] : []);
    this.#after = proposal.page.components.flatMap((node, index) => this.#affected.has(node.id) ? [{ node, index }] : []);
    this.#beforeMetadata = {};
    this.#afterMetadata = {};
    for (const key of ['width', 'height', 'caption'] as const) {
      if (before[key] !== proposal.page[key]) {
        Object.assign(this.#beforeMetadata, { [key]: before[key] });
        Object.assign(this.#afterMetadata, { [key]: proposal.page[key] });
      }
    }
  }

  public execute(page: PageModel): PageModel {
    if (this.#state === 'applied') throw new Error('This Codex proposal has already been applied.');
    if (this.#state === 'new' && this.controller.getSnapshot().revision !== this.proposal.baseRevision) {
      throw new Error('The project changed after this Codex proposal was prepared. Review a new proposal before applying.');
    }
    const result = this.#apply(page, false);
    this.#state = 'applied';
    return result;
  }

  public undo(page: PageModel): PageModel {
    if (this.#state !== 'applied') throw new Error('This Codex proposal has no applied change to undo.');
    const result = this.#apply(page, true);
    this.#state = 'undone';
    return result;
  }

  #apply(page: PageModel, undo: boolean): PageModel {
    const snapshot = this.controller.getSnapshot();
    const project = snapshot.project;
    if (!project || project.id !== this.proposal.projectId) throw new Error('The Codex proposal belongs to a different project.');
    if (page.id !== this.proposal.documentId) throw new Error('The active document does not match this Codex proposal.');
    const hasSourceEdit = this.proposal.sourceBefore !== this.proposal.sourceAfter;
    const expectedSource = undo ? this.proposal.sourceAfter : this.proposal.sourceBefore;
    if (hasSourceEdit && snapshot.userSources[this.proposal.sourcePath] !== expectedSource) {
      throw new Error('This method was edited after the Codex change. Restore that edit before undoing or redoing this proposal.');
    }
    const expected = undo ? this.#after : this.#before;
    const expectedNodes = new Map(expected.map((delta) => [delta.node.id, delta.node]));
    for (const id of this.#affected) {
      if (JSON.stringify(page.components.find((node) => node.id === id)) !== JSON.stringify(expectedNodes.get(id))) {
        throw new Error('The affected components changed. Undo those edits before this Codex proposal.');
      }
    }
    const expectedMetadata = undo ? this.#afterMetadata : this.#beforeMetadata;
    for (const key of ['width', 'height', 'caption'] as const) {
      if (Object.hasOwn(expectedMetadata, key) && page[key] !== expectedMetadata[key]) {
        throw new Error('The document settings changed after this Codex proposal. Restore those edits before undoing or redoing it.');
      }
    }
    const styleIds = new Set(this.proposal.styles.map((style) => style.id));
    const nodes = page.components.filter((node) => !this.#affected.has(node.id));
    for (const delta of undo ? this.#before : this.#after) nodes.splice(delta.index, 0, delta.node);
    if (undo) {
      for (const style of this.proposal.styles) {
        if (JSON.stringify(project.styles.find((item) => item.id === style.id)) !== JSON.stringify(style)) {
          throw new Error('A style created by Codex was edited. Restore it before undoing this proposal.');
        }
      }
      const stillReferenced = [...project.pages, ...project.reusableElements, ...(project.menus ?? [])]
        .some((document) => (document.id === page.id ? nodes : document.components).some((node) => {
          if (node.styleId && styleIds.has(node.styleId)) return true;
          const embedded = componentRegistry.get(node.type)?.embeddedStyles;
          if (!embedded) return false;
          let value: unknown = node.props;
          for (const key of embedded.propertyPath) {
            if (!value || typeof value !== 'object') return false;
            value = Reflect.get(value, key);
          }
          return !!value && typeof value === 'object' && Object.values(value).some((id: unknown) => typeof id === 'string' && styleIds.has(id));
        }));
      if (stillReferenced) throw new Error('A style from this proposal is now used by another component. Remove that binding before undoing.');
    } else if (project.styles.some((style) => styleIds.has(style.id))) {
      throw new Error('A style in this proposal already exists. Refresh the proposal before applying it.');
    }
    return this.controller.commitDocumentChanges(
      { ...page, ...(undo ? this.#beforeMetadata : this.#afterMetadata), components: nodes },
      this.proposal.documentKind,
      hasSourceEdit ? { [this.proposal.sourcePath]: undo ? this.proposal.sourceBefore : this.proposal.sourceAfter } : {},
      undo ? [] : this.proposal.styles,
      undo ? styleIds : new Set<string>(),
    );
  }
}
