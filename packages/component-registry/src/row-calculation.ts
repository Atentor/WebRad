import type {
  ComponentDefinition,
  ComponentEventDefinition,
  ComponentLayoutContext,
  RegisteredComponentNode,
  RegisteredVisualDocument,
} from './types.js';

const documentIndexes = new WeakMap<
  RegisteredVisualDocument,
  {
    readonly components: readonly RegisteredComponentNode[];
    readonly byId: ReadonlyMap<string, RegisteredComponentNode>;
  }
>();

/** The closest repeated template supplies the row context for this placement. */
export function hasRepeatingRowContext(
  node: RegisteredComponentNode,
  context?: ComponentLayoutContext,
): boolean {
  const document = context?.document;
  if (document === undefined) return false;
  let index = documentIndexes.get(document);
  if (index === undefined || index.components !== document.components) {
    index = {
      components: document.components,
      byId: new Map(document.components.map((component) => [component.id, component])),
    };
    documentIndexes.set(document, index);
  }
  const visited = new Set<string>();
  let current: RegisteredComponentNode | undefined = node;
  while (current?.parentId != null && !visited.has(current.id)) {
    visited.add(current.id);
    current = index.byId.get(current.parentId);
    if (current?.type === 'WebRepeatingGroup') return true;
  }
  return false;
}

/** Adds the shared, context-only interaction without changing default event bindings. */
export function withRepeatingRowCalculation(definition: ComponentDefinition): ComponentDefinition {
  if (
    !definition.visual ||
    definition.contextualEvents?.some((event) => event.name === 'OnCalcRow')
  )
    return definition;
  const kind = definition.rowCalculationValue?.kind;
  const detailType =
    kind === 'string'
      ? 'WebRepeatingGroupCalcRowStringEventDetail'
      : kind === 'number'
        ? 'WebRepeatingGroupCalcRowNumberEventDetail'
        : kind === 'boolean'
          ? 'WebRepeatingGroupCalcRowBooleanEventDetail'
          : kind === 'icon'
            ? 'WebRepeatingGroupCalcRowIconEventDetail'
            : 'WebRepeatingGroupCalcRowEventDetail';
  const calculation: ComponentEventDefinition = Object.freeze({
    name: 'OnCalcRow',
    label: 'OnCalcRow',
    category: 'Data',
    description: 'Calculate this component after its repeated row bindings are applied.',
    eventType: 'Event',
    eventDetailType: detailType,
    eventDetailProperties: Object.freeze(
      kind === undefined ? ['rowIndex'] : ['rowIndex', 'value', 'setValue'],
    ),
    async: false,
    requiredContext: 'repeating-row',
  });
  const baseEvents = Object.freeze(
    definition.events.map((event) =>
      Object.freeze({
        ...event,
        ...(event.eventDetailProperties === undefined
          ? {}
          : { eventDetailProperties: Object.freeze([...event.eventDetailProperties]) }),
      }),
    ),
  );
  const resolveBaseEvents = definition.eventsForNode;
  return {
    ...definition,
    contextualEvents: [...(definition.contextualEvents ?? []), calculation],
    eventsForNode: (node, context) => {
      const events = resolveBaseEvents?.(node, context) ?? baseEvents;
      // Keep an assigned event editable after a component is moved out of a row.
      return hasRepeatingRowContext(node, context) || node.events[calculation.name] != null
        ? [...events, calculation]
        : events;
    },
  };
}
