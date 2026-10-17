import {
  createDefaultApiClientConfiguration,
  getRestGoApiClientPathError,
  getTypeScriptIdentifierError,
  parseApiClientConfiguration,
  type ApiClientConfiguration,
  type ApiClientConnection,
  type ApiClientOperation,
  type ApiClientParameter,
} from '@webrad/project-model';

/** A published browser API, deliberately excluding administration credentials and test data. */
export interface RestGoPublishedApi {
  readonly id: string;
  readonly name: string;
  readonly database: string;
  readonly endpoint: string;
  readonly method: string;
  readonly apiVersion: number;
  readonly authentication: 'jwt' | 'api-token' | 'public';
  readonly kind?: 'sql' | 'operation';
  readonly script?: string;
  readonly parameters?: readonly RestGoPublishedApiParameter[];
}

export interface RestGoPublishedApiParameter {
  readonly name: string;
  readonly type?: 'string' | 'numeric' | 'data' | 'boolean';
}

export interface ImportRestGoPublishedApisOptions {
  /** The caller must obtain an explicit conversion choice before setting this for a custom client. */
  readonly replaceCustom?: boolean;
}

export function getRestGoPublishedApiConnection(api: RestGoPublishedApi): ApiClientConnection {
  if (api.authentication === 'public') return 'restgo-public';
  if (api.authentication === 'api-token') return 'restgo-api-token';
  return 'restgo-session';
}

function sqlNameStart(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z_]$/u.test(character);
}

function sqlNamePart(character: string | undefined): boolean {
  return character !== undefined && /^[A-Za-z_0-9]$/u.test(character);
}

/** Matches RestGo's named SQL binding, ignoring casts, quoted text, and nested comments. */
export function getRestGoSqlParameterNames(script: string): readonly string[] {
  const names = new Set<string>();
  let position = 0;
  while (position < script.length) {
    const character = script[position];
    if (character === "'" || character === '"') {
      const start = position;
      position += 1;
      const escaped =
        character === "'" &&
        /^[Ee]$/u.test(script[start - 1] ?? '') &&
        !sqlNamePart(script[start - 2]);
      while (position < script.length) {
        if (escaped && script[position] === '\\') {
          position += 2;
          continue;
        }
        if (script[position] === character) {
          position += 1;
          if (script[position] === character) {
            position += 1;
            continue;
          }
          break;
        }
        position += 1;
      }
      continue;
    }
    if (script.startsWith('--', position)) {
      const newline = script.indexOf('\n', position + 2);
      position = newline < 0 ? script.length : newline + 1;
      continue;
    }
    if (script.startsWith('/*', position)) {
      position += 2;
      let depth = 1;
      while (position < script.length && depth > 0) {
        if (script.startsWith('/*', position)) {
          depth += 1;
          position += 2;
        } else if (script.startsWith('*/', position)) {
          depth -= 1;
          position += 2;
        } else {
          position += 1;
        }
      }
      continue;
    }
    const previous = script[position - 1];
    if (
      character === '$' &&
      !sqlNamePart(previous) &&
      previous !== '$' &&
      (previous === undefined || previous.charCodeAt(0) < 128)
    ) {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/u.exec(script.slice(position))?.[0];
      if (delimiter !== undefined) {
        const closing = script.indexOf(delimiter, position + delimiter.length);
        position = closing < 0 ? script.length : closing + delimiter.length;
        continue;
      }
    }
    if (script.startsWith('::', position)) {
      position += 2;
      continue;
    }
    if (character === ':' && sqlNameStart(script[position + 1])) {
      const start = position + 1;
      position += 2;
      while (sqlNamePart(script[position])) position += 1;
      names.add(script.slice(start, position));
      continue;
    }
    position += 1;
  }
  return [...names];
}

/** The generated empty Request is a placeholder, not an authored endpoint. */
export function isEmptyApiClientConfiguration(configuration: ApiClientConfiguration): boolean {
  if (configuration.defaultHeaders.length > 0) return false;
  if (configuration.operations.length === 0) return true;
  const operation = configuration.operations[0];
  return (
    configuration.operations.length === 1 &&
    operation !== undefined &&
    operation.path === '' &&
    operation.name === 'Request' &&
    operation.method === 'GET' &&
    operation.apiVersion == null &&
    operation.headers.length === 0 &&
    operation.query.length === 0 &&
    operation.body.kind === 'none' &&
    operation.body.content === '' &&
    operation.responseSchema === null &&
    operation.timeoutMs === null &&
    operation.credentials === 'omit'
  );
}

function uniqueValue(base: string, used: Set<string>, maximum: number): string {
  let result = base.slice(0, maximum);
  let sequence = 2;
  while (used.has(result)) {
    const suffix = String(sequence);
    result = `${base.slice(0, maximum - suffix.length)}${suffix}`;
    sequence += 1;
  }
  used.add(result);
  return result;
}

