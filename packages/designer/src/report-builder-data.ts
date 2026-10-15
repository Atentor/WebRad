import {
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
  const lists: ReportFieldChoice[] = [];
  const rowLists: ReportFieldChoice[] = [];
  const rowFields: ReportFieldChoice[] = [];
  let selected: ApiClientSchemaNode | undefined;
  const visit = (node: ApiClientSchemaNode): void => {
    if (node.kind === 'list') {
      if (!node.path.includes('/*'))
        lists.push({ path: node.path, label: node.path || 'Response' });
      if (node.path === listPath) selected = node;
    }
    node.children.forEach(visit);
  };
  if (operation?.responseSchema !== null && operation?.responseSchema !== undefined)
    visit(operation.responseSchema.root);
  const prefix = `${listPath}/*`;
  const collect = (node: ApiClientSchemaNode): void => {
    if (!node.path.startsWith(prefix)) return;
    const path = node.path.slice(prefix.length);
    if (node.kind === 'list') {
      rowLists.push({ path, label: path || 'Row value' });
      return;
    }
    if (
      node.kind === 'field' &&
      ['string', 'number', 'integer', 'boolean', 'date', 'datetime'].includes(node.fieldType)
    )
      rowFields.push({ path, label: path || 'Row value' });
    node.children.forEach(collect);
  };
  selected?.children.forEach(collect);
  return {
    clients: components.filter((item) => item.type === 'WebApiClient'),
    client,
    configuration,
    operation,
    lists,
    rowLists,
    listExists: selected !== undefined,
    rowFields,
    fields: reportResponseFields(operation?.responseSchema?.root),
  };
}
