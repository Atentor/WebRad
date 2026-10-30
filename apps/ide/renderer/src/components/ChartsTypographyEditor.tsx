import { LucideGraphic } from '@webrad/components';
import type { ChartsConfiguration } from '@webrad/project-model';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import { LUCIDE_ICON_NAMES } from '@webrad/runtime/icon';
import { useState, type ReactElement } from 'react';
import { IconPickerDialog } from './IconPickerDialog';
import { NativeColorInput } from './NativeColorInput';

interface ChartsTypographyEditorProps {
  readonly configuration: ChartsConfiguration;
  readonly onChange: (configuration: ChartsConfiguration) => void;
}

const COLOR_FIELDS = [
  { key: 'textColor', label: 'Text color' },
  { key: 'titleColor', label: 'Title color' },
  { key: 'subtitleColor', label: 'Subtitle color' },
  { key: 'legendColor', label: 'Legend color' },
] as const;

export function ChartsTypographyEditor({
  configuration: draft,
  onChange,
}: ChartsTypographyEditorProps): ReactElement {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  return (
    <>
      <h3>Fonts & colors</h3>
      <div className="wr-charts-field-pair">
        {(
          [
            { key: 'fontFamily', label: 'Text font' },
            { key: 'legendFontFamily', label: 'Legend font' },
          ] as const
        ).map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <select
              aria-label={`Chart ${label.toLowerCase()}`}
              value={draft[key] ?? 'inherit'}
              onChange={(event) => {
                const font = WEBRAD_FONT_FAMILIES.find(
                  (entry) => entry.id === event.currentTarget.value,
                );
                onChange({ ...draft, [key]: font?.id ?? 'inherit' });
              }}
            >
              <option value="inherit">
                {key === 'fontFamily' ? 'From style' : 'Same as text'}
              </option>
              {WEBRAD_FONT_FAMILIES.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="wr-charts-field-pair">
        {COLOR_FIELDS.map(({ key, label }) => (
          <label key={key}>
            <span>{label}</span>
            <span className="wr-charts-text-color">
              <NativeColorInput
                aria-label={`Chart ${label.toLowerCase()}`}
                value={draft[key] ?? '#64748b'}
                onChange={(color) => onChange({ ...draft, [key]: color })}
              />
              <span>{draft[key] ?? (key === 'textColor' ? 'From style' : 'Same as text')}</span>
              <button
                type="button"
                aria-label={`Reset chart ${label.toLowerCase()}`}
                disabled={draft[key] == null}
                onClick={() => onChange({ ...draft, [key]: null })}
              >
                Reset
              </button>
            </span>
          </label>
        ))}
      </div>
      <label>
        <span>Title icon</span>
        <button
          type="button"
          className="wr-charts-title-icon-picker"
          aria-label="Chart title icon"
          onClick={() => setIconPickerOpen(true)}
        >
          {draft.titleIcon != null && <LucideGraphic icon={draft.titleIcon} className="wr-icon" />}
          <span>{draft.titleIcon ?? 'Choose an icon'}</span>
        </button>
      </label>
      {iconPickerOpen && (
        <IconPickerDialog
          icons={LUCIDE_ICON_NAMES}
          selected={draft.titleIcon ?? undefined}
          libraryLabel="Charts / Title icon"
          renderIcon={(icon) => <LucideGraphic icon={icon} className="wr-icon" />}
          onClose={() => setIconPickerOpen(false)}
          onClear={() => {
            onChange({ ...draft, titleIcon: null });
            setIconPickerOpen(false);
          }}
          onSelect={(icon) => {
            onChange({ ...draft, titleIcon: icon });
            setIconPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
