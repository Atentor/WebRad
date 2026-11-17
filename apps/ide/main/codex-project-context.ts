import path from 'node:path';
import ts from 'typescript';
import { componentRegistry, getComponentInternalProperties } from '@webrad/component-registry';
import { menuSourcePath, type PageModel, type WebRadProject } from '@webrad/project-model';
import type { CodexContextSummary, CodexGenerateRequest } from '../shared/codex-contracts';
import { codexDocument } from '../shared/codex-project-edits';
import { codexSourceOutline, codexSourceSnapshot, redactCodexData } from './codex-context-data';

const CONTEXT_LIMIT = 1_200_000;

function publicDocument(document: PageModel): unknown {
  return redactCodexData({
    ...document,
    components: document.components.map((node) => {
      const definition = componentRegistry.get(node.type);
      const internalNames = new Set(
        definition ? getComponentInternalProperties(definition).map((property) => property.name) : [],
      );
      return {
        ...node,
        props: Object.fromEntries(Object.entries(node.props).filter(([key]) => !internalNames.has(key))),
      };
    }),
  });
}

function sourceImports(fileName: string, text: string): readonly string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>();
  for (const node of source.statements) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
  }
  return [...imports];
}

function sourcePriority(
  active: string,
  sources: Readonly<Record<string, string>>,
  names: readonly string[],
): readonly string[] {
  const available = new Set(names);
  const priority = new Set<string>();
  const queue = [
    active,
    ...names.filter((item) => !item.includes('/')),
    ...names.filter((item) => item.startsWith('models/') || item.startsWith('units/')),
    ...names,
  ].reverse();
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name || !available.has(name) || priority.has(name)) continue;
    priority.add(name);
    for (const imported of sourceImports(name, sources[name] ?? '')) {
      if (!imported.startsWith('.')) continue;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), imported));
      const withoutJs = base.endsWith('.js') ? base.slice(0, -3) : base;
      const resolved = [base, `${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}/index.ts`].find((candidate) => available.has(candidate));
      if (resolved && !priority.has(resolved)) queue.push(resolved);
    }
  }
  return [...priority];
}

