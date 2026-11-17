import ts from 'typescript';

export const PRIVATE_CONTEXT_VALUE = '[private value omitted]';
const privateName = /password|secret|token|authorization|api[-_]?key|credential|cookie|headers/i;

function safeUrl(text: string): string {
  if (!text.startsWith('https://') && !text.startsWith('http://')) return text;
  try {
    const url = new URL(text);
    let changed = false;
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
      changed = true;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (privateName.test(key) || key.toLowerCase() === 'key') {
        url.searchParams.set(key, PRIVATE_CONTEXT_VALUE);
        changed = true;
      }
    }
    return changed ? url.href : text;
  } catch {
    return text;
  }
}

/** Data projection only; never changes the saved Project Model. */
export function redactCodexData(value: unknown, depth = 0): unknown {
  if (depth > 32) return '[nested context omitted]';
  if (typeof value === 'string') return safeUrl(value);
  if (Array.isArray(value)) return value.map((item) => redactCodexData(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      privateName.test(key) ? PRIVATE_CONTEXT_VALUE : redactCodexData(entry, depth + 1),
    ]));
  }
  return value;
}

/** Mask literal credentials in a model-only source snapshot using AST ranges. */
export function codexSourceSnapshot(path: string, text: string): string {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const replacements = new Map<number, { end: number; text: string }>();
  const mask = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      replacements.set(node.getStart(file), { end: node.end, text: JSON.stringify(PRIVATE_CONTEXT_VALUE) });
    } else {
      ts.forEachChild(node, mask);
    }
  };
  const privateTarget = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return privateName.test(node.text);
    }
    if (ts.isPropertyAccessExpression(node)) return privateTarget(node.name) || privateTarget(node.expression);
    if (ts.isElementAccessExpression(node)) return privateTarget(node.expression) || privateTarget(node.argumentExpression);
    return false;
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) && node.initializer) {
      if (privateTarget(node.name)) {
        mask(node.initializer);
        return;
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && privateTarget(node.left)) {
      mask(node.right);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const safe = safeUrl(node.text);
      if (safe !== node.text) replacements.set(node.getStart(file), { end: node.end, text: JSON.stringify(safe) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let result = text;
  for (const [start, replacement] of [...replacements].sort(([left], [right]) => right - left)) {
    result = result.slice(0, start) + replacement.text + result.slice(replacement.end);
  }
  return result;
}

export function codexSourceOutline(path: string, text: string): string {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const outline = ts.transform(source, [(context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isBlock(node)) return ts.factory.createBlock([], false);
      if (ts.isVariableDeclaration(node)) {
        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, undefined);
      }
      if (ts.isPropertyDeclaration(node)) {
        return ts.factory.updatePropertyDeclaration(node, node.modifiers, node.name, node.questionToken ?? node.exclamationToken, node.type, undefined);
      }
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return ts.factory.createIdentifier('__implementation_omitted');
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit, ts.isSourceFile) ?? file;
  }]);
  try {
    return printer.printFile(outline.transformed[0] ?? source);
  } finally {
    outline.dispose();
  }
}
