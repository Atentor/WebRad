import ts from 'typescript';

/** Collect package roots/subpaths without treating comments, strings or relative Units as imports. */
export function collectExternalPackageImports(sources: Readonly<Record<string, string>>): string[] {
  const imports = new Set<string>();
  const remember = (value: ts.Node | undefined): void => {
    if (value === undefined || !ts.isStringLiteralLike(value)) return;
    const name = value.text;
    if (
      !name ||
      name.startsWith('.') ||
      name.startsWith('/') ||
      name.startsWith('#') ||
      name === '@webrad/runtime' ||
      name.startsWith('@webrad/runtime/') ||
      name === '@webrad/restgo-sdk' ||
      name.startsWith('@webrad/restgo-sdk/')
    )
      return;
    imports.add(name);
  };
  for (const [name, source] of Object.entries(sources)) {
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        remember(node.moduleSpecifier);
      else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        remember(node.moduleReference.expression);
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        remember(node.argument.literal);
      else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      )
        remember(node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return [...imports].sort();
}
