/** Serializable values accepted by page navigation. */
export type PageParameterValue = string | number | boolean;
export type PageParameterValues = Readonly<Record<string, PageParameterValue | undefined>>;

export interface PageParameterDefinition {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly required: boolean;
  readonly defaultValue?: PageParameterValue;
}

export interface PageParametersChangedEventDetail {
  readonly previous: PageParameterValues;
  readonly params: PageParameterValues;
}

export class PageParameterError extends Error {
  public constructor(
    public readonly pageName: string,
    public readonly parameterName: string,
    reason: string,
  ) {
    super(`Page "${pageName}", parameter "${parameterName}": ${reason}`);
    this.name = 'PageParameterError';
  }
}

const contexts = new WeakMap<HTMLElement, PageParameterValues>();
const emptyParameters: PageParameterValues = Object.freeze({});

/** Shared by the rendered root and its authored page wrapper. */
export function getPageParameters(element: HTMLElement): PageParameterValues {
  return contexts.get(element) ?? emptyParameters;
}

/** Router-owned context is installed before authored constructors and lifecycle events. */
export function setPageParameters(element: HTMLElement, values: PageParameterValues): void {
  contexts.set(element, Object.freeze({ ...values }));
}

export function parsePageParameters(
  definitions: readonly PageParameterDefinition[],
  search: URLSearchParams,
  pageName: string,
): PageParameterValues {
  const result: Record<string, PageParameterValue | undefined> = Object.create(null) as Record<
    string,
    PageParameterValue | undefined
  >;
  if (definitions.length === 0) {
    search.forEach((value, name) => {
      result[name] = value;
    });
    return Object.freeze(result);
  }
  for (const definition of definitions) {
    const values = search.getAll(definition.name);
    if (values.length > 1)
      throw new PageParameterError(pageName, definition.name, 'provide a single value.');
    const raw = values[0];
    let value: PageParameterValue | undefined;
    if (raw !== undefined) {
      if (definition.type === 'string') value = raw;
      else if (definition.type === 'boolean') {
        if (raw === 'true') value = true;
        else if (raw === 'false') value = false;
      } else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
        const number = Number(raw);
        if (Number.isFinite(number)) value = number;
      }
      if (value === undefined && definition.required)
        throw new PageParameterError(pageName, definition.name, `expected ${definition.type}.`);
    }
    value ??= definition.defaultValue;
    if (value === undefined && definition.required)
      throw new PageParameterError(pageName, definition.name, 'a value is required.');
    result[definition.name] = value;
  }
  return Object.freeze(result);
}

export function applyNavigationParameters(
  search: URLSearchParams,
  params: PageParameterValues,
): void {
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) search.delete(name);
    else {
      if (
        !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !Number.isFinite(value))
      )
        throw new TypeError(
          `Navigation parameter "${name}" must be a string, finite number or boolean.`,
        );
      search.set(name, String(value));
    }
  }
}
