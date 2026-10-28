import { safeParseProject, type PageModel, type WebRadProject } from '@webrad/project-model';

/** Apply the same canonical document projection used by project commits. */
export function normalizeHistoryDocument(
  document: PageModel,
  project: WebRadProject | null,
): PageModel {
  if (!project) return document;
  const collection = project.pages.some((page) => page.id === document.id)
    ? 'pages'
    : project.menus?.some((menu) => menu.id === document.id) ? 'menus' : 'reusableElements';
  if (!project[collection]?.some((page) => page.id === document.id)) return document;
  const result = safeParseProject({
    ...project,
    [collection]: project[collection]?.map((page) => (page.id === document.id ? document : page)),
  });
  // Genuine external edits can invalidate an old command's references; let the
  // ordinary comparison reset that history instead of throwing during render.
  return result.success
    ? (result.data[collection]?.find((page) => page.id === document.id) ?? document)
    : document;
}
