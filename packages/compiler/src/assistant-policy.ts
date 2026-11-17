import ts from 'typescript';

/** Additional semantic checks apply only to methods authored by the assistant. */
export function assistantMethodDiagnostics(
  program: ts.Program,
  source: ts.SourceFile,
  names: ReadonlySet<string>,
  className?: string,
): readonly ts.Diagnostic[] {
  const checker = program.getTypeChecker();
  const diagnostics: ts.Diagnostic[] = [];
  const domTypes = new Set(['Node', 'Element', 'Document', 'Window', 'CSSStyleDeclaration']);
  const isDomNode = (type: ts.Type, depth = 0): boolean => {
    if (depth > 12) return false;
    if (type.isUnionOrIntersection()) return type.types.some((item) => isDomNode(item, depth + 1));
    const symbol = type.getSymbol();
    if (symbol?.getName() === 'WebHtml') return true;
    if (symbol && domTypes.has(symbol.getName()) && symbol.declarations?.some((declaration) => declaration.getSourceFile().fileName.endsWith('lib.dom.d.ts'))) return true;
    if ((type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.ClassOrInterface) !== 0) {
      return checker.getBaseTypes(type as ts.InterfaceType).some((base) => isDomNode(base, depth + 1));
    }
    return false;
  };
  const report = (node: ts.Node, message: string): void => {
    diagnostics.push({
      category: ts.DiagnosticCategory.Error,
      code: 98001,
      file: source,
      start: node.getStart(source),
      length: node.getWidth(source),
      messageText: message,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node) || ts.isAwaitExpression(node)) {
      const type = checker.getTypeAtLocation(node);
      if ((type.flags & ts.TypeFlags.Any) !== 0) report(node, 'Codex-authored methods cannot use values with type any. Use a typed component API or narrow an unknown value.');
      else if (isDomNode(type)) report(node, 'Codex-authored interfaces must use the public WebRAD component API instead of DOM objects.');
    }
    if (ts.isElementAccessExpression(node)) {
      const index = checker.getTypeAtLocation(node.argumentExpression);
      if ((index.flags & ts.TypeFlags.NumberLike) === 0) report(node, 'Codex must use typed named members. Computed access is available only for numeric indexes.');
    }
    if (ts.isCallExpression(node)) {
      const signature = checker.getResolvedSignature(node);
      const declaration = signature?.getDeclaration();
      if (declaration?.getSourceFile().fileName.endsWith('lib.dom.d.ts')) {
        const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
        if (!['preventDefault', 'stopPropagation', 'stopImmediatePropagation'].includes(name)) {
          report(node, 'Use a typed WebRAD component operation instead of calling browser DOM APIs.');
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || (className !== undefined && statement.name?.text !== className)) continue;
    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && names.has(member.name.text)) visit(member);
    }
  }
  return diagnostics;
}