function operationName(api: RestGoPublishedApi): string {
  const words = `${api.method} ${api.name || api.endpoint}`
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9_$]+/u)
    .filter(Boolean);
  const name = words
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1).toLowerCase()}`)
    .join('');
  return getTypeScriptIdentifierError(name) === undefined ? name : `Request${name}`;
}

function withoutAuthorization(
  headers: readonly ApiClientParameter[],
): readonly ApiClientParameter[] {
  return headers.filter((header) => header.name.trim().toLowerCase() !== 'authorization');
}

function publishedPath(api: RestGoPublishedApi): string {
  const path = `/${encodeURIComponent(api.database)}/${encodeURIComponent(api.endpoint)}`;
  const error = getRestGoApiClientPathError(path);
  if (!api.database || !api.endpoint || error !== undefined) {
    throw new Error(error ?? 'The published API must have a database and endpoint slug.');
  }
  return path;
}

function parameterValue(parameter: RestGoPublishedApiParameter): string | number | boolean | null {
  if (parameter.type === 'numeric') return 0;
  if (parameter.type === 'boolean') return false;
  if (parameter.type === 'string' || parameter.type === 'data') return '';
  return null;
}

/**
 * Imports published operations into a typed API Client, preserving authored contracts and IDs.
 * Authentication modes are kept separate so a public request never inherits a user's JWT/token.
 */
export function importRestGoPublishedApis(
  apis: readonly RestGoPublishedApi[],
  configuration: ApiClientConfiguration = createDefaultApiClientConfiguration(),
  options: ImportRestGoPublishedApisOptions = {},
): ApiClientConfiguration {
  const first = apis[0];
  if (first === undefined) return configuration;
  const connection = getRestGoPublishedApiConnection(first);
  if (apis.some((api) => getRestGoPublishedApiConnection(api) !== connection)) {
    throw new Error('Choose APIs with the same authentication mode, or use separate API Clients.');
  }
  const empty = isEmptyApiClientConfiguration(configuration);
  const currentConnection = configuration.connection ?? 'custom';
  if (!empty && currentConnection !== connection) {
    if (currentConnection !== 'custom') {
      throw new Error(
        'This API Client uses another RestGo authentication mode. Use a separate API Client.',
      );
    }
    if (!options.replaceCustom) {
      throw new Error(
        'Confirm converting this custom API Client to the RestGo integration before importing.',
      );
    }
  }
  const operations: ApiClientOperation[] = empty
    ? []
    : configuration.operations.map((operation) => {
        const error = getRestGoApiClientPathError(operation.path);
        if (error !== undefined) {
          throw new Error(`Cannot convert ${operation.name}: ${error} Use a separate API Client.`);
        }
        return {
          ...operation,
          headers: withoutAuthorization(operation.headers),
          credentials: 'omit',
        };
      });
  const names = new Set(operations.map((operation) => operation.name));
  const ids = new Set(operations.map((operation) => operation.id));
  for (const api of apis) {
    const path = publishedPath(api);
    const method = api.method.trim().toUpperCase();
    if (
      operations.some(
        (operation) =>
          operation.path === path &&
          operation.method.toUpperCase() === method &&
          operation.apiVersion === api.apiVersion,
      )
    )
      continue;
    const id = uniqueValue(`restgo-${api.id.replace(/[^A-Za-z0-9_-]/gu, '-')}`, ids, 160);
    const parameters: readonly RestGoPublishedApiParameter[] =
      api.kind === 'operation'
        ? (api.parameters ?? [])
        : getRestGoSqlParameterNames(api.script ?? '').map((name) => ({ name }));
    const namesSeen = new Set<string>();
    const uniqueParameters = parameters.filter((parameter) => {
      if (!parameter.name.trim() || namesSeen.has(parameter.name)) return false;
      namesSeen.add(parameter.name);
      return true;
    });
    const bodyless = method === 'GET' || method === 'HEAD';
    const query: ApiClientParameter[] = bodyless
      ? uniqueParameters.map((parameter, index) => ({
          id: `${id}-query-${String(index + 1)}`,
          name: parameter.name,
          value: parameterValue(parameter) === null ? '' : String(parameterValue(parameter)),
          enabled: true,
        }))
      : [];
    // Pagination is explicitly opt-in; the data contract is inferred only from a real response.
    if (api.kind !== 'operation' && !namesSeen.has('page')) {
      query.push({ id: `${id}-page`, name: 'page', value: '1', enabled: false });
    }
    const body: Record<string, string | number | boolean | null> = Object.create(null) as Record<
      string,
      string | number | boolean | null
    >;
    for (const parameter of uniqueParameters) body[parameter.name] = parameterValue(parameter);
    operations.push({
      id,
      name: uniqueValue(operationName(api), names, 120),
      method,
      path,
      apiVersion: api.apiVersion,
      headers: [],
      query,
      body:
        !bodyless && uniqueParameters.length > 0
          ? { kind: 'json', content: JSON.stringify(body, null, 2) }
          : { kind: 'none', content: '' },
      credentials: 'omit',
      timeoutMs: null,
      responseSchema: null,
    });
  }
  return parseApiClientConfiguration({
    ...configuration,
    connection,
    defaultHeaders: withoutAuthorization(configuration.defaultHeaders),
    operations,
  });
}
