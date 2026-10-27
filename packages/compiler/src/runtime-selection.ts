import ts from 'typescript';
import path from 'node:path';
import type { WebRadProject } from '@webrad/project-model';
import type { ComponentRegistry } from '@webrad/component-registry';

interface RuntimeModuleExports {
  readonly source: string;
  readonly names: ReadonlySet<string>;
}

// Cache only export metadata, never bound syntax trees or diagnostics. Embedded
// modules are immutable in the IDE; exact text checks also keep replacement
// source catalogs correct without retaining their previous contents.
const runtimeExports = new WeakMap<
  Readonly<Record<string, string>>,
  Map<string, RuntimeModuleExports>
>();

function runtimeModuleValueExports(
  moduleFile: string,
  sources: Readonly<Record<string, string>>,
): ReadonlySet<string> {
  let modules = runtimeExports.get(sources);
  if (modules === undefined) {
    modules = new Map();
    runtimeExports.set(sources, modules);
  }
  const source = sources[moduleFile] ?? '';
  const previous = modules.get(moduleFile);
  if (previous?.source === source) return previous.names;
  const module = ts.createSourceFile(moduleFile, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of module.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      !statement.isTypeOnly
    ) {
      for (const binding of statement.exportClause.elements)
        if (!binding.isTypeOnly) names.add(binding.name.text);
    }
    if (
      !ts.canHaveModifiers(statement) ||
      !ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      names.add(statement.name.text);
    if (ts.isVariableStatement(statement))
      for (const variable of statement.declarationList.declarations)
        if (ts.isIdentifier(variable.name)) names.add(variable.name.text);
  }
  modules.set(moduleFile, { source, names });
  return names;
}

let previousAdapterSelection:
  { readonly source: string; readonly types: string; readonly result: string } | undefined;

