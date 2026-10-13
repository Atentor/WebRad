import path from 'node:path';
import ts from 'typescript';
import { VIRTUAL_ROOT } from './source-graph.js';

/** Promotes only imported exports, so organizational files do not retain unused APIs. */
export function createDeployEntryPoints(
  sources: ReadonlyMap<string, string>,
  entryPath: string,
  usedSources: readonly string[],
  resolveRelative: (importer: string, specifier: string) => readonly string[],
): {
  readonly sources: ReadonlyMap<string, string>;
  readonly entryPoints: Readonly<Record<string, string>>;
} {
  const exports = new Map<string, Set<string> | null>();
  const visited = new Set<string>();
  const pending = [entryPath];
  const dependency = (
    importer: string,
    specifier: string,
    names: readonly string[] | null,
  ): void => {
    if (!specifier.startsWith('.')) return;
    const target = resolveRelative(importer, specifier).find((candidate) => sources.has(candidate));
    if (target === undefined) return;
    pending.push(target);
    if (names === null || exports.get(target) === null) exports.set(target, null);
    else exports.set(target, new Set([...(exports.get(target) ?? []), ...names]));
  };
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
      if (
        ts.isImportDeclaration(node) &&
        !node.importClause?.isTypeOnly &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const bindings = node.importClause?.namedBindings;
        const names =
          bindings && ts.isNamespaceImport(bindings)
            ? null
            : [
                ...(node.importClause?.name ? ['default'] : []),
                ...(bindings && ts.isNamedImports(bindings)
                  ? bindings.elements
                      .filter((binding) => !binding.isTypeOnly)
                      .map((binding) => (binding.propertyName ?? binding.name).text)
                  : []),
              ];
        dependency(fileName, node.moduleSpecifier.text, names);
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        dependency(
          fileName,
          node.moduleSpecifier.text,
          node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements
                .filter((binding) => !binding.isTypeOnly)
                .map((binding) => (binding.propertyName ?? binding.name).text)
            : null,
        );
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        dependency(fileName, node.arguments[0].text, null);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const deploymentSources = new Map(sources);
  const entryPoints: Record<string, string> = { 'assets/app': entryPath };
  for (const source of usedSources) {
    const relative = path.relative(VIRTUAL_ROOT, source).replaceAll('\\', '/');
    if (
      !/^(pages|reusables|models|units)\/.+\.ts$/u.test(relative) ||
      relative.endsWith('.generated.ts') ||
      relative.endsWith('.d.ts')
    )
      continue;
    const output = relative.replace(/^reusables\//u, 'reusable/').slice(0, -3);
    const names = exports.get(source);
    if (names === null || names === undefined) {
      entryPoints[output] = source;
      continue;
    }
    const wrapper = path.join(VIRTUAL_ROOT, '__deploy', ...relative.split('/'));
    const specifier = path.relative(path.dirname(wrapper), source).replaceAll('\\', '/');
    const exportedNames = [...names].map((name) =>
      /^[A-Za-z_$][\w$]*$/u.test(name) ? name : JSON.stringify(name),
    );
    deploymentSources.set(
      wrapper,
      exportedNames.length > 0
        ? `export { ${exportedNames.join(', ')} } from ${JSON.stringify(specifier)};`
        : `import ${JSON.stringify(specifier)};`,
    );
    entryPoints[output] = wrapper;
  }
  return { sources: deploymentSources, entryPoints };
}
