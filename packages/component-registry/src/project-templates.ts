import {
  applyProjectThemePreset,
  createProject,
  type ProjectThemePresetId,
  type WebRadProject,
} from '@webrad/project-model';
import { createAuroraWorkspace } from './templates/aurora-workspace.js';

export const PROJECT_TEMPLATE_IDS = ['blank', 'aurora-workspace'] as const;
export type ProjectTemplateId = (typeof PROJECT_TEMPLATE_IDS)[number];

export const PROJECT_TEMPLATES: readonly {
  readonly id: ProjectTemplateId;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: 'blank', label: 'Blank project', description: 'A clean canvas for your own idea.' },
  {
    id: 'aurora-workspace',
    label: 'Examples & Tutorial',
    description:
      'Learn WebRAD with editable examples of components, reusable menus, API requests and RestGO accounts across 13 pages.',
  },
];

export interface ProjectTemplateResult {
  readonly project: WebRadProject;
  /** Initial authored files, used only while creating a new, empty project folder. */
  readonly userSources: Readonly<Record<string, string>>;
}

/** Templates materialize ordinary editable documents with no saved template dependency. */
export function createProjectFromTemplate(
  name: string,
  templateId: ProjectTemplateId = 'blank',
  themePresetId: ProjectThemePresetId = 'aurora',
): ProjectTemplateResult {
  switch (templateId) {
    case 'blank':
      return {
        project: applyProjectThemePreset(createProject(name), themePresetId),
        userSources: {},
      };
    case 'aurora-workspace': {
      const result = createAuroraWorkspace(name);
      return { ...result, project: applyProjectThemePreset(result.project, themePresetId) };
    }
    default:
      throw new Error('Unknown project template: ' + String(templateId));
  }
}
