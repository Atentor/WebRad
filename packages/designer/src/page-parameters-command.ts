import {
  PageParametersSchema,
  parsePage,
  type PageModel,
  type PageParameterDefinition,
} from '@webrad/project-model';
import type { Command } from './command-history.js';

export class ChangePageParametersCommand implements Command<PageModel> {
  public readonly label = 'Configure page parameters';
  readonly #parameters: readonly PageParameterDefinition[];
  #previous: PageModel['parameters'];
  #captured = false;

  public constructor(parameters: readonly PageParameterDefinition[]) {
    this.#parameters = PageParametersSchema.parse(parameters);
  }

  public execute(page: PageModel): PageModel {
    if (!this.#captured) {
      this.#previous = page.parameters;
      this.#captured = true;
    }
    return parsePage({ ...page, parameters: this.#parameters });
  }

  public undo(page: PageModel): PageModel {
    const previous = { ...page };
    if (this.#previous === undefined) delete previous.parameters;
    else previous.parameters = this.#previous;
    return parsePage(previous);
  }
}
