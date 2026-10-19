import {
  ChangePropertyCommand,
  synchronizeRestGoApiConfiguration,
  type RestGoPublishedApi,
} from '@webrad/designer';
import { parseApiClientConfiguration, type PageModel } from '@webrad/project-model';
import type { DesignerController } from './designer-controller';
import type { ProjectController } from './project-controller';

export interface RestGoApiSyncResult {
  readonly updated: number;
  readonly issues: readonly string[];
}

/** Applies catalog changes to the authoritative model, including unopened pages and reusables. */
export function synchronizeProjectRestGoClients(
  projectController: ProjectController,
  designerController: DesignerController,
  projectId: string,
  baseUrl: string,
  apis: readonly RestGoPublishedApi[],
): RestGoApiSyncResult {
  const project = projectController.getSnapshot().project;
  if (
    !project ||
    project.id !== projectId ||
    !project.settings.restGo.enabled ||
    project.settings.restGo.baseUrl.trim().replace(/\/+$/u, '') !==
      baseUrl.trim().replace(/\/+$/u, '')
  )
    return { updated: 0, issues: [] };
  let updated = 0;
  const issues: string[] = [];
  const synchronize = <T extends PageModel>(document: T): T => {
    const commands: ChangePropertyCommand[] = [];
    for (const component of document.components) {
      if (component.type !== 'WebApiClient') continue;
      try {
        const current = parseApiClientConfiguration(component.props.apiClientConfig);
        const next = synchronizeRestGoApiConfiguration(current, apis);
        if (next === current) continue;
        commands.push(new ChangePropertyCommand(component.id, 'apiClientConfig', next));
      } catch (reason) {
        issues.push(
          `${document.name}.${component.name}: ${reason instanceof Error ? reason.message : 'Could not synchronize this API Client.'}`,
        );
      }
    }
    if (commands.length === 0) return document;
    updated += commands.length;
    return designerController.executeMany(
      document,
      'Synchronize RestGo API Clients',
      commands,
    ) as T;
  };
  const pages = project.pages.map(synchronize);
  const reusableElements = project.reusableElements.map(synchronize);
  if (updated > 0) projectController.replaceProject({ ...project, pages, reusableElements });
  return { updated, issues };
}
