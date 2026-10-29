import { resolveInspectorLayoutProperty } from '@webrad/component-registry';
import {
  ChangeLayoutPropertyCommand,
  ChangePropertyCommand,
  CommandHistory,
  copyComponents,
  PasteComponentsCommand,
  RenameComponentCommand,
  ResizeCommand,
  type Command,
  type DesignerClipboardData,
} from '@webrad/designer';
import {
  bindComponentEvent,
  getComponent,
  parseVisualDocument,
  serializeVisualDocument,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';
import type { ComponentPropertyDefinition } from '@webrad/component-registry';
import { responsiveLayoutPropertyReference } from '../layout-property';
import { CanonicalDesignerCommand } from './canonical-designer-command';

class BindEventCommand implements Command<PageModel> {
  public readonly label = 'Bind event';
  readonly #componentId: string;
  readonly #eventName: string;
  readonly #handlerName: string | null;
  #previous: string | null | undefined;

  public constructor(componentId: string, eventName: string, handlerName: string | null) {
    this.#componentId = componentId;
    this.#eventName = eventName;
    this.#handlerName = handlerName;
  }

  public execute(page: PageModel): PageModel {
    const component = getComponent(page, this.#componentId);
    this.#previous ??= component.events[this.#eventName];
    return bindComponentEvent(page, this.#componentId, this.#eventName, this.#handlerName);
  }

  public undo(page: PageModel): PageModel {
    return bindComponentEvent(page, this.#componentId, this.#eventName, this.#previous ?? null);
  }
}

function componentWithStyle(
  component: ComponentNode,
  styleId: string | null | undefined,
): ComponentNode {
  if (styleId === null || styleId === undefined) {
    const componentWithoutStyle = { ...component };
    delete componentWithoutStyle.styleId;
    return componentWithoutStyle;
  }
  return { ...component, styleId };
}

class ChangeStyleCommand implements Command<PageModel> {
  public readonly label = 'Change component style';
  readonly #componentIds: ReadonlySet<string>;
  readonly #styleId: string | null;
  #previous: ReadonlyMap<string, string | undefined> | null = null;

  public constructor(componentIds: readonly string[], styleId: string | null) {
    this.#componentIds = new Set(componentIds);
    this.#styleId = styleId;
  }

  public execute(page: PageModel): PageModel {
    this.#previous ??= new Map(
      page.components
        .filter((component) => this.#componentIds.has(component.id))
        .map((component) => [component.id, component.styleId] as const),
    );
    return this.#apply(page, () => this.#styleId);
  }

  public undo(page: PageModel): PageModel {
    if (this.#previous === null) throw new Error('Style command has not executed.');
    return this.#apply(page, (component) => this.#previous?.get(component.id));
  }

  #apply(
    page: PageModel,
    resolveStyleId: (component: ComponentNode) => string | null | undefined,
  ): PageModel {
    return parseVisualDocument({
      ...page,
      components: page.components.map((component) =>
        this.#componentIds.has(component.id)
          ? componentWithStyle(component, resolveStyleId(component))
          : component,
      ),
    });
  }
}

class ChangeRootPropertyCommand implements Command<PageModel> {
  public readonly label = 'Change page root property';
  readonly #propertyName: 'caption' | 'width' | 'height';
  readonly #value: unknown;
  #previous: unknown;
  #executed = false;

  public constructor(propertyName: 'caption' | 'width' | 'height', value: unknown) {
    this.#propertyName = propertyName;
    this.#value = value;
  }

  public execute(page: PageModel): PageModel {
    const root = getComponent(page, page.rootComponentId);
    if (!this.#executed) {
      this.#previous =
        this.#propertyName === 'width' || this.#propertyName === 'height'
          ? page[this.#propertyName]
          : root.props[this.#propertyName];
      this.#executed = true;
    }
    return this.#apply(page, this.#value);
  }

  public undo(page: PageModel): PageModel {
    if (!this.#executed) throw new Error('Page root property command has not executed.');
    return this.#apply(page, this.#previous);
  }

  #apply(page: PageModel, value: unknown): PageModel {
    const root = getComponent(page, page.rootComponentId);
    if (
      (this.#propertyName === 'width' || this.#propertyName === 'height') &&
      typeof value === 'number'
    ) {
      const components = page.components.map((component) =>
        component.id === root.id
          ? { ...component, bounds: { ...component.bounds, [this.#propertyName]: value } }
          : component,
      );
      return parseVisualDocument({ ...page, [this.#propertyName]: value, components });
    }
    const components = page.components.map((component) =>
      component.id === root.id
        ? { ...component, props: { ...component.props, [this.#propertyName]: value } }
        : component,
    );
    return parseVisualDocument({
      ...page,
      caption: this.#propertyName === 'caption' && typeof value === 'string' ? value : page.caption,
      components,
    });
  }
}

export interface PasteResult {
  readonly page: PageModel;
  readonly selectedIds: readonly string[];
}

interface DesignerHistory {
  readonly history: CommandHistory<PageModel>;
  comparedPage: PageModel;
  comparedState: PageModel;
}

export class DesignerController {
  readonly #histories = new Map<string, DesignerHistory>();
  #clipboard: DesignerClipboardData | null = null;

  public constructor(private readonly normalizeDocument?: (page: PageModel) => PageModel) {}

  public synchronize(page: PageModel): CommandHistory<PageModel> {
    const current = this.#histories.get(page.id);
    if (!current) {
      const created = new CommandHistory(page, { maxEntries: 250 });
      this.#histories.set(page.id, { history: created, comparedPage: page, comparedState: page });
      return created;
    }
    const history = current.history;
    // Validated Project Model projections are immutable. Compare a new projection
    // once, then reuse that result until either the model or history changes.
    if (current.comparedPage === page && current.comparedState === history.state) return history;
    if (
      history.state !== page &&
      serializeVisualDocument(history.state) !== serializeVisualDocument(page)
    ) {
      history.reset(page);
    }
    current.comparedPage = page;
    current.comparedState = history.state;
    return history;
  }

  public execute(page: PageModel, command: Command<PageModel>): PageModel {
    return this.synchronize(page).execute(this.canonicalCommand(command));
  }

  private canonicalCommand(command: Command<PageModel>): Command<PageModel> {
    return this.normalizeDocument
      ? new CanonicalDesignerCommand(command, this.normalizeDocument)
      : command;
  }

  public executeMany(
    page: PageModel,
    label: string,
    commands: readonly Command<PageModel>[],
  ): PageModel {
    const history = this.synchronize(page);
    history.runTransaction(label, () => {
      commands.forEach((command) => history.execute(this.canonicalCommand(command)));
    });
    return history.state;
  }

  public undo(page: PageModel): PageModel {
    return this.synchronize(page).undo();
  }

  public redo(page: PageModel): PageModel {
    return this.synchronize(page).redo();
  }

  public canUndo(page: PageModel): boolean {
    return this.synchronize(page).canUndo;
  }

  public canRedo(page: PageModel): boolean {
    return this.synchronize(page).canRedo;
  }

  public copy(page: PageModel, selectedIds: readonly string[]): void {
    this.#clipboard = copyComponents(page, selectedIds);
  }

  public paste(
    page: PageModel,
    parentId = page.rootComponentId,
    gridSize = 8,
    snapToGrid = true,
  ): PasteResult {
    if (!this.#clipboard) return { page, selectedIds: [] };
    const command = new PasteComponentsCommand(this.#clipboard, {
      parentId,
      gridSize,
      snapToGrid,
    });
    const next = this.execute(page, command);
    return { page: next, selectedIds: command.pastedRootIds };
  }

  public changeProperty(
    page: PageModel,
    selected: readonly ComponentNode[],
    property: ComponentPropertyDefinition,
    value: unknown,
  ): PageModel {
    if (selected.length === 0) return page;
    const ids = selected.map((component) => component.id);
    if (selected.length === 1 && selected[0]?.id === page.rootComponentId) {
      if (property.name === 'caption' || property.name === 'width' || property.name === 'height') {
        return this.execute(page, new ChangeRootPropertyCommand(property.name, value));
      }
      if (property.source === 'bounds') return page;
    }
    if (property.source === 'node' && property.name === 'name') {
      if (selected.length !== 1 || typeof value !== 'string') return page;
      return this.execute(page, new RenameComponentCommand(selected[0]?.id ?? '', value));
    }
    if (property.source === 'bounds') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return page;
      return this.executeMany(
        page,
        `Change ${property.label ?? property.name}`,
        selected.map(
          (component) =>
            new ResizeCommand(component.id, { ...component.bounds, [property.name]: value }),
        ),
      );
    }
    if (property.source === 'layout-container' || property.source === 'layout-item') {
      const changes = selected.flatMap((component): Command<PageModel>[] => {
        const resolved = resolveInspectorLayoutProperty(
          property,
          component,
          page.components.find((node) => node.id === component.parentId)?.layout.container.mode,
        );
        if (resolved.readOnly) return [];
        const reference = responsiveLayoutPropertyReference(resolved);
        if (!reference) return [];
        if (reference.target === 'bounds') {
          if (typeof value !== 'number' || !Number.isFinite(value)) return [];
          return [
            new ResizeCommand(component.id, { ...component.bounds, [reference.field]: value }),
          ];
        }
        return [
          new ChangeLayoutPropertyCommand([component.id], reference.target, reference.field, value),
        ];
      });
      return this.executeMany(page, `Change ${property.label ?? property.name}`, changes);
    }
    return this.execute(page, new ChangePropertyCommand(ids, property.name, value));
  }

  public bindEvent(
    page: PageModel,
    componentId: string,
    eventName: string,
    handlerName: string | null,
  ): PageModel {
    if ((getComponent(page, componentId).events[eventName] ?? null) === handlerName) return page;
    return this.execute(page, new BindEventCommand(componentId, eventName, handlerName));
  }

  public bindEvents(
    page: PageModel,
    componentIds: readonly string[],
    eventName: string,
    handlerName: string | null,
  ): PageModel {
    const commands = [...new Set(componentIds)]
      .filter((id) => (getComponent(page, id).events[eventName] ?? null) !== handlerName)
      .map((id) => new BindEventCommand(id, eventName, handlerName));
    return commands.length === 0
      ? page
      : this.executeMany(page, 'Bind selected component events', commands);
  }

  public changeStyle(
    page: PageModel,
    selected: readonly ComponentNode[],
    styleId: string | null,
  ): PageModel {
    if (selected.length === 0) return page;
    return this.execute(
      page,
      new ChangeStyleCommand(
        selected.map((component) => component.id),
        styleId,
      ),
    );
  }

  public clear(): void {
    this.#histories.clear();
    this.#clipboard = null;
  }
}
