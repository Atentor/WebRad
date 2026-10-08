/** Browser-safe request-body templates shared by the IDE and generated applications. */
export const WEB_API_TEMPLATE_PARAMETER_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
] as const;

export type WebApiTemplateParameterType = (typeof WEB_API_TEMPLATE_PARAMETER_TYPES)[number];

export interface WebApiTemplateParameter {
  readonly name: string;
  readonly type: WebApiTemplateParameterType;
}

export type WebApiTemplateValue =
  | string
  | number
  | boolean
  | null
  | readonly WebApiTemplateValue[]
  | { readonly [key: string]: WebApiTemplateValue };

export type WebApiTemplateValues = Readonly<Record<string, WebApiTemplateValue>>;

interface TemplateBody {
  readonly kind: 'none' | 'json' | 'text' | 'form-urlencoded' | 'form-data';
  readonly content: string;
  readonly parameters?: readonly WebApiTemplateParameter[];
}

function placeholderPattern(): RegExp {
  return /<\s*([\p{L}_$][\p{L}\p{N}_$.-]{0,119})\s*>/gu;
}

/** Derives unique names from the template and preserves existing type choices by name. */
export function getApiClientTemplateParameters(
  content: string,
  existing: readonly WebApiTemplateParameter[] = [],
): readonly WebApiTemplateParameter[] {
  const types = new Map(existing.map((parameter) => [parameter.name, parameter.type]));
  const names = new Set<string>();
  for (const match of content.matchAll(placeholderPattern())) {
    const name = match[1];
    if (name !== undefined) names.add(name);
    if (names.size > 200) throw new RangeError('A request body supports up to 200 parameters.');
  }
  return [...names].map((name) => ({ name, type: types.get(name) ?? 'string' }));
}

function parameterError(parameter: WebApiTemplateParameter, detail: string): TypeError {
  return new TypeError(`Parameter <${parameter.name}> ${detail}`);
}

function validateValue(
  parameter: WebApiTemplateParameter,
  value: unknown,
): asserts value is WebApiTemplateValue {
  const valid =
    parameter.type === 'null'
      ? value === null
      : parameter.type === 'string'
        ? typeof value === 'string'
        : parameter.type === 'boolean'
          ? typeof value === 'boolean'
          : parameter.type === 'number'
            ? typeof value === 'number' && Number.isFinite(value)
            : parameter.type === 'integer'
              ? typeof value === 'number' && Number.isSafeInteger(value)
              : parameter.type === 'array'
                ? Array.isArray(value)
                : parameter.type === 'object' &&
                  value !== null &&
                  typeof value === 'object' &&
                  !Array.isArray(value);
  if (!valid) throw parameterError(parameter, `requires a valid ${parameter.type} value.`);
}

/** Converts an IDE-only input into a typed value without evaluating source code. */
export function parseApiClientTemplateTestValue(
  parameter: WebApiTemplateParameter,
  input: string,
): WebApiTemplateValue {
  if (parameter.type === 'string') return input;
  if (parameter.type === 'null') return null;
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw parameterError(parameter, `requires a valid ${parameter.type} value.`);
  }
  validateValue(parameter, value);
  return value;
}

function jsonValue(value: WebApiTemplateValue): string {
  const encoded = JSON.stringify(value, (_key, candidate: unknown) => {
    if (
      candidate === undefined ||
      typeof candidate === 'function' ||
      typeof candidate === 'symbol' ||
      typeof candidate === 'bigint' ||
      (typeof candidate === 'number' && !Number.isFinite(candidate))
    ) {
      throw new TypeError('Request parameters must contain valid JSON values.');
    }
    return candidate;
  });
  if (encoded === undefined) throw new TypeError('Request parameters must contain JSON values.');
  return encoded;
}

function textValue(value: WebApiTemplateValue): string {
  return typeof value === 'string' ? value : jsonValue(value);
}

/** Resolves a body template while preserving JSON types and escaping string contents. */
export function resolveApiClientBodyTemplate(
  body: TemplateBody,
  values: WebApiTemplateValues = {},
): string {
  if (body.kind === 'none') return body.content;
  const parameters = getApiClientTemplateParameters(body.content, body.parameters);
  if (parameters.length === 0) return body.content;
  const resolved = new Map<string, WebApiTemplateValue>();
  for (const parameter of parameters) {
    if (parameter.type !== 'null' && !Object.hasOwn(values, parameter.name)) {
      throw parameterError(parameter, 'requires a value.');
    }
    const value = parameter.type === 'null' ? null : values[parameter.name];
    validateValue(parameter, value);
    resolved.set(parameter.name, value);
  }
  const valueFor = (name: string): WebApiTemplateValue => {
    if (!resolved.has(name)) throw new TypeError(`Parameter <${name}> is not defined.`);
    return resolved.get(name) ?? null;
  };
  const resolveText = (content: string): string =>
    content.replace(placeholderPattern(), (_placeholder, name: string) =>
      textValue(valueFor(name)),
    );

  if (body.kind === 'text') return resolveText(body.content);
  if (body.kind === 'form-urlencoded' || body.kind === 'form-data') {
    const encoded = body.content.replace(placeholderPattern(), (_placeholder, name: string) =>
      encodeURIComponent(textValue(valueFor(name))),
    );
    return new URLSearchParams(encoded).toString();
  }

  let output = '';
  let position = 0;
  const matcher = new RegExp(placeholderPattern().source, 'uy');
  while (position < body.content.length) {
    const character = body.content[position];
    if (character !== '"') {
      if (character === '<') {
        matcher.lastIndex = position;
        const match = matcher.exec(body.content);
        if (match?.[1] !== undefined) {
          output += jsonValue(valueFor(match[1]));
          position += match[0].length;
          continue;
        }
      }
      output += character;
      position += 1;
      continue;
    }
    const start = position;
    position += 1;
    let closed = false;
    while (position < body.content.length) {
      const current = body.content[position];
      position += 1;
      if (current === '\\') position += 1;
      else if (current === '"') {
        closed = true;
        break;
      }
    }
    if (!closed)
      throw new TypeError('The configured JSON request body has an unterminated string.');
    const raw = body.content.slice(start, position);
    const text: unknown = JSON.parse(raw);
    if (typeof text !== 'string') throw new TypeError('Invalid JSON string in request body.');
    const placeholders = [...raw.slice(1, -1).matchAll(placeholderPattern())];
    const only = placeholders[0];
    const key = body.content.slice(position).trimStart().startsWith(':');
    output +=
      !key &&
      placeholders.length === 1 &&
      only !== undefined &&
      only[0] === raw.slice(1, -1) &&
      only[1] !== undefined
        ? jsonValue(valueFor(only[1]))
        : raw.replace(placeholderPattern(), (_placeholder, name: string) =>
            jsonValue(textValue(valueFor(name))).slice(1, -1),
          );
  }
  // Catch invalid template placement before any request reaches the network.
  JSON.parse(output);
  return output;
}
