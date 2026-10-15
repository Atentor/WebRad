import type { ComponentNode } from '@webrad/project-model';
import type {
  WebReportParameter,
  WebReportRepeaterElement,
  WebReportValueSource,
} from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';
import { ReportApiBinding } from './ReportApiBinding';
import { reportApiSource } from '@webrad/designer';

interface ReportValueEditorProps {
  readonly value: WebReportValueSource;
  readonly image: boolean;
  readonly parameters: readonly WebReportParameter[];
  readonly components: readonly ComponentNode[];
  readonly row?: WebReportRepeaterElement;
  readonly onChange: (value: WebReportValueSource) => void;
}

export function ReportValueEditor({
  value,
  image,
  parameters,
  components,
  row,
  onChange,
}: ReportValueEditorProps): ReactElement {
  const rowFields =
    row === undefined
      ? []
      : reportApiSource(
          components,
          row.source.apiClientId,
          row.source.operationId,
          row.source.listPath,
        ).rowFields;
  return (
    <>
      <label>
        <span>Value source</span>
        <select
          aria-label="Report value source"
          value={value.kind}
          onChange={(event) => {
            switch (event.currentTarget.value) {
              case 'static':
                onChange({ kind: 'static', value: '' });
                break;
              case 'parameter':
                onChange({ kind: 'parameter', name: parameters[0]?.name ?? '' });
                break;
              case 'field':
                onChange({ kind: 'field', apiClientId: '', operationId: '', path: '' });
                break;
              case 'row':
                onChange({ kind: 'row', path: rowFields[0]?.path ?? '' });
                break;
              case 'system':
                onChange({ kind: 'system', value: 'pageNumber' });
                break;
            }
          }}
        >
          <option value="static">{image ? 'Image URL or data URL' : 'Fixed text'}</option>
          <option value="parameter" disabled={parameters.length === 0}>
            Parameter
          </option>
          <option value="field">API response field</option>
          {row !== undefined && <option value="row">Current row field</option>}
          {!image && <option value="system">Page number / count</option>}
        </select>
      </label>
      {value.kind === 'static' && (
        <label>
          <span>{image ? 'Image URL' : 'Text'}</span>
          <textarea
            aria-label={image ? 'Report image URL' : 'Report text'}
            rows={image ? 3 : 4}
            value={value.value}
            onChange={(event) => onChange({ kind: 'static', value: event.currentTarget.value })}
            placeholder={image ? 'https://… or data:image/png;base64,…' : 'Enter text'}
          />
        </label>
      )}
      {value.kind === 'parameter' && (
        <label>
          <span>Parameter</span>
          <select
            aria-label="Report parameter binding"
            value={value.name}
            onChange={(event) => onChange({ kind: 'parameter', name: event.currentTarget.value })}
          >
            <option value="" disabled>
              Choose a parameter
            </option>
            {parameters.map((parameter) => (
              <option key={parameter.name} value={parameter.name}>
                {parameter.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind === 'field' && (
        <ReportApiBinding
          value={value}
          components={components}
          onChange={(next) => onChange({ kind: 'field', ...next })}
        />
      )}
      {value.kind === 'row' && (
        <label>
          <span>Current row field</span>
          <select
            aria-label="Report row field"
            value={rowFields.some((item) => item.path === value.path) ? value.path : '__missing__'}
            onChange={(event) => onChange({ kind: 'row', path: event.currentTarget.value })}
          >
            <option value="__missing__" disabled>
              Choose a row field
            </option>
            {rowFields.map((field) => (
              <option key={field.path} value={field.path}>
                {field.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind === 'system' && (
        <label>
          <span>Page value</span>
          <select
            aria-label="Report page value"
            value={value.value}
            onChange={(event) =>
              onChange({
                kind: 'system',
                value: event.currentTarget.value === 'pageCount' ? 'pageCount' : 'pageNumber',
              })
            }
          >
            <option value="pageNumber">Page number</option>
            <option value="pageCount">Total pages</option>
          </select>
        </label>
      )}
      {parameters.length === 0 && (
        <p className="wr-report-hint">
          Add parameters in the Parameters tab to supply values from code.
        </p>
      )}
    </>
  );
}
