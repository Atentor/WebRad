import ts from 'typescript';
import type { CancellationToken, editor, languages, Position } from 'monaco-editor/editor';
import type { DebugBridge } from '../../shared/debugger-contracts';

export interface DebugHoverContext {
  readonly bridge: DebugBridge;
  readonly sessionId: string;
  readonly frameId: string;
  readonly path: string;
}

function inspectable(node: ts.Node): boolean {
  if (ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (ts.isPropertyAccessExpression(node)) return inspectable(node.expression);
  if (ts.isElementAccessExpression(node))
    return (
      inspectable(node.expression) &&
      (ts.isStringLiteral(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression))
    );
  return false;
}

/** Select a reference under the pointer, never an assignment or a function call. */
export function debugHoverExpression(source: string, offset: number) {
  const file = ts.createSourceFile('hover.ts', source, ts.ScriptTarget.Latest, true);
  let selected: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (offset < node.getStart(file) || offset >= node.end || ts.isTypeNode(node)) return;
    if (ts.isIdentifier(node) || node.kind === ts.SyntaxKind.ThisKeyword) selected = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (selected === undefined) return null;
  const parent = selected.parent;
  if (
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent)) &&
      parent.name === selected)
  )
    return null;
  if (ts.isPropertyAccessExpression(parent) && parent.name === selected) selected = parent;
  if (!inspectable(selected)) return null;
  return { expression: selected.getText(file), start: selected.getStart(file), end: selected.end };
}

function codeBlock(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
  return `${fence}text\n${text}\n${fence}`;
}

export function createDebugHoverProvider(
  context: () => DebugHoverContext | null | undefined,
  activeModel: () => editor.ITextModel | null | undefined,
): languages.HoverProvider {
  return {
    async provideHover(model: editor.ITextModel, position: Position, token: CancellationToken) {
      const snapshot = context();
      if (
        !snapshot ||
        activeModel() !== model ||
        token.isCancellationRequested ||
        model.isDisposed()
      )
        return null;
      const version = model.getVersionId();
      const reference = debugHoverExpression(model.getValue(), model.getOffsetAt(position));
      if (!reference) return null;
      try {
        const result = await snapshot.bridge.evaluate({
          sessionId: snapshot.sessionId,
          frameId: snapshot.frameId,
          expression: reference.expression,
          throwOnSideEffect: true,
        });
        if (
          result.error ||
          token.isCancellationRequested ||
          model.isDisposed() ||
          model.getVersionId() !== version ||
          context() !== snapshot ||
          activeModel() !== model
        )
          return null;
        const start = model.getPositionAt(reference.start);
        const end = model.getPositionAt(reference.end);
        return {
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          contents: [
            {
              value: `**Debug**\n\n${codeBlock(`${reference.expression} = ${result.value.description}`)}`,
              isTrusted: false,
              supportHtml: false,
            },
          ],
        };
      } catch {
        // Out-of-scope references and expired paused frames keep the normal TypeScript hover.
        return null;
      }
    },
  };
}
