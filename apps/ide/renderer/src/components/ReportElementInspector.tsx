import type { ComponentNode } from '@webrad/project-model';
import type {
  WebReportBand,
  WebReportElement,
  WebReportRepeaterElement,
  WebReportContainerElement,
  WebReportTemplate,
} from '@webrad/runtime/report-template';
import { reportRepeaterSectionLayout } from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';
import { ReportValueEditor } from './ReportValueEditor';
import { REPORT_BAND_LABELS, type ReportRepeaterSection } from '@webrad/designer';
import { ReportNumberField as NumberField } from './ReportNumberField';
import { ReportRepeaterInspector } from './ReportRepeaterInspector';
import { ReportGroupInspector } from './ReportGroupInspector';

interface ReportElementInspectorProps {
  readonly template: WebReportTemplate;
  readonly band?: WebReportBand;
  readonly element?: WebReportElement;
  readonly row?: WebReportContainerElement;
  readonly rowSource?: WebReportRepeaterElement['source'];
  readonly section: ReportRepeaterSection;
  readonly components: readonly ComponentNode[];
  readonly onElementChange: (element: WebReportElement) => void;
  readonly onBandChange: (height: number) => void;
  readonly onEditRow: (row: WebReportContainerElement, section?: ReportRepeaterSection) => void;
  readonly onExitRow: () => void;
}

export function ReportElementInspector({
  template,
  band,
  element,
  row,
  rowSource,
  section,
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
            ? row.type === 'group'
              ? 'Group contents'
              : section === 'row'
                ? 'Row template'
                : section === 'header'
                  ? 'Header'
                  : 'Footer'
            : band === undefined
              ? 'Properties'
              : REPORT_BAND_LABELS[band.kind])}
      </h3>
      {row !== undefined && (
        <div className="wr-report-row-context">
          <span>Inside {row.name}</span>
          <button type="button" onClick={onExitRow}>
            Back to {row.type === 'group' ? 'group' : 'repeater'}
          </button>
        </div>
      )}
      {element === undefined ? (
        <>
          {row !== undefined ? (
            <p className="wr-report-hint">
              Drag components, Groups or Repeaters into this container.
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
            {row?.type === 'repeater' && section !== 'row' && (
              <label>
                <span>Column</span>
                <select
                  aria-label="Report section column"
                  value={element.column ?? 0}
                  onChange={(event) =>
                    onElementChange({ ...element, column: Number(event.currentTarget.value) })
                  }
                >
                  {Array.from(
                    {
                      length: Math.max(
                        1,
                        Math.min(
                          24,
                          Math.trunc(reportRepeaterSectionLayout(row[section]).columns) || 1,
                        ),
                      ),
                    },
                    (_, index) => (
                      <option key={index} value={index}>
                        Column {index + 1}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
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
                row={rowSource}
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
            <ReportRepeaterInspector
              element={element}
              parentSource={rowSource}
              components={components}
              onChange={onElementChange}
              onEdit={onEditRow}
            />
          )}
          {element.type === 'group' && (
            <ReportGroupInspector
              element={element}
              onChange={onElementChange}
              onEdit={() => onEditRow(element)}
            />
          )}
        </>
      )}
    </aside>
  );
}
