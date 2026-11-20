import {
  menuSourcePath,
  projectSourceFilePath,
  type WebRadProject,
} from '@webrad/project-model';

export interface ProjectDocumentBaseline {
  readonly project: WebRadProject;
  readonly userSources: Readonly<Record<string, string>>;
}

export interface ProjectDocumentChanges {
  readonly dirtyDocumentIds: ReadonlySet<string>;
  readonly stylesDirty: boolean;
}

interface DocumentContent {
  readonly model: unknown;
  readonly sourcePath?: string;
  readonly source?: string;
}

/** Compare persisted JSON values independently of object key insertion order. */
function sameContent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value: unknown, index: number) => sameContent(value, right[index]))
    );
  }
  const leftKeys = Object.keys(left).filter((key) => Reflect.get(left, key) !== undefined);
  const rightKeys = Object.keys(right).filter((key) => Reflect.get(right, key) !== undefined);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.hasOwn(right, key) && sameContent(Reflect.get(left, key), Reflect.get(right, key)),
  );
}

function documentContents(
  project: WebRadProject,
  sources: Readonly<Record<string, string>>,
): ReadonlyMap<string, DocumentContent> {
  const documents = new Map<string, DocumentContent>();
  const add = (id: string, model: unknown, sourcePath?: string): void => {
    documents.set(id, {
      model,
      sourcePath,
      source: sourcePath === undefined ? undefined : sources[sourcePath],
    });
  };
  for (const page of project.pages) add(page.id, page, `pages/${page.name}.ts`);
  for (const reusable of project.reusableElements)
    add(reusable.id, reusable, `reusables/${reusable.name}.ts`);
  for (const menu of project.menus ?? []) add(menu.id, menu, menuSourcePath(menu));
  for (const file of project.sourceFiles ?? []) add(file.id, file, projectSourceFilePath(file));
  for (const asset of project.assets ?? []) add(asset.id, asset);
  return documents;
}

/** Model and authored source belong to one document, identified by its stable ID. */
export function projectDocumentChanges(
  project: WebRadProject | null,
  sources: Readonly<Record<string, string>>,
  saved: ProjectDocumentBaseline | null,
): ProjectDocumentChanges {
  const dirtyDocumentIds = new Set<string>();
  if (project === null) return { dirtyDocumentIds, stylesDirty: false };
  const previous = saved === null
    ? new Map<string, DocumentContent>()
    : documentContents(saved.project, saved.userSources);
  for (const [id, content] of documentContents(project, sources)) {
    if (!sameContent(content, previous.get(id))) dirtyDocumentIds.add(id);
  }
  return {
    dirtyDocumentIds,
    stylesDirty:
      saved === null || !sameContent(project.styles, saved.project.styles) ||
      !sameContent(project.settings.themes, saved.project.settings.themes),
  };
}
