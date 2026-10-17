import type { WebReportTemplate } from '@webrad/runtime/report-template';
import type { ReactElement } from 'react';

export function ReportPageSetup({
  template,
  onChange,
}: {
  readonly template: WebReportTemplate;
  readonly onChange: (template: WebReportTemplate) => void;
}): ReactElement {
  return (
    <div className="wr-report-page-setup">
      <h3>Page setup</h3>
      <p>Paper size, orientation and margins apply to PDF preview and download.</p>
      <div className="wr-report-page-fields">
        <label>
          <span>Paper</span>
          <select
            aria-label="Report paper size"
            value={template.paper.size}
            onChange={(event) =>
              onChange({
                ...template,
                paper: {
                  ...template.paper,
                  size: event.currentTarget.value === 'Letter' ? 'Letter' : 'A4',
                },
              })
            }
          >
            <option value="A4">A4 · 210 × 297 mm</option>
            <option value="Letter">Letter · 215.9 × 279.4 mm</option>
          </select>
        </label>
        <label>
          <span>Orientation</span>
          <select
            aria-label="Report orientation"
            value={template.paper.orientation}
            onChange={(event) =>
              onChange({
                ...template,
                paper: {
                  ...template.paper,
                  orientation: event.currentTarget.value === 'landscape' ? 'landscape' : 'portrait',
                },
              })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Margins (mm)</legend>
        <div className="wr-report-page-fields">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side}>
              <span>
                {side[0]?.toUpperCase()}
                {side.slice(1)}
              </span>
              <input
                aria-label={`Report ${side} margin`}
                type="number"
                min="0"
                max="200"
                step="0.5"
                value={template.paper.margins[side]}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value))
                    onChange({
                      ...template,
                      paper: {
                        ...template.paper,
                        margins: { ...template.paper.margins, [side]: value },
                      },
                    });
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <p className="wr-report-hint">
        Element positions are relative to their band, inside the page margins. All geometry uses
        millimetres.
      </p>
    </div>
  );
}
