import ts from 'typescript';

import { renamePageUserSource, type RenamePageSourceResult } from './event-handler.js';

/** Repairs an entry scaffold whose model/file was renamed before its authored class. */
export function normalizeEntryPageUserSource(
  sourceText: string,
  fileName = 'pages/index.ts',
): RenamePageSourceResult {
  const unchanged = { sourceText, changed: false };
  const file = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const classes = file.statements.filter(ts.isClassDeclaration);
  // Never replace a current declaration or reinterpret ambiguous/custom exports.
  if (classes.some((declaration) => declaration.name?.text === 'index')) return unchanged;
  if (
    file.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) &&
        statement.exportClause !== undefined &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.some((binding) => binding.name.text === 'index'),
    )
  ) {
    return unchanged;
  }

  const candidates: { readonly name: string; readonly moduleName: string }[] = [];
  for (const declaration of classes) {
    const name = declaration.name?.text;
    const modifiers = ts.getModifiers(declaration);
    if (
      name === undefined ||
      modifiers === undefined ||
      !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
      modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      continue;
    }
    const bases = declaration.heritageClauses
      ?.filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
      .flatMap((clause) => clause.types);
    const base = bases?.[0]?.expression;
    if (base === undefined || !ts.isIdentifier(base)) continue;
    for (const statement of file.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.importClause?.isTypeOnly
      ) {
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
      const binding = bindings.elements.find(
        (specifier) => !specifier.isTypeOnly && specifier.name.text === base.text,
      );
      if (binding === undefined) continue;
      const importedName = (binding.propertyName ?? binding.name).text;
      const moduleName = importedName === `${name}Generated` ? name : 'index';
      if (
        importedName !== `${moduleName}Generated` ||
        statement.moduleSpecifier.text !== `./${moduleName}.generated`
      ) {
        continue;
      }
      candidates.push({ name, moduleName });
    }
  }
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  if (candidate === undefined) return unchanged;
  return renamePageUserSource(sourceText, candidate.name, 'index', fileName, candidate.moduleName);
}
