import type { ApiClientRequestBody, ApiClientBodyParameterType } from '@webrad/project-model';
import { getApiClientTemplateParameters, WEB_API_TEMPLATE_PARAMETER_TYPES } from '@webrad/runtime';
import type { ReactElement } from 'react';

interface Props {
  readonly body: ApiClientRequestBody;
  readonly testValues: ReadonlyMap<string, string>;
  readonly onBodyChange: (body: ApiClientRequestBody) => void;
  readonly onTestValueChange: (name: string, value: string) => void;
}

const TYPE_LABELS: Readonly<Record<ApiClientBodyParameterType, string>> = {
  string: 'Text',
  number: 'Number',
  integer: 'Integer',
  boolean: 'Boolean',
  object: 'Object (JSON)',
  array: 'Array (JSON)',
  null: 'Null',
};

export function ApiClientBodyParameters({
  body,
  testValues,
  onBodyChange,
  onTestValueChange,
}: Props): ReactElement | null {
  let parameters;
  try {
    parameters = getApiClientTemplateParameters(body.content, body.parameters);
  } catch (error) {
    return (
      <p className="wr-api-request-error" role="alert">
        {error instanceof Error ? error.message : 'Invalid body parameters.'}
      </p>
    );
  }
  if (parameters.length === 0) return null;
  return (
    <section className="wr-api-body-parameters" aria-label="Body parameters">
      <div className="wr-api-body-parameter-heading" aria-hidden="true">
        <span>Parameter</span>
        <span>Type</span>
        <span>Test value</span>
      </div>
      {parameters.map((parameter) => (
        <div className="wr-api-body-parameter-row" key={parameter.name}>
          <code title={`<${parameter.name}>`}>{`<${parameter.name}>`}</code>
          <select
            aria-label={`Parameter type ${parameter.name}`}
            value={parameter.type}
            onChange={(event) => {
              const type = event.currentTarget.value as ApiClientBodyParameterType;
              onBodyChange({
                ...body,
                parameters: parameters.map((candidate) =>
                  candidate.name === parameter.name ? { ...candidate, type } : candidate,
                ),
              });
            }}
          >
            {WEB_API_TEMPLATE_PARAMETER_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {parameter.type === 'boolean' ? (
            <select
              aria-label={`Test value ${parameter.name}`}
              value={testValues.get(parameter.name) ?? ''}
              onChange={(event) => onTestValueChange(parameter.name, event.currentTarget.value)}
            >
              <option value="">Choose...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              aria-label={`Test value ${parameter.name}`}
              value={parameter.type === 'null' ? 'null' : (testValues.get(parameter.name) ?? '')}
              disabled={parameter.type === 'null'}
              spellCheck={false}
              autoComplete="off"
              inputMode={
                parameter.type === 'number' || parameter.type === 'integer' ? 'decimal' : 'text'
              }
              placeholder={
                parameter.type === 'object'
                  ? '{}'
                  : parameter.type === 'array'
                    ? '[]'
                    : 'Test value'
              }
              onChange={(event) => onTestValueChange(parameter.name, event.currentTarget.value)}
            />
          )}
        </div>
      ))}
    </section>
  );
}
