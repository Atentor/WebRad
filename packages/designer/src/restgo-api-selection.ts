import {
  parseApiClientConfiguration,
  type ApiClientConfiguration,
  type ApiClientOperation,
} from '@webrad/project-model';
import { getRestGoPublishedApiConnection, type RestGoPublishedApi } from './restgo-api-import.js';
import { restGoImportedOperationId, synchronizeRestGoApiConfiguration } from './restgo-api-sync.js';

export interface RestGoPublishedApiGroup {
  readonly id: string;
  readonly database: string;
  readonly endpoint: string;
  readonly apiVersion: number;
  readonly authentication: RestGoPublishedApi['authentication'];
  readonly apis: readonly RestGoPublishedApi[];
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function groupId(api: RestGoPublishedApi): string {
  return JSON.stringify([api.database, api.endpoint, api.apiVersion, api.authentication]);
}

function apiPath(api: RestGoPublishedApi): string {
  return `/${encodeURIComponent(api.database)}/${encodeURIComponent(api.endpoint)}`;
}

/** Versions and authentication policies remain distinct even when route slugs match. */
export function groupRestGoPublishedApis(
  apis: readonly RestGoPublishedApi[],
): readonly RestGoPublishedApiGroup[] {
  const groups = new Map<string, RestGoPublishedApi[]>();
  for (const api of apis) {
    const id = groupId(api);
    const entries = groups.get(id) ?? [];
    if (!entries.some((entry) => entry.method === api.method)) entries.push(api);
    groups.set(id, entries);
  }
  return [...groups].map(([id, entries]) => {
    const first = entries[0]!;
    return {
      id,
      database: first.database,
      endpoint: first.endpoint,
      apiVersion: first.apiVersion,
      authentication: first.authentication,
      apis: [...entries].sort((left, right) => {
        const rank = (method: string): number => {
          const index = METHOD_ORDER.indexOf(method);
          return index < 0 ? METHOD_ORDER.length : index;
        };
        return rank(left.method) - rank(right.method) || left.method.localeCompare(right.method);
      }),
    };
  });
}

/** Reimporting a group keeps its existing method instead of adding a duplicate request. */
export function getRestGoGroupImportApi(
  group: RestGoPublishedApiGroup,
  configuration: ApiClientConfiguration,
): RestGoPublishedApi | undefined {
  return (
    group.apis.find((api) =>
      configuration.operations.some(
        (operation) =>
          operation.restGoSource?.apiId === api.id ||
          (operation.path === apiPath(api) &&
            operation.apiVersion === api.apiVersion &&
            operation.method === api.method),
      ),
    ) ?? group.apis[0]
  );
}

export function getRestGoRequestApis(
  apis: readonly RestGoPublishedApi[],
  operation: ApiClientOperation,
  connection: ApiClientConfiguration['connection'],
): readonly RestGoPublishedApi[] {
  const compatible = apis.filter((api) => getRestGoPublishedApiConnection(api) === connection);
  const source = compatible.find((api) =>
    operation.restGoSource
      ? api.id === operation.restGoSource.apiId
      : restGoImportedOperationId(api.id) === operation.id,
  );
  const candidates = source
    ? compatible.filter((api) => groupId(api) === groupId(source))
    : compatible.filter(
        (api) => operation.path === apiPath(api) && operation.apiVersion === api.apiVersion,
      );
  return groupRestGoPublishedApis(candidates)[0]?.apis ?? [];
}

/** Changes the selected method without changing the authored request's identity or name. */
export function changeRestGoApiClientMethod(
  configuration: ApiClientConfiguration,
  operationId: string,
  api: RestGoPublishedApi,
): ApiClientConfiguration {
  const operation = configuration.operations.find((entry) => entry.id === operationId);
  if (!operation) throw new Error('Choose a request before selecting a method.');
  if (getRestGoPublishedApiConnection(api) !== configuration.connection)
    throw new Error('Use a separate API Client for this authentication mode.');
  if (operation.path !== apiPath(api) || operation.apiVersion !== api.apiVersion)
    throw new Error('Choose a method from the same published endpoint and version.');
  if (operation.method === api.method) return configuration;
  const parameterNames =
    operation.restGoSource?.parameterNames ??
    operation.query
      .filter((parameter) => parameter.id.startsWith(`${operation.id}-query-`))
      .map((parameter) => parameter.name);
  const targeted = {
    ...operation,
    responseSchema: null,
    restGoSource: { apiId: api.id, parameterNames },
  };
  const synchronized = synchronizeRestGoApiConfiguration(
    { ...configuration, operations: [targeted] },
    [api],
  ).operations[0]!;
  const values = new Map<string, string | number | boolean | null>();
  for (const parameter of operation.query)
    if (parameter.enabled && parameterNames.includes(parameter.name))
      values.set(parameter.name, parameter.value);
  if (operation.body.kind === 'json') {
    try {
      const previous: unknown = JSON.parse(operation.body.content);
      if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
        for (const [name, value] of Object.entries(previous))
          if (
            parameterNames.includes(name) &&
            (value === null ||
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean')
          )
            values.set(name, value);
      }
    } catch {
      /* Dynamic body templates are preserved by the synchronizer. */
    }
  }
  let next = synchronized;
  if (api.method === 'GET' || api.method === 'HEAD') {
    next = {
      ...next,
      query: next.query.map((parameter) =>
        values.has(parameter.name)
          ? { ...parameter, value: String(values.get(parameter.name) ?? '') }
          : parameter,
      ),
    };
  } else if (next.body.kind === 'json') {
    try {
      const body: unknown = JSON.parse(next.body.content);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const fields = Object.assign(Object.create(null) as Record<string, unknown>, body);
        for (const name of next.restGoSource?.parameterNames ?? [])
          if (values.has(name)) fields[name] = values.get(name);
        next = { ...next, body: { ...next.body, content: JSON.stringify(fields, null, 2) } };
      }
    } catch {
      /* Keep authored dynamic templates byte-for-byte. */
    }
  }
  return parseApiClientConfiguration({
    ...configuration,
    operations: configuration.operations.map((entry) => (entry.id === operationId ? next : entry)),
  });
}