/** Resolve the public barrel only to the value exports reachable from application code. */
export function selectRuntimeExports(
  sources: ReadonlyMap<string, string>,
  entryPath: string,
  runtimeSources: Readonly<Record<string, string>>,
  resolveRelative: (importer: string, specifier: string) => readonly string[],
): string {
  const names = new Set<string>();
  const visited = new Set<string>();
  const pending = [entryPath];
  let fullBarrel = false;
  for (let index = 0; index < pending.length; index += 1) {
    const fileName = pending[index];
    if (fileName === undefined || visited.has(fileName)) continue;
    visited.add(fileName);
    const file = ts.createSourceFile(
      fileName,
      sources.get(fileName) ?? '',
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        if (node.importClause?.isTypeOnly) return;
        const specifier = node.moduleSpecifier.text;
        if (specifier === '@webrad/runtime') {
          const bindings = node.importClause?.namedBindings;
          if (bindings === undefined || ts.isNamespaceImport(bindings)) fullBarrel = true;
          else
            for (const binding of bindings.elements)
              if (!binding.isTypeOnly) names.add((binding.propertyName ?? binding.name).text);
        } else if (specifier.startsWith('.')) {
          const resolved = resolveRelative(fileName, specifier).find((candidate) =>
            sources.has(candidate),
          );
          if (resolved !== undefined) pending.push(resolved);
        }
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const specifier = node.moduleSpecifier.text;
        if (specifier === '@webrad/runtime') {
          if (node.exportClause === undefined || !ts.isNamedExports(node.exportClause))
            fullBarrel = true;
          else
            for (const binding of node.exportClause.elements)
              if (!binding.isTypeOnly) names.add((binding.propertyName ?? binding.name).text);
        } else if (specifier.startsWith('.')) {
          const resolved = resolveRelative(fileName, specifier).find((candidate) =>
            sources.has(candidate),
          );
          if (resolved !== undefined) pending.push(resolved);
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (specifier === undefined || !ts.isStringLiteral(specifier)) fullBarrel = true;
        else if (specifier.text === '@webrad/runtime') fullBarrel = true;
        else if (specifier.text.startsWith('.')) {
          const resolved = resolveRelative(fileName, specifier.text).find((candidate) =>
            sources.has(candidate),
          );
          if (resolved !== undefined) pending.push(resolved);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const indexSource = runtimeSources['index.ts'] ?? '';
  if (fullBarrel) return indexSource;
  const exportsByModule = new Map<string, Set<string>>();
  const index = ts.createSourceFile('index.ts', indexSource, ts.ScriptTarget.Latest, true);
  for (const declaration of index.statements) {
    if (
      !ts.isExportDeclaration(declaration) ||
      declaration.isTypeOnly ||
      !declaration.moduleSpecifier ||
      !ts.isStringLiteral(declaration.moduleSpecifier)
    )
      continue;
    const specifier = declaration.moduleSpecifier.text;
    const moduleFile = specifier.replace(/^\.\//u, '').replace(/\.js$/u, '.ts');
    const moduleExports =
      declaration.exportClause && ts.isNamedExports(declaration.exportClause)
        ? new Set(
            declaration.exportClause.elements
              .filter((binding) => !binding.isTypeOnly)
              .map((binding) => binding.name.text),
          )
        : runtimeModuleValueExports(moduleFile, runtimeSources);
    const selected = [...moduleExports].filter((name) => names.has(name));
    if (selected.length > 0) exportsByModule.set(specifier, new Set(selected));
  }
  const resolved = new Set([...exportsByModule.values()].flatMap((selected) => [...selected]));
  // New public exports fail safely until their declaration shape is understood.
  if ([...names].some((name) => !resolved.has(name))) return indexSource;
  return [...exportsByModule]
    .map(
      ([module, selected]) =>
        `export { ${[...selected].join(', ')} } from ${JSON.stringify(module)};`,
    )
    .join('\n');
}

/** Keeps the authored central registry as the source of every selected adapter. */
export function selectRuntimeAdapters(source: string, componentTypes: ReadonlySet<string>): string {
  const types = JSON.stringify([...componentTypes].sort());
  if (previousAdapterSelection?.source === source && previousAdapterSelection.types === types)
    return previousAdapterSelection.result;
  const file = ts.createSourceFile('render.ts', source, ts.ScriptTarget.Latest, true);
  const transformed = ts.transform(file, [
    (context) => {
      const visit: ts.Visitor = (node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'register' &&
          ts.isStringLiteral(node.arguments[0] ?? ts.factory.createNull())
        ) {
          const name = node.arguments[0] as ts.StringLiteral;
          if (!componentTypes.has(name.text))
            return ts.visitNode(node.expression.expression, visit);
        }
        // These structural row branches cannot run when the project has no row template.
        if (
          !componentTypes.has('WebRepeatingGroup') &&
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
          ts.isIdentifier(node.right) &&
          node.right.text === 'WebRepeatingGroup'
        )
          return ts.factory.createFalse();
        return ts.visitEachChild(node, visit, context);
      };
      return (root) => ts.visitNode(root, visit) as ts.SourceFile;
    },
  ]);
  try {
    const result = ts.createPrinter().printFile(transformed.transformed[0] as ts.SourceFile);
    previousAdapterSelection = { source, types, result };
    return result;
  } finally {
    transformed.dispose();
  }
}

/** Embedded globals are opt-in; the full typed authoring surface remains available. */
export function usesRuntimeGlobal(
  userSources: Readonly<Record<string, string>>,
  name: string,
): boolean {
  return Object.entries(userSources).some(([fileName, source]) => {
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
    let used = false;
    const visit = (node: ts.Node): void => {
      if ((ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === name)
        used = true;
      if (
        (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
        ts.isIdentifier(node.expression) &&
        ['eval', 'Function'].includes(node.expression.text)
      )
        used = true;
      ts.forEachChild(node, visit);
    };
    visit(file);
    return used;
  });
}

export function usesRestGo(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
): boolean {
  if (project.settings.restGo.enabled || usesRuntimeGlobal(userSources, 'RestGO')) return true;
  if (
    [...project.pages, ...project.reusableElements].some((document) =>
      document.components.some(
        (component) =>
          ['WebApiClient', 'WebFileUpload', 'WebVideoUpload'].includes(component.type) ||
          ['OnLogin', 'OnLogout', 'OnUnauthenticated'].some(
            (event) => component.events[event] != null,
          ),
      ),
    )
  )
    return true;
  return Object.entries(userSources).some(([name, source]) => {
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    let used = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) &&
        /^(RestGO|configureRestGo|getRestGoClient|getRestGoApplicationToken|RestGoNotConfiguredError)$/u.test(
          node.text,
        )
      )
        used = true;
      if (ts.isStringLiteral(node) && node.text === '@webrad/restgo-sdk') used = true;
      ts.forEachChild(node, visit);
    };
    visit(file);
    return used;
  });
}

export interface ApplicationSelection {
  readonly project: WebRadProject;
  readonly userSources: Readonly<Record<string, string>>;
  readonly dynamicRegistry: boolean;
  readonly extraComponentTypes: ReadonlySet<string>;
}

export function selectedComponentTypes(
  selection: ApplicationSelection,
  registry: ComponentRegistry,
): ReadonlySet<string> {
  return new Set([
    ...(selection.dynamicRegistry
      ? registry.list().map((definition) => definition.type)
      : [...selection.project.pages, ...selection.project.reusableElements].flatMap((document) =>
          document.components.map((component) => component.type),
        )),
    ...selection.extraComponentTypes,
  ]);
}

/** Traverses authored imports from real page roots and each actual reusable placement. */
export function selectApplicationSources(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
): ApplicationSelection {
  const normalizedSources = new Map(
    Object.entries(userSources).map(([name, source]) => [name.replaceAll('\\', '/'), source]),
  );
  const retained = new Set<string>();
  const visited = new Set<string>();
  const pending = project.pages.map((document) => `pages/${document.name}.ts`);
  const extraComponentTypes = new Set<string>();
  let dynamicRegistry = false;
  const addDefinition = (id: string): void => {
    if (retained.has(id)) return;
    const definition = project.reusableElements.find((candidate) => candidate.id === id);
    if (definition === undefined) return;
    retained.add(id);
    pending.push(`reusables/${definition.name}.ts`);
  };
  const addPlacements = (document: WebRadProject['pages'][number]): void => {
    for (const component of document.components) {
      if (typeof component.props.reusableElementId === 'string')
        addDefinition(component.props.reusableElementId);
    }
  };
  for (const document of project.pages) addPlacements(document);
  const addDependency = (importer: string, specifier: string): void => {
    if (!specifier.startsWith('.')) return;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
    const extension = path.posix.extname(resolved);
    const candidates =
      extension === '.js' || extension === '.mjs'
        ? [`${resolved.slice(0, -extension.length)}.ts`, resolved]
        : extension
          ? [resolved]
          : [`${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`];
    const dependency = candidates.find((candidate) => normalizedSources.has(candidate));
    if (dependency !== undefined) pending.push(dependency);
  };
  for (let index = 0; index < pending.length; index += 1) {
    const name = pending[index];
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const definition = project.reusableElements.find(
      (candidate) => name === `reusables/${candidate.name}.ts`,
    );
    if (definition !== undefined) {
      retained.add(definition.id);
      addPlacements(definition);
    }
    const source = normalizedSources.get(name);
    if (source === undefined) continue;
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node) &&
        !node.importClause?.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        addDependency(name, node.moduleSpecifier.text);
        if (
          node.moduleSpecifier.text === '@webrad/runtime' &&
          node.importClause?.namedBindings &&
          ts.isNamespaceImport(node.importClause.namedBindings)
        )
          dynamicRegistry = true;
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        addDependency(name, node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = node.arguments[0];
        if (specifier && ts.isStringLiteral(specifier)) {
          addDependency(name, specifier.text);
          if (specifier.text === '@webrad/runtime') dynamicRegistry = true;
        } else {
          dynamicRegistry = true;
          pending.push(...normalizedSources.keys());
          for (const reusable of project.reusableElements) addDefinition(reusable.id);
        }
      }
      if (ts.isIdentifier(node)) {
        if (
          ['runtimeComponentRegistry', 'RuntimeComponentRegistry', 'mountPage'].includes(node.text)
        )
          dynamicRegistry = true;
        // Authored construction of a row group can use the renderer's row branches.
        if (/^Web[A-Z]/u.test(node.text)) extraComponentTypes.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const reusableElements = project.reusableElements.filter((definition) =>
    retained.has(definition.id),
  );
  const styleIds = new Set(
    [...project.pages, ...reusableElements].flatMap((document) =>
      document.components.flatMap((component) =>
        component.styleId === undefined ? [] : [component.styleId],
      ),
    ),
  );
  return {
    project: {
      ...project,
      reusableElements,
      styles: dynamicRegistry
        ? project.styles
        : project.styles.filter((style) => styleIds.has(style.id)),
    },
    userSources: Object.fromEntries([...normalizedSources].filter(([name]) => visited.has(name))),
    dynamicRegistry,
    extraComponentTypes,
  };
}

/** All pages remain routable; only reachable reusable definitions are materialized. */
export function selectUsedProject(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
): WebRadProject {
  return selectApplicationSources(project, userSources).project;
}
