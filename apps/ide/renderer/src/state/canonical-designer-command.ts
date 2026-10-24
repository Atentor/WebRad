import type { Command } from '@webrad/designer';
import type { ComponentNode, PageModel } from '@webrad/project-model';

type DocumentMetadata = Pick<PageModel, 'name' | 'caption' | 'width' | 'height'>;

/** Keep model normalization inside the command and retain only its inverse deltas. */
export class CanonicalDesignerCommand implements Command<PageModel> {
  #components = new Map<string, ComponentNode>();
  #metadata: Partial<DocumentMetadata> = {};

  public constructor(
    private readonly command: Command<PageModel>,
    private readonly normalize: (document: PageModel) => PageModel,
  ) {}

  public get label(): string | undefined {
    return this.command.label;
  }

  public execute(document: PageModel): PageModel {
    const next = this.command.execute(document);
    const canonical = this.normalize(next);
    const normalizedNodes = new Map(canonical.components.map((node) => [node.id, node]));
    this.#components = new Map(
      next.components
        .filter((node) => JSON.stringify(node) !== JSON.stringify(normalizedNodes.get(node.id)))
        .map((node) => [node.id, node]),
    );
    const metadata: DocumentMetadata = {
      name: next.name,
      caption: next.caption,
      width: next.width,
      height: next.height,
    };
    this.#metadata = Object.fromEntries(
      Object.entries(metadata).filter(
        ([key, value]) => value !== canonical[key as keyof DocumentMetadata],
      ),
    );
    return canonical;
  }

  public undo(document: PageModel): PageModel {
    const beforeNormalization: PageModel = {
      ...document,
      ...this.#metadata,
      components: document.components.map((node) => this.#components.get(node.id) ?? node),
    };
    return this.normalize(this.command.undo(beforeNormalization));
  }
}
