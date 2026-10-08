import path from 'node:path';
import ts from 'typescript';

/** Real declaration emit keeps object API, generics and Monaco signatures in parity. */
export function createApiClientDeclarations(repositoryRoot) {
  const sourceNames = [
    'api-client-template.ts',
    'api-client-inputs.ts',
    'api-client-accessors.ts',
    'api-client.ts',
  ];
  const sourceRoot = path.join(repositoryRoot, 'packages', 'runtime', 'src');
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    declaration: true,
    emitDeclarationOnly: true,
    strict: true,
    skipLibCheck: true,
  };
  const declarations = new Map();
  const program = ts.createProgram(
    sourceNames.map((name) => path.join(sourceRoot, name)),
    compilerOptions,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => '\n',
      }),
    );
  }
  const emitted = program.emit(undefined, (fileName, content) => {
    const name = path.basename(fileName);
    if (sourceNames.some((source) => `${source.slice(0, -3)}.d.ts` === name)) {
      declarations.set(name, content);
    }
  });
  if (emitted.emitSkipped) throw new Error('Could not generate API Client declarations.');
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const names = new Set();
  const parts = [];
  for (const sourceName of sourceNames) {
    const name = `${sourceName.slice(0, -3)}.d.ts`;
    const content = declarations.get(name);
    if (content === undefined) throw new Error(`Missing API Client declaration ${name}.`);
    const source = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true);
    const sdkTypes = new Set();
    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === '@webrad/restgo-sdk' &&
        statement.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const element of statement.importClause.namedBindings.elements)
          sdkTypes.add(element.name.text);
      }
    }
    const transform = ts.transform(source, [
      (context) => {
        const visit = (node) => {
          if (node.kind === ts.SyntaxKind.DeclareKeyword) return undefined;
          if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
            if (node.typeName.text === 'TemplateBody') {
              return ts.factory.createTypeReferenceNode(
                'WebApiRequestBody',
                node.typeArguments?.map((argument) => ts.visitNode(argument, visit)),
              );
            }
            if (sdkTypes.has(node.typeName.text)) {
              return ts.factory.createImportTypeNode(
                ts.factory.createLiteralTypeNode(
                  ts.factory.createStringLiteral('@webrad/restgo-sdk'),
                ),
                undefined,
                ts.factory.createIdentifier(node.typeName.text),
                node.typeArguments?.map((argument) => ts.visitNode(argument, visit)),
              );
            }
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (node) => ts.visitNode(node, visit);
      },
    ]);
    try {
      const transformed = transform.transformed[0];
      for (const statement of transformed.statements) {
        if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
        if (ts.isInterfaceDeclaration(statement) && statement.name.text === 'TemplateBody')
          continue;
        if (
          ts.isInterfaceDeclaration(statement) ||
          ts.isTypeAliasDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isFunctionDeclaration(statement)
        ) {
          if (statement.name !== undefined) names.add(statement.name.text);
        } else if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
          }
        }
        parts.push(printer.printNode(ts.EmitHint.Unspecified, statement, transformed));
      }
    } finally {
      transform.dispose();
    }
  }
  return { source: `${parts.join('\n\n')}\n`, names: [...names].sort() };
}
