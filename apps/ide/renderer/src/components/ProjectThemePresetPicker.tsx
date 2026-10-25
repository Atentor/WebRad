import { PROJECT_THEME_PRESETS, type ProjectThemePresetId } from '@webrad/project-model';
import type { ReactElement } from 'react';

interface ProjectThemePresetPickerProps {
  readonly value: ProjectThemePresetId;
  readonly disabled: boolean;
  readonly onChange: (value: ProjectThemePresetId) => void;
}

export function ProjectThemePresetPicker({
  value,
  disabled,
  onChange,
}: ProjectThemePresetPickerProps): ReactElement {
  return (
    <fieldset className="wr-project-templates wr-project-theme-presets" disabled={disabled}>
      <legend>Application theme</legend>
      <div className="wr-project-theme-grid">
        {PROJECT_THEME_PRESETS.map((preset) => (
          <label className="wr-project-template" key={preset.id}>
            <input
              type="radio"
              name="project-theme"
              value={preset.id}
              checked={value === preset.id}
              onChange={() => onChange(preset.id)}
            />
            <span className="wr-project-template-card">
              <strong>{preset.label}</strong>
              <span className="wr-project-theme-preview" aria-hidden="true">
                {(['light', 'dark'] as const).map((mode) => {
                  const colors = preset.themes.colors;
                  const square = preset.id === 'webrad';
                  const flat = preset.id === 'flat' || square;
                  return (
                    <span
                      key={mode}
                      className="wr-project-theme-sample"
                      style={{
                        color: colors.text[mode],
                        background: flat
                          ? colors.background[mode]
                          : `linear-gradient(135deg, ${colors.background[mode]}, ${colors['background-end'][mode]})`,
                      }}
                    >
                      <small>{mode === 'light' ? 'Light' : 'Dark'}</small>
                      <span
                        className="wr-project-theme-surface"
                        style={{
                          background: colors.surface[mode],
                          borderColor: colors.border[mode],
                          borderRadius: square ? 0 : flat ? 3 : preset.id === 'prism' ? 9 : 5,
                          boxShadow: flat ? 'none' : '0 3px 8px #00000012',
                        }}
                      >
                        <b style={{ color: colors.heading[mode] }}>Aa</b>
                        <i
                          style={{
                            background: colors.primary[mode],
                            ...(square ? { borderRadius: 0 } : {}),
                          }}
                        />
                        <i
                          style={{
                            background: colors.accent[mode],
                            ...(square ? { borderRadius: 0 } : {}),
                          }}
                        />
                        <i
                          style={{
                            background: colors.success[mode],
                            ...(square ? { borderRadius: 0 } : {}),
                          }}
                        />
                      </span>
                    </span>
                  );
                })}
              </span>
              <span className="wr-project-template-description">{preset.description}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="wr-project-theme-hint">
        All themes include Light and Dark. Customize colors and styles after creation.
      </p>
    </fieldset>
  );
}
