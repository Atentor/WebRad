import { PROJECT_TEMPLATES, type ProjectTemplateId } from '@webrad/component-registry';
import type { ReactElement } from 'react';

interface ProjectTemplatePickerProps {
  readonly value: ProjectTemplateId;
  readonly disabled: boolean;
  readonly onChange: (value: ProjectTemplateId) => void;
}

export function ProjectTemplatePicker({
  value,
  disabled,
  onChange,
}: ProjectTemplatePickerProps): ReactElement {
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
              onChange={() => onChange(template.id)}
            />
            <span className="wr-project-template-card">
              <span className={`wr-project-template-preview ${template.id}`} aria-hidden="true">
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
                      Aurora <i />
                    </span>
                    <span className="wr-template-hero">
                      <small>DEFAULT STYLES</small>
                      <strong>
                        Every
                        <br />
                        component.
                      </strong>
                      <i />
                    </span>
                    <span className="wr-template-metrics">
                      <i>25</i>
                      <i>Default</i>
                      <i>13 pages</i>
                    </span>
                    <span className="wr-template-panels">
                      <i />
                      <i />
                    </span>
                  </span>
                )}
              </span>
              <strong>{template.label}</strong>
              <span className="wr-project-template-description">{template.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
