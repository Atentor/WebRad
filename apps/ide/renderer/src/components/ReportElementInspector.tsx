import type { ComponentNode } from '@webrad/project-model';
import type {
  WebReportBand,
  WebReportElement,
  WebReportRepeaterElement,
  WebReportTemplate,
} from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';
import { ReportApiBinding } from './ReportApiBinding';
import { ReportValueEditor } from './ReportValueEditor';
import { REPORT_BAND_LABELS } from '@webrad/designer';

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly onChange: (value: number) => void;
}
function NumberField({ label, value, min = 0, max, onChange }: NumberFieldProps): ReactElement {
  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={`Report ${label.toLowerCase()}`}
        type="number"
        min={min}
        max={max}
        step="any"
        value={value}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

interface ReportElementInspectorProps {
  readonly template: WebReportTemplate;
  readonly band?: WebReportBand;
  readonly element?: WebReportElement;
  readonly row?: WebReportRepeaterElement;
  readonly components: readonly ComponentNode[];
  readonly onElementChange: (element: WebReportElement) => void;
  readonly onBandChange: (height: number) => void;
  readonly onEditRow: (row: WebReportRepeaterElement) => void;
  readonly onExitRow: () => void;
}

export function ReportElementInspector({
  template,
  band,
  element,
  row,
  components,
  onElementChange,
  onBandChange,
  onEditRow,
  onExitRow,
}: ReportElementInspectorProps): ReactElement {
  return (
    <aside className="wr-report-inspector">
      <h3>
        {element?.name ??
          (row !== undefined
            ? 'Row template'
            : band === undefined
              ? 'Properties'
              : REPORT_BAND_LABELS[band.kind])}
      </h3>
      {row !== undefined && (
        <div className="wr-report-row-context">
          <span>Inside {row.name}</span>
          <button type="button" onClick={onExitRow}>
            Back to repeater
          </button>
        </div>
      )}
      {element === undefined ? (
        <>
          {row !== undefined ? (
            <p className="wr-report-hint">
              Add Text, Image or Line from the toolbox. Bind values to Current row field to repeat
              them for each record.
            </p>
          ) : (
            band !== undefined && (
              <>
                <p className="wr-report-hint">
                  {band.kind === 'detail'
                    ? 'Place fixed content or a Repeater bound to an already loaded API response.'
                    : band.kind === 'pageHeader' || band.kind === 'pageFooter'
                      ? 'This band is printed on every page.'
                      : 'This band is printed once per report.'}
                </p>
                <NumberField label="Band height (mm)" value={band.height} onChange={onBandChange} />
              </>
            )
          )}
          <p className="wr-report-hint">
            Select an element on the page or in the outline to edit its properties.
          </p>
        </>
      ) : (
        <>
          <fieldset>
            <legend>Element</legend>
            <label>
              <span>Name</span>
              <input
                aria-label="Report element name"
                value={element.name}
                onChange={(event) =>
                  onElementChange({ ...element, name: event.currentTarget.value })
                }
              />
            </label>
            <div className="wr-report-field-grid">
              {(['x', 'y', 'width', 'height'] as const).map((property) => (
                <NumberField
                  key={property}
                  label={`${property[0]?.toUpperCase()}${property.slice(1)} (mm)`}
                  value={element[property]}
                  min={property === 'width' || property === 'height' ? 0.1 : 0}
                  onChange={(value) => onElementChange({ ...element, [property]: value })}
                />
              ))}
            </div>
          </fieldset>
          {'value' in element && (
            <fieldset>
              <legend>Content</legend>
              <ReportValueEditor
                value={element.value}
                image={element.type === 'image'}
                parameters={template.parameters}
                components={components}
                row={row}
                onChange={(value) => onElementChange({ ...element, value })}
              />
            </fieldset>
          )}
          {element.type === 'text' && (
            <fieldset>
              <legend>Typography</legend>
              <div className="wr-report-field-grid">
                <NumberField
                  label="Font size (pt)"
                  value={element.fontSize}
                  min={4}
                  max={144}
                  onChange={(fontSize) => onElementChange({ ...element, fontSize })}
                />
                <label>
                  <span>Color</span>
                  <input
                    aria-label="Report text color"
                    type="color"
                    value={element.color}
                    onChange={(event) =>
                      onElementChange({ ...element, color: event.currentTarget.value })
                    }
                  />
                </label>
              </div>
              <label>
                <span>Alignment</span>
                <select
                  aria-label="Report text alignment"
                  value={element.align}
                  onChange={(event) => {
                    const align = event.currentTarget.value;
                    if (align === 'left' || align === 'center' || align === 'right')
                      onElementChange({ ...element, align });
                  }}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="wr-report-checkbox">
                <input
                  type="checkbox"
                  checked={element.bold}
                  onChange={(event) =>
                    onElementChange({ ...element, bold: event.currentTarget.checked })
                  }
                />
                <span>Bold</span>
              </label>
            </fieldset>
          )}
          {element.type === 'line' && (
            <fieldset>
              <legend>Line</legend>
              <label>
                <span>Color</span>
                <input
                  aria-label="Report line color"
                  type="color"
                  value={element.color}
                  onChange={(event) =>
                    onElementChange({ ...element, color: event.currentTarget.value })
                  }
                />
              </label>
              <NumberField
                label="Stroke width (pt)"
                value={element.strokeWidth}
                min={0.1}
                max={20}
                onChange={(strokeWidth) => onElementChange({ ...element, strokeWidth })}
              />
            </fieldset>
          )}
          {element.type === 'image' && (
            <p className="wr-report-hint">
              Images preserve their proportions and fit inside their frame. PNG and JPEG are
              supported in PDF output.
            </p>
          )}
          {element.type === 'repeater' && (
            <>
              <fieldset>
                <legend>Repeated records</legend>
                <ReportApiBinding
                  value={{ ...element.source, path: element.source.listPath }}
                  list
                  components={components}
                  onChange={(source) =>
                    onElementChange({
                      ...element,
                      source: {
                        apiClientId: source.apiClientId,
                        operationId: source.operationId,
                        listPath: source.path,
                      },
                    })
                  }
                />
                <NumberField
                  label="Row gap (mm)"
                  value={element.gap}
                  max={100}
                  onChange={(gap) => onElementChange({ ...element, gap })}
                />
              </fieldset>
              <button
                type="button"
                className="wr-report-edit-row"
                onClick={() => onEditRow(element)}
              >
                Edit row template
              </button>
              <p className="wr-report-hint">
                Height is the height of each row. Complete rows continue on the next page
                automatically.
              </p>
            </>
          )}
        </>
      )}
    </aside>
  );
}
