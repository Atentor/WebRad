import {
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
  parseForm,
  serializeForm,
  type ComponentNode,
  type FormModel,
} from '@webrad/project-model';
import type { ComponentPropertyDefinition } from '@webrad/component-registry';

class BindEventCommand implements Command<FormModel> {
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

  public execute(form: FormModel): FormModel {
    const component = getComponent(form, this.#componentId);
    this.#previous ??= component.events[this.#eventName];
    return bindComponentEvent(form, this.#componentId, this.#eventName, this.#handlerName);
  }

  public undo(form: FormModel): FormModel {
    return bindComponentEvent(form, this.#componentId, this.#eventName, this.#previous ?? null);
  }
}

class ChangeFormPropertyCommand implements Command<FormModel> {
  public readonly label = 'Change form property';
  readonly #property: 'layoutMode' | 'caption' | 'width' | 'height';
  readonly #value: FormModel['layoutMode' | 'caption' | 'width' | 'height'];
  #previous: FormModel['layoutMode' | 'caption' | 'width' | 'height'] | undefined;

  public constructor(
    property: 'layoutMode' | 'caption' | 'width' | 'height',
    value: FormModel['layoutMode' | 'caption' | 'width' | 'height'],
  ) {
    this.#property = property;
    this.#value = value;
  }

  public execute(form: FormModel): FormModel {
    this.#previous ??= form[this.#property];
    return parseForm({ ...form, [this.#property]: this.#value });
  }

  public undo(form: FormModel): FormModel {
    if (this.#previous === undefined) throw new Error('Form property command has not executed.');
    return parseForm({ ...form, [this.#property]: this.#previous });
  }
}

class ChangeRootPropertyCommand implements Command<FormModel> {
  public readonly label = 'Change form root property';
  readonly #propertyName: string;
  readonly #value: unknown;
  #previous: unknown;
  #executed = false;

  public constructor(propertyName: string, value: unknown) {
    this.#propertyName = propertyName;
    this.#value = value;
  }

  public execute(form: FormModel): FormModel {
    const root = getComponent(form, form.rootComponentId);
    if (!this.#executed) {
      this.#previous =
        this.#propertyName === 'width' || this.#propertyName === 'height'
          ? form[this.#propertyName]
          : root.props[this.#propertyName];
      this.#executed = true;
    }
    return this.#apply(form, this.#value);
  }

  public undo(form: FormModel): FormModel {
    if (!this.#executed) throw new Error('Form root property command has not executed.');
    return this.#apply(form, this.#previous);
  }

  #apply(form: FormModel, value: unknown): FormModel {
    const root = getComponent(form, form.rootComponentId);
    if (
      (this.#propertyName === 'width' || this.#propertyName === 'height') &&
      typeof value === 'number'
    ) {
      const components = form.components.map((component) =>
        component.id === root.id
          ? { ...component, bounds: { ...component.bounds, [this.#propertyName]: value } }
          : component,
      );
      return parseForm({ ...form, [this.#propertyName]: value, components });
    }
    const components = form.components.map((component) =>
      component.id === root.id
        ? { ...component, props: { ...component.props, [this.#propertyName]: value } }
        : component,
    );
    return parseForm({
      ...form,
      caption: this.#propertyName === 'caption' && typeof value === 'string' ? value : form.caption,
      components,
    });
  }
}

export interface PasteResult {
  readonly form: FormModel;
  readonly selectedIds: readonly string[];
}

export class DesignerController {
  readonly #histories = new Map<string, CommandHistory<FormModel>>();
  #clipboard: DesignerClipboardData | null = null;

  public synchronize(form: FormModel): CommandHistory<FormModel> {
    const current = this.#histories.get(form.id);
    if (!current) {
      const created = new CommandHistory(form, { maxEntries: 250 });
      this.#histories.set(form.id, created);
      return created;
    }
    if (current.state !== form && serializeForm(current.state) !== serializeForm(form)) {
      current.reset(form);
    }
    return current;
  }

  public execute(form: FormModel, command: Command<FormModel>): FormModel {
    return this.synchronize(form).execute(command);
  }

  public executeMany(
    form: FormModel,
    label: string,
    commands: readonly Command<FormModel>[],
  ): FormModel {
    const history = this.synchronize(form);
    history.runTransaction(label, () => {
      commands.forEach((command) => history.execute(command));
    });
    return history.state;
  }

  public undo(form: FormModel): FormModel {
    return this.synchronize(form).undo();
  }

  public redo(form: FormModel): FormModel {
    return this.synchronize(form).redo();
  }

  public canUndo(form: FormModel): boolean {
    return this.synchronize(form).canUndo;
  }

  public canRedo(form: FormModel): boolean {
    return this.synchronize(form).canRedo;
  }

  public copy(form: FormModel, selectedIds: readonly string[]): void {
    this.#clipboard = copyComponents(form, selectedIds);
  }

  public paste(
    form: FormModel,
    parentId = form.rootComponentId,
    gridSize = 8,
    snapToGrid = true,
  ): PasteResult {
    if (!this.#clipboard) return { form, selectedIds: [] };
    const command = new PasteComponentsCommand(this.#clipboard, {
      parentId,
      gridSize,
      snapToGrid,
    });
    const next = this.execute(form, command);
    return { form: next, selectedIds: command.pastedRootIds };
  }

  public changeProperty(
    form: FormModel,
    selected: readonly ComponentNode[],
    property: ComponentPropertyDefinition,
    value: unknown,
  ): FormModel {
    if (selected.length === 0) return form;
    const ids = selected.map((component) => component.id);
    if (selected.length === 1 && selected[0]?.id === form.rootComponentId) {
      if (property.name === 'caption' || property.name === 'width' || property.name === 'height') {
        return this.execute(form, new ChangeRootPropertyCommand(property.name, value));
      }
      if (property.source === 'bounds') return form;
    }
    if (property.source === 'node' && property.name === 'name') {
      if (selected.length !== 1 || typeof value !== 'string') return form;
      return this.execute(form, new RenameComponentCommand(selected[0]?.id ?? '', value));
    }
    if (property.source === 'bounds') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return form;
      return this.executeMany(
        form,
        `Change ${property.label ?? property.name}`,
        selected.map(
          (component) =>
            new ResizeCommand(component.id, { ...component.bounds, [property.name]: value }),
        ),
      );
    }
    if (property.source === 'form') {
      const supported = new Set(['layoutMode', 'caption', 'width', 'height']);
      if (!supported.has(property.name)) return form;
      return this.execute(
        form,
        new ChangeFormPropertyCommand(
          property.name as 'layoutMode' | 'caption' | 'width' | 'height',
          value as FormModel['layoutMode'],
        ),
      );
    }
    return this.execute(form, new ChangePropertyCommand(ids, property.name, value));
  }

  public bindEvent(
    form: FormModel,
    componentId: string,
    eventName: string,
    handlerName: string | null,
  ): FormModel {
    return this.execute(form, new BindEventCommand(componentId, eventName, handlerName));
  }

  public clear(): void {
    this.#histories.clear();
    this.#clipboard = null;
  }
}
