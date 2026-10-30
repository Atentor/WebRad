import type { ReactElement } from 'react';
import { reportGroupAppearance, type WebReportGroupElement } from '@webrad/runtime/report-template';
import { ReportNumberField } from './ReportNumberField';
import { NativeColorInput } from './NativeColorInput';

interface Props {
  readonly element: WebReportGroupElement;
  readonly onChange: (element: WebReportGroupElement) => void;
  readonly onEdit: () => void;
}

export function ReportGroupInspector({ element, onChange, onEdit }: Props): ReactElement {
  const appearance = reportGroupAppearance(element);
  const change = (next: Partial<typeof appearance>): void =>
    onChange({ ...element, appearance: { ...appearance, ...next } });
  return (
    <fieldset>
      <legend>Group appearance</legend>
      <label className="wr-report-checkbox">
        <input
          type="checkbox"
          aria-label="Report group background"
          checked={appearance.backgroundColor !== null}
          onChange={(event) =>
            change({ backgroundColor: event.currentTarget.checked ? '#f1f5f9' : null })
          }
        />
        <span>Background</span>
      </label>
      {appearance.backgroundColor !== null && (
        <label>
          <span>Background color</span>
          <NativeColorInput
            key={element.id}
            aria-label="Report group background color"
            value={appearance.backgroundColor}
            onChange={(backgroundColor) => change({ backgroundColor })}
          />
        </label>
      )}
      <label>
        <span>Border color</span>
        <NativeColorInput
          key={element.id}
          aria-label="Report group border color"
          value={appearance.borderColor}
          onChange={(borderColor) => change({ borderColor })}
        />
      </label>
      <div className="wr-report-field-grid">
        <ReportNumberField
          label="Group border width (mm)"
          min={0}
          max={10}
          value={appearance.borderWidth}
          onChange={(borderWidth) => change({ borderWidth })}
        />
        <ReportNumberField
          label="Group corner radius (mm)"
          min={0}
          max={100}
          value={appearance.borderRadius}
          onChange={(borderRadius) => change({ borderRadius })}
        />
      </div>
      <label>
        <span>Border style</span>
        <select
          aria-label="Report group border style"
          value={appearance.borderStyle}
          onChange={(event) => {
            const borderStyle = event.currentTarget.value;
            if (borderStyle === 'solid' || borderStyle === 'dashed') change({ borderStyle });
          }}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
      </label>
      <button type="button" onClick={onEdit}>
        Edit group contents
      </button>
      <p className="wr-report-hint">
        Drag components into the group, including other Groups and Repeaters.
      </p>
    </fieldset>
  );
}
