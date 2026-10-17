import {
  componentRegistry,
  isCurrentRowFieldCompatible,
  type ComponentPropertyDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import {
  comboBoxSchemaChoices,
  normalizeApiClientConfiguration,
  normalizeRepeatingGroupConfiguration,
  type ApiClientSchemaNode,
  type ComponentNode,
  type RepeatingGroupConfiguration,
} from '@webrad/project-model';

/** The nearest registered row template establishes the current row scope. */
export function currentRowGroup(
  component: ComponentNode,
  components: readonly ComponentNode[],
  registry: ComponentRegistry = componentRegistry,
): ComponentNode | undefined {
  const byId = new Map(components.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>([component.id]);
  let parent = component.parentId === null ? undefined : byId.get(component.parentId);
  while (parent !== undefined && !seen.has(parent.id)) {
    if (registry.get(parent.type)?.designerChildHost === 'repeating-row') return parent;
    seen.add(parent.id);
    parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
  }
  return undefined;
}

export interface CurrentRowFieldChoice {
  readonly path: string;
  readonly label: string;
  readonly fieldType: ApiClientSchemaNode['fieldType'];
}

export function repeatingGroupSource(
  components: readonly ComponentNode[],
  configuration: RepeatingGroupConfiguration,
) {
  const client = components.find((candidate) => candidate.id === configuration.apiClientId);
  const apiConfiguration =
    client?.type === 'WebApiClient'
      ? normalizeApiClientConfiguration(client.props.apiClientConfig)
      : undefined;
  const operation = apiConfiguration?.operations.find(
    (candidate) => candidate.id === configuration.operationId,
  );
  const choices = comboBoxSchemaChoices(operation?.responseSchema, configuration.listPath);
  const prefix = `${configuration.listPath}/*`;
  const fieldTypes = new Map<string, ApiClientSchemaNode['fieldType']>();
  const visit = (node: ApiClientSchemaNode): void => {
    if (node.kind === 'field' && (node.path === prefix || node.path.startsWith(`${prefix}/`))) {
      fieldTypes.set(node.path.slice(prefix.length), node.fieldType);
    }
    node.children.forEach(visit);
  };
  if (operation?.responseSchema != null) visit(operation.responseSchema.root);
  const fields: readonly CurrentRowFieldChoice[] = choices.fields.map((choice) => ({
    ...choice,
    fieldType: fieldTypes.get(choice.path) ?? 'string',
  }));
  return { client, apiConfiguration, operation, lists: choices.lists, fields };
}

export function currentRowFields(
  group: ComponentNode,
  components: readonly ComponentNode[],
): readonly CurrentRowFieldChoice[] {
  return repeatingGroupSource(
    components,
    normalizeRepeatingGroupConfiguration(group.props.repeatingGroupConfig),
  ).fields;
}

export function compatibleCurrentRowField(
  property: ComponentPropertyDefinition,
  field: CurrentRowFieldChoice,
): boolean {
  return isCurrentRowFieldCompatible(property, field.fieldType);
}
