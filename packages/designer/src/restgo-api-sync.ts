import { getApiClientTemplateParameters, resolveApiClientBodyTemplate } from '@webrad/runtime';
import {
  parseApiClientConfiguration,
  type ApiClientConfiguration,
  type ApiClientOperation,
  type ApiClientRequestBody,
} from '@webrad/project-model';
import {
  getRestGoPublishedApiConnection,
  importRestGoPublishedApis,
  type RestGoPublishedApi,
} from './restgo-api-import.js';

/** Stable identity emitted by the importer before explicit source metadata was introduced. */
export function restGoImportedOperationId(apiId: string): string {
  return `restgo-${apiId.replace(/[^A-Za-z0-9_-]/gu, '-')}`.slice(0, 160);
}

/** Reads top-level JSON fields without changing nested values or authored <parameter> tokens. */
function jsonFields(content: string): Map<string, string> {
  const text = content.trim();
  if (!text.startsWith('{') || !text.endsWith('}'))
    throw new Error('The imported request body must be a JSON object to synchronize its inputs.');
  const fields = new Map<string, string>();
  let position = 1;
  const whitespace = (): void => {
    while (/\s/u.test(text[position] ?? '') && position < text.length) position++;
  };
  const quoted = (): string => {
    const start = position++;
    if (text[start] !== '"') throw new Error('Invalid JSON field in the imported request body.');
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') position++;
      else if (character === '"') return text.slice(start, position);
    }
    throw new Error('Unterminated string in the imported request body.');
  };
  whitespace();
  while (position < text.length - 1) {
    const key: unknown = JSON.parse(quoted());
    if (typeof key !== 'string') throw new Error('Invalid JSON request field.');
    whitespace();
    if (text[position++] !== ':') throw new Error('Invalid JSON request field separator.');
    whitespace();
    const start = position;
    let depth = 0;
    while (position < text.length - 1) {
      const character = text[position];
      if (character === '"') {
        quoted();
        continue;
      }
      if (character === '{' || character === '[') depth++;
      if (character === '}' || character === ']') depth--;
      if (character === ',' && depth === 0) break;
      position++;
    }
    const value = text.slice(start, position).trim();
    if (!value || depth !== 0) throw new Error('Invalid JSON request field value.');
    fields.set(key, value);
    if (position < text.length - 1) {
      position++;
      whitespace();
    }
  }
  return fields;
}

function mergeBody(
  operation: ApiClientOperation,
  generated: ApiClientOperation,
  previousNames: ReadonlySet<string>,
): ApiClientRequestBody {
  if (generated.method === 'GET' || generated.method === 'HEAD') return generated.body;
  if (operation.body.kind === 'none') return generated.body;
  if (operation.body.kind !== 'json')
    throw new Error(`Request ${operation.name} uses a custom body. Update its inputs manually.`);
  resolveApiClientBodyTemplate(
    operation.body,
    Object.fromEntries(
      getApiClientTemplateParameters(operation.body.content, operation.body.parameters).map(
        (parameter) => [
          parameter.name,
          parameter.type === 'string'
            ? ''
            : parameter.type === 'boolean'
              ? false
              : parameter.type === 'array'
                ? []
                : parameter.type === 'object'
                  ? {}
                  : parameter.type === 'null'
                    ? null
                    : 0,
        ],
      ),
    ),
  );
  const fields = jsonFields(operation.body.content);
  const desired =
    generated.body.kind === 'none' ? new Map<string, string>() : jsonFields(generated.body.content);
  for (const name of previousNames) if (!desired.has(name)) fields.delete(name);
  for (const [name, value] of desired) if (!fields.has(name)) fields.set(name, value);
  // Keep the original layout byte-for-byte when no fields changed.
  const original = jsonFields(operation.body.content);
  if (JSON.stringify([...original]) === JSON.stringify([...fields])) return operation.body;
  const content = `{\n${[...fields].map(([name, value]) => `  ${JSON.stringify(name)}: ${value}`).join(',\n')}\n}`;
  const parameters = getApiClientTemplateParameters(content, operation.body.parameters);
  return { ...operation.body, content, ...(operation.body.parameters ? { parameters } : {}) };
}