/** All context comes from the current in-memory project snapshot, not disk. */
export function buildProjectContext(
  request: CodexGenerateRequest,
  project: WebRadProject,
  foundation: Readonly<Record<string, unknown>>,
): { readonly data: Readonly<Record<string, unknown>>; readonly summary: CodexContextSummary } {
  const active = codexDocument(project, request.documentId);
  const source = request.userSources[active.sourcePath];
  if (source === undefined) throw new Error('The active document has no authored source. Save or reopen it before using Codex.');
  const documents = [
    ...project.pages.map((page) => ({ page, kind: 'page', sourcePath: `pages/${page.name}.ts` })),
    ...project.reusableElements.map((page) => ({ page, kind: 'reusable', sourcePath: `reusables/${page.name}.ts` })),
    ...(project.menus ?? []).map((page) => ({ page, kind: 'menu', sourcePath: menuSourcePath(page) })),
  ];
  const sourceNames = Object.keys(request.userSources).filter((name) =>
    (name.endsWith('.ts') || name.endsWith('.tsx')) &&
    !name.endsWith('.generated.ts') && !name.endsWith('.generated.d.ts') &&
    !name.includes('\\') && !name.startsWith('/') && !name.includes(':') &&
    !name.split('/').some((part) => part === '..' || part === 'node_modules') && !name.includes('\0'),
  ).sort();
  const inventory = sourceNames.map((name) => ({
    path: name,
    characters: request.userSources[name]?.length ?? 0,
    coverage: name === active.sourcePath ? 'full' : 'omitted',
  }));
  const sourceDetails: { path: string; coverage: 'full' | 'outline'; text: string }[] = [];
  const documentDetails: unknown[] = [];
  const data = {
    ...foundation,
    activeDocument: publicDocument(active.page),
    documentKind: active.kind,
    sourcePath: active.sourcePath,
    authoredSource: codexSourceSnapshot(active.sourcePath, source),
    selection: request.selection.filter((id) => active.page.components.some((node) => node.id === id)),
    project: {
      id: project.id,
      name: project.name,
      entryPage: project.entryPage,
      documents: documents.map(({ page, kind, sourcePath }) => ({
        id: page.id, name: page.name, caption: page.caption, kind, sourcePath,
        route: kind === 'page' ? (page.id === project.entryPage ? '/index' : `/${page.name.toLowerCase()}`) : null,
        components: page.components.length,
        parameters: redactCodexData(page.parameters ?? []),
      })),
      sources: inventory,
      packages: project.packages?.dependencies ?? {},
      assets: (project.assets ?? []).map(({ id, fileName, mediaType, base64 }) => ({
        id, fileName, mediaType, encodedCharacters: base64.length,
      })),
      settings: {
        applicationName: project.settings.applicationName,
        description: project.settings.applicationDescription,
        locale: project.settings.locale,
        timeZone: project.settings.timeZone,
        routingMode: project.settings.routingMode,
        routingBasePath: project.settings.routingBasePath,
        themes: project.settings.themes,
        environment: project.settings.environment,
        environmentVariables: project.settings.environmentVariables.map(({ name }) => ({ name })),
        restGo: redactCodexData({
          enabled: project.settings.restGo.enabled,
          baseUrl: project.settings.restGo.baseUrl,
          apiVersion: project.settings.restGo.apiVersion,
          defaultDatabase: project.settings.restGo.defaultDatabase,
        }),
      },
    },
    readOnlyDocuments: documentDetails,
    readOnlySources: sourceDetails,
    recentConversation: redactCodexData(request.conversation),
    contextRules: {
      editableDocumentId: active.page.id,
      otherDocumentsAndSources: 'Read-only reference. Do not propose edits outside the active document.',
      sourceCoverage: 'full = complete sanitized source; outline = signatures without implementations; omitted = inventory only.',
      privateValues: 'Private configuration and recognizable literal credentials are omitted. Never copy omission markers into proposed code or properties.',
    },
  };
  let remaining = CONTEXT_LIMIT - JSON.stringify(data).length - request.prompt.length - 16_000;
  if (remaining < 0) throw new Error('The active document and project inventory exceed the Codex context limit. Open a smaller document or reduce its large inline content.');
  const append = <T>(target: T[], item: T, reserve = 0): boolean => {
    const length = JSON.stringify(item).length + 2;
    if (length > remaining - reserve) return false;
    target.push(item);
    remaining -= length;
    return true;
  };
  let fullSources = 1;
  let summarizedSources = 0;
  let omittedSources = 0;
  const documentReserve = documents.length > 1 ? Math.floor(remaining * 0.3) : 0;
  const inventoryByPath = new Map(inventory.map((entry) => [entry.path, entry]));
  // Reserve room for the project's visual composition as well as its typed code.
  for (const name of sourcePriority(active.sourcePath, request.userSources, sourceNames)) {
    if (name === active.sourcePath) continue;
    const text = codexSourceSnapshot(name, request.userSources[name] ?? '');
    const entry = inventoryByPath.get(name);
    if (append(sourceDetails, { path: name, coverage: 'full', text }, documentReserve)) {
      fullSources += 1;
      if (entry) entry.coverage = 'full';
    } else {
      const outline = codexSourceOutline(name, text);
      if (append(sourceDetails, { path: name, coverage: 'outline', text: outline }, documentReserve)) {
        summarizedSources += 1;
        if (entry) entry.coverage = 'outline';
      } else omittedSources += 1;
    }
  }
  let summarizedDocuments = 0;
  let omittedDocuments = 0;
  const activeReferences = JSON.stringify(active.page.components.map((node) => node.props));
  const supplemental = documents.filter(({ page }) => page.id !== active.page.id).sort((left, right) => {
    const rank = (id: string): number => activeReferences.includes(id) ? 0 : 1;
    return rank(left.page.id) - rank(right.page.id);
  });
  for (const { page, kind } of supplemental) {
    if (append(documentDetails, { kind, coverage: 'full', document: publicDocument(page) })) continue;
    const structure = {
      id: page.id, name: page.name, kind, coverage: 'structure', rootComponentId: page.rootComponentId,
      components: page.components.map(({ id, name, type, parentId, children, bounds, layout, styleId }) => ({
        id, name, type, parentId, children, bounds, layout, styleId,
      })),
    };
    if (append(documentDetails, structure)) summarizedDocuments += 1;
    else omittedDocuments += 1;
  }
  const characters = JSON.stringify(data).length;
  return {
    data,
    summary: {
      documents: documents.length,
      sources: sourceNames.length,
      fullSources, summarizedSources, omittedSources, summarizedDocuments, omittedDocuments,
      assets: project.assets?.length ?? 0,
      characters,
      limited: summarizedSources > 0 || omittedSources > 0 || summarizedDocuments > 0 || omittedDocuments > 0,
    },
  };
}
