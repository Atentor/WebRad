import type {
  WebReportParameter,
  WebReportParameterType,
  WebReportTemplate,
} from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';
import { renameReportParameter } from '@webrad/designer';

interface ReportParametersEditorProps {
  readonly template: WebReportTemplate;
  readonly onChange: (template: WebReportTemplate) => void;
}

function defaultValue(type: WebReportParameterType): WebReportParameter['defaultValue'] {
  return type === 'number' ? 0 : type === 'boolean' ? false : type === 'date' ? null : '';
}

export function ReportParametersEditor({
  template,
  onChange,
}: ReportParametersEditorProps): ReactElement {
  const update = (index: number, parameter: WebReportParameter): void =>
    onChange(renameReportParameter(template, index, parameter));
  return (
    <div className="wr-report-parameters">
      <div className="wr-report-parameters-heading">
        <div>
          <h3>Report parameters</h3>
          <p>Declare values here, then fill them in code before generating the report.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            let number = template.parameters.length + 1;
            while (template.parameters.some((item) => item.name === `Parameter${String(number)}`))
              number += 1;
            onChange({
              ...template,
              parameters: [
                ...template.parameters,
                { name: `Parameter${String(number)}`, type: 'string', defaultValue: '' },
              ],
            });
          }}
        >
          Add parameter
        </button>
      </div>
      {template.parameters.length === 0 ? (
        <div className="wr-report-empty">
          <strong>Give your report context</strong>
          <p>
            Use parameters for a title, period, company name or values supplied by the application.
          </p>
        </div>
      ) : (
        <div className="wr-report-parameter-list">
          {template.parameters.map((parameter, index) => (
            <div className="wr-report-parameter-row" key={index}>
              <label>
                <span>Name</span>
                <input
                  aria-label={`Parameter ${String(index + 1)} name`}
                  value={parameter.name}
                  onChange={(event) =>
                    update(index, { ...parameter, name: event.currentTarget.value })
                  }
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  aria-label={`Parameter ${String(index + 1)} type`}
                  value={parameter.type}
                  onChange={(event) => {
                    const type = event.currentTarget.value as WebReportParameterType;
                    update(index, { ...parameter, type, defaultValue: defaultValue(type) });
                  }}
                >
                  <option value="string">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                </select>
              </label>
              <label>
                <span>Default value</span>
                {parameter.type === 'boolean' ? (
                  <select
                    aria-label={`Parameter ${String(index + 1)} default`}
                    value={parameter.defaultValue === null ? '' : String(parameter.defaultValue)}
                    onChange={(event) =>
                      update(index, {
                        ...parameter,
                        defaultValue:
                          event.currentTarget.value === ''
                            ? null
                            : event.currentTarget.value === 'true',
                      })
                    }
                  >
                    <option value="">No default</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    aria-label={`Parameter ${String(index + 1)} default`}
                    type={
                      parameter.type === 'number'
                        ? 'number'
                        : parameter.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step={parameter.type === 'number' ? 'any' : undefined}
                    value={parameter.defaultValue === null ? '' : String(parameter.defaultValue)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      update(index, {
                        ...parameter,
                        defaultValue:
                          value === '' && parameter.type !== 'string'
                            ? null
                            : parameter.type === 'number'
                              ? Number(value)
                              : value,
                      });
                    }}
                  />
                )}
              </label>
              <button
                type="button"
                className="wr-report-remove"
                aria-label={`Remove parameter ${parameter.name}`}
                onClick={() =>
                  onChange({
                    ...template,
                    parameters: template.parameters.filter((_, position) => position !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="wr-report-hint">
        Names use letters, digits and underscores, starting with a letter or underscore. Renaming
        keeps element bindings linked; removing a parameter requires updating its bound elements.
      </p>
    </div>
  );
}
