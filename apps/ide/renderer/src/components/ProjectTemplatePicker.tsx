import { PROJECT_TEMPLATES, type ProjectTemplateId } from '@webrad/component-registry';
import type { CSSProperties, ReactElement } from 'react';
import { PROJECT_THEME_PRESETS, type ProjectThemePresetId } from '@webrad/project-model';

interface ProjectTemplatePickerProps {
  readonly value: ProjectTemplateId;
  readonly themePresetId: ProjectThemePresetId;
  readonly disabled: boolean;
  readonly onChange: (value: ProjectTemplateId) => void;
}

export function ProjectTemplatePicker({
  value,
  themePresetId,
  disabled,
  onChange,
}: ProjectTemplatePickerProps): ReactElement {
  const preset =
    PROJECT_THEME_PRESETS.find((entry) => entry.id === themePresetId) ?? PROJECT_THEME_PRESETS[0];
  const colors = preset?.themes.colors;
  const previewStyle =
    colors === undefined
      ? undefined
      : ({
          '--wr-template-background': colors.background.light,
          '--wr-template-surface': colors.surface.light,
          '--wr-template-border': colors.border.light,
          '--wr-template-text': colors.heading.light,
          '--wr-template-primary': colors.primary.light,
          '--wr-template-accent': colors.accent.light,
          '--wr-template-radius': '8px',
          '--wr-template-fill':
            themePresetId === 'flat' || themePresetId === 'webrad'
              ? colors.primary.light
              : 'linear-gradient(135deg, ' +
                colors.primary.light +
                ', ' +
                colors.accent.light +
                ')',
        } as CSSProperties);

  return (
    <fieldset className="wr-project-templates" disabled={disabled}>
      <legend>Start with</legend>
      <div className="wr-project-template-grid">
        {PROJECT_TEMPLATES.map((template) => (
          <label className="wr-project-template" key={template.id}>
            <input
              type="radio"
              name="project-template"
              value={template.id}
              checked={value === template.id}
              aria-labelledby={'project-template-' + template.id + '-label'}
              aria-describedby={'project-template-' + template.id + '-description'}
              onChange={() => onChange(template.id)}
            />
            <span className="wr-project-template-card">
              <strong id={'project-template-' + template.id + '-label'}>{template.label}</strong>
              <span
                className={'wr-project-template-preview ' + template.id}
                style={previewStyle}
                data-theme={themePresetId}
                aria-hidden="true"
              >
                {template.id === 'blank' ? (
                  <span className="wr-template-empty">+</span>
                ) : (
                  <span className="wr-template-workspace">
                    <span className="wr-template-sidebar">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i className="wr-template-user" />
                    </span>
                    <span className="wr-template-brand">
                      Tutorial <i />
                    </span>
                    <span className="wr-template-hero">
                      <small>EXPLORE / EDIT / RUN</small>
                      <strong>Learn by building.</strong>
                      <i />
                    </span>
                    <span className="wr-template-metrics">
                      <i>Forms</i>
                      <i>Data</i>
                      <i>Media</i>
                    </span>
                  </span>
                )}
              </span>
              <span
                id={'project-template-' + template.id + '-description'}
                className="wr-project-template-description"
              >
                {template.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
