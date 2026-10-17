import type { WebApiRequestBody } from './api-client.js';
import {
  getApiClientTemplateParameters,
  type WebApiTemplateParameter,
  type WebApiTemplateParameterType,
  type WebApiTemplateValue,
} from './api-client-template.js';

export interface WebApiBodyInput extends WebApiTemplateParameter {
  readonly required: boolean;
  readonly inferred: boolean;
  readonly defaultValue?: WebApiTemplateValue;
}

/** Public reflection uses the same persisted body for code generation and runtime parameters. */
export function getApiClientBodyInputs(body: WebApiRequestBody): readonly WebApiBodyInput[] {
  if (body.kind === 'none') return [];
  const templates = getApiClientTemplateParameters(body.content, body.parameters);
  if (templates.length > 0) {
    return templates.map((parameter) => ({ ...parameter, required: true, inferred: false }));
  }
  let entries: readonly (readonly [string, WebApiTemplateValue])[] = [];
  if (body.kind === 'json') {
    let value: unknown;
    try {
      value = JSON.parse(body.content);
    } catch {
      return [];
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    entries = Object.entries(value) as readonly (readonly [string, WebApiTemplateValue])[];
  } else if (body.kind === 'form-urlencoded' || body.kind === 'form-data') {
    const form = new URLSearchParams(body.content);
    entries = [...new Set(form.keys())].map((name) => {
      const values = form.getAll(name);
      return [name, values.length === 1 ? (values[0] ?? '') : values] as const;
    });
  }
  if (entries.length > 200) throw new RangeError('A request body supports up to 200 parameters.');
  return entries.map(([name, defaultValue]) => {
    const configured = body.parameters?.find((parameter) => parameter.name === name);
    const type: WebApiTemplateParameterType =
      configured?.type ??
      (defaultValue === null
        ? 'null'
        : Array.isArray(defaultValue)
          ? 'array'
          : typeof defaultValue === 'object'
            ? 'object'
            : typeof defaultValue === 'number'
              ? 'number'
              : typeof defaultValue === 'boolean'
                ? 'boolean'
                : 'string');
    return { name, type, required: false, inferred: configured === undefined, defaultValue };
  });
}

/** Validates/copies input data while preventing prototype fields and unserializable values. */
export function copyApiClientInput(value: WebApiTemplateValue): WebApiTemplateValue {
  const encoded = JSON.stringify(value, (_key, candidate: unknown) => {
    if (
      candidate === undefined ||
      typeof candidate === 'function' ||
      typeof candidate === 'symbol' ||
      typeof candidate === 'bigint' ||
      (typeof candidate === 'number' && !Number.isFinite(candidate))
    ) {
      throw new TypeError('API parameters require finite, serializable JSON values.');
    }
    return candidate;
  });
  if (encoded === undefined) throw new TypeError('API parameters require JSON values.');
  return JSON.parse(encoded) as WebApiTemplateValue;
}
