import {
  comboBoxSchemaChoices,
  normalizeApiClientConfiguration,
  type ApiClientSchemaNode,
  type ComponentNode,
} from '@webrad/project-model';

export interface ReportFieldChoice {
  readonly path: string;
  readonly label: string;
}

/** Response fields deliberately stop at arrays: row scope is established by a repeater. */
export function reportResponseFields(root: ApiClientSchemaNode | undefined): ReportFieldChoice[] {
  const fields: ReportFieldChoice[] = [];
  const visit = (node: ApiClientSchemaNode): void => {
    if (node.kind === 'list') return;
    if (node.kind === 'field') fields.push({ path: node.path, label: node.path || 'Response' });
    node.children.forEach(visit);
  };
  if (root !== undefined) visit(root);
  return fields;
}

export function reportApiSource(
  components: readonly ComponentNode[],
  apiClientId: string,
  operationId: string,
  listPath = '',
) {
  const client = components.find(
    (item) =>
      (item.id === apiClientId || item.name === apiClientId) && item.type === 'WebApiClient',
  );
  const configuration =
    client === undefined
      ? undefined
      : normalizeApiClientConfiguration(client.props.apiClientConfig);
  const operation = configuration?.operations.find(
    (item) => item.id === operationId || item.name === operationId,
  );
  const choices = comboBoxSchemaChoices(operation?.responseSchema, listPath);
  return {
    clients: components.filter((item) => item.type === 'WebApiClient'),
    client,
    configuration,
    operation,
    lists: choices.lists,
    rowFields: choices.fields,
    fields: reportResponseFields(operation?.responseSchema?.root),
  };
}