function synchronizeOperation(
  operation: ApiClientOperation,
  api: RestGoPublishedApi,
): ApiClientOperation {
  const generated = importRestGoPublishedApis([api]).operations[0];
  if (!generated) return operation;
  if (
    operation.path === generated.path &&
    operation.method === generated.method &&
    operation.apiVersion === generated.apiVersion &&
    operation.restGoSource &&
    JSON.stringify(operation.restGoSource) === JSON.stringify(generated.restGoSource)
  )
    return operation;
  const previousNames = new Set(
    operation.restGoSource?.parameterNames ??
      operation.query
        .filter((parameter) => parameter.id.startsWith(`${operation.id}-query-`))
        .map((parameter) => parameter.name),
  );
  const desiredNames = new Set(generated.restGoSource?.parameterNames ?? []);
  const bodyless = api.method === 'GET' || api.method === 'HEAD';
  const query = operation.query.filter(
    (parameter) =>
      !previousNames.has(parameter.name) || (bodyless && desiredNames.has(parameter.name)),
  );
  const usedIds = new Set(query.map((parameter) => parameter.id));
  for (const parameter of generated.query) {
    if (parameter.name === 'page' && !desiredNames.has('page')) continue;
    if (query.some((current) => current.name === parameter.name)) continue;
    const baseId = `${operation.id.slice(0, 60)}-query-${parameter.name.slice(0, 120)}`;
    let id = baseId;
    let sequence = 2;
    while (usedIds.has(id)) id = `${baseId}-${String(sequence++)}`;
    usedIds.add(id);
    query.push({ ...parameter, id });
  }
  const next: ApiClientOperation = {
    ...operation,
    path: generated.path,
    method: generated.method,
    apiVersion: generated.apiVersion,
    query,
    body: mergeBody(operation, generated, previousNames),
    restGoSource: generated.restGoSource,
  };
  return JSON.stringify(operation) === JSON.stringify(next) ? operation : next;
}

/** Updates only existing imported requests; manually authored routes and selected subsets stay intact. */
export function synchronizeRestGoApiConfiguration(
  configuration: ApiClientConfiguration,
  apis: readonly RestGoPublishedApi[],
): ApiClientConfiguration {
  if ((configuration.connection ?? 'custom') === 'custom') return configuration;
  const matches = configuration.operations.map((operation) => {
    if (!operation.restGoSource && !operation.id.startsWith('restgo-')) return undefined;
    const byIdentity = apis.filter((api) =>
      operation.restGoSource
        ? api.id === operation.restGoSource.apiId
        : restGoImportedOperationId(api.id) === operation.id,
    );
    if (byIdentity.length === 1) return byIdentity[0];
    return apis.find(
      (api) =>
        operation.path ===
          `/${encodeURIComponent(api.database)}/${encodeURIComponent(api.endpoint)}` &&
        operation.method === api.method &&
        operation.apiVersion === api.apiVersion,
    );
  });
  const connections = new Set(
    matches.flatMap((api) => (api ? [getRestGoPublishedApiConnection(api)] : [])),
  );
  if (connections.size === 0) return configuration;
  const connection = [...connections][0]!;
  if (
    connections.size > 1 ||
    (connection !== configuration.connection && matches.some((api) => !api))
  ) {
    throw new Error(
      'The published APIs now use different authentication modes. Separate them into API Clients before synchronizing.',
    );
  }
  const operations = configuration.operations.map((operation, index) =>
    matches[index] ? synchronizeOperation(operation, matches[index]!) : operation,
  );
  if (
    connection === configuration.connection &&
    operations.every((operation, index) => operation === configuration.operations[index])
  )
    return configuration;
  return parseApiClientConfiguration({ ...configuration, connection, operations });
}
