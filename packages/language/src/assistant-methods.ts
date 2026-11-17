import ts from 'typescript';

export interface AssistantMethodEdit {
  readonly name: string;
  /** One complete class method, including its typed signature and body. */
  readonly source: string;
}

export interface AssistantMethodOptions {
  /** Explicit project-owned type modules; these imports are erased by TypeScript. */
  readonly allowedTypeImports?: ReadonlySet<string>;
}

function assertNoPrivatePlaceholder(text: string): void {
  let candidate = text;
  const encoded = encodeURIComponent('[private value omitted]').toLowerCase();
  for (let depth = 0; depth < 3; depth += 1) {
    const lower = candidate.toLowerCase();
    if (candidate.includes('[private value omitted]') || lower.includes(encoded) || lower.includes(encoded.replaceAll('%20', '+'))) {
      throw new Error('Codex cannot replace private authored values with a redaction marker. Preserve the existing method instead.');
    }
    try {
      const decoded = decodeURIComponent(candidate.replaceAll('+', ' '));
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
}

/** Parse diagnostics come from a filesystem-free program using the same AST. */
function assertValidSyntax(file: ts.SourceFile, description: string): void {
  const host: ts.CompilerHost = {
    getSourceFile: (name) => name === file.fileName ? file : undefined,
    getDefaultLibFileName: () => '',
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (name) => name === file.fileName,
    readFile: (name) => name === file.fileName ? file.text : undefined,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram([file.fileName], {
    noLib: true,
    noResolve: true,
    noEmit: true,
    target: ts.ScriptTarget.Latest,
  }, host);
  const error = program.getSyntacticDiagnostics(file)[0];
  if (error) throw new Error(`${description}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`);
}

const forbiddenIdentifiers = new Set([
  'document', 'window', 'globalThis', 'self', 'eval', 'Function', 'Reflect', 'Proxy',
  'require', 'process', 'customElements', 'HTMLElement', 'Element', 'Node', 'fetch',
  'navigator', 'localStorage', 'sessionStorage', 'CSSStyleSheet', 'WebSocket', 'Worker',
]);
const forbiddenMembers = new Set([
  'element', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'createElement',
  'createElementNS', 'createContextualFragment', 'constructor', 'prototype', '__proto__',
  'ownerDocument', 'getRootNode', 'contentDocument', 'contentWindow', 'shadowRoot',
]);

/** Closed authoring surface for AI changes; never rewrites a user's whole file. */
function readMethod(edit: AssistantMethodEdit, options: AssistantMethodOptions): ts.MethodDeclaration {
  assertNoPrivatePlaceholder(edit.source);
  const file = ts.createSourceFile('assistant.ts', `class Assistant {\n${edit.source}\n}`, ts.ScriptTarget.Latest, true);
  assertValidSyntax(file, `Invalid TypeScript in Codex method "${edit.name}"`);
  const container = file.statements[0];
  if (file.statements.length !== 1 || !container || !ts.isClassDeclaration(container) || container.members.length !== 1) {
    throw new Error('Codex must provide one complete typed method per edit.');
  }
  const method = container.members[0];
  if (!method || !ts.isMethodDeclaration(method) || !ts.isIdentifier(method.name) || method.name.text !== edit.name || !method.body || !method.type) {
    throw new Error(`Method "${edit.name}" needs a body and an explicit return type.`);
  }
  if (method.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword || modifier.kind === ts.SyntaxKind.DeclareKeyword)) {
    throw new Error('Codex methods must belong to the document instance.');
  }
  if (method.parameters.some((parameter) => parameter.type === undefined)) {
    throw new Error(`Every parameter of "${edit.name}" must have an explicit type.`);
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, edit.source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      const comment = scanner.getTokenText();
      if (['@ts-ignore', '@ts-nocheck', '@ts-expect-error'].some((directive) => comment.includes(directive))) {
        throw new Error('Codex cannot suppress TypeScript diagnostics.');
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isDecorator(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      throw new Error('Codex methods cannot declare custom component classes or execute decorators. Use the registered components and existing project types.');
    }
    if (ts.isStringLiteralLike(node)) assertNoPrivatePlaceholder(node.text);
    if (ts.isTemplateExpression(node)) assertNoPrivatePlaceholder(node.head.text);
    if (ts.isTemplateSpan(node)) assertNoPrivatePlaceholder(node.literal.text);
    if (node.kind === ts.SyntaxKind.AnyKeyword || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
      throw new Error('Codex cannot bypass type checking with any, assertions or non-null assertions.');
    }
    if (ts.isIdentifier(node) && (forbiddenIdentifiers.has(node.text) || forbiddenMembers.has(node.text))) {
      throw new Error(`"${node.text}" is outside the native component authoring API.`);
    }
    if (ts.isNewExpression(node) && !(ts.isIdentifier(node.expression) && ['Date', 'Map', 'Set', 'Error', 'URL', 'URLSearchParams', 'AbortController'].includes(node.expression.text))) {
      throw new Error('Create visual and nonvisual components through the Designer, not constructors.');
    }
    if (ts.isImportTypeNode(node)) {
      if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
        throw new Error('Codex type imports require a literal public runtime or project module.');
      }
      const module = node.argument.literal.text;
      if (module !== '@webrad/runtime' && !options.allowedTypeImports?.has(module)) {
        throw new Error('Codex method signatures may import only public runtime types and declared project types.');
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new Error('Codex cannot load scripts or external libraries.');
    }
    ts.forEachChild(node, visit);
  };
  visit(method);
  return method;
}

export function applyAssistantMethods(
  source: string,
  className: string,
  edits: readonly AssistantMethodEdit[],
  options: AssistantMethodOptions = {},
): string {
  if (edits.length === 0) return source;
  const file = ts.createSourceFile('document.ts', source, ts.ScriptTarget.Latest, true);
  assertValidSyntax(file, 'Correct the existing TypeScript syntax before changing methods with Codex');
  const targets = file.statements.filter((statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && statement.name?.text === className);
  const target = targets[0];
  if (targets.length !== 1 || !target || target.getLastToken(file)?.kind !== ts.SyntaxKind.CloseBraceToken) {
    throw new Error(`The authored class "${className}" must be a single complete class declaration.`);
  }
  const seen = new Set<string>();
  const replacements: { start: number; end: number; text: string }[] = [];
  const additions: string[] = [];
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const printer = ts.createPrinter({ newLine: newline === '\r\n' ? ts.NewLineKind.CarriageReturnLineFeed : ts.NewLineKind.LineFeed });
  for (const edit of edits) {
    if (seen.has(edit.name)) throw new Error(`Duplicate method edit: ${edit.name}.`);
    seen.add(edit.name);
    const method = readMethod(edit, options);
    const existing = target.members.filter((member) => {
      const name = member.name;
      if (!name) return false;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text === edit.name;
      return ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression) && name.expression.text === edit.name;
    });
    if (existing.length > 1 || (existing[0] && (!ts.isMethodDeclaration(existing[0]) || existing[0].modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword || modifier.kind === ts.SyntaxKind.DeclareKeyword)))) {
      throw new Error(`"${edit.name}" is not a single editable instance method.`);
    }
    const text = printer.printNode(ts.EmitHint.Unspecified, method, method.getSourceFile());
    const original = existing[0];
    if (original && printer.printNode(ts.EmitHint.Unspecified, original, file) === text) continue;
    const indented = text.split(newline).map((line) => `  ${line}`).join(newline);
    if (original) replacements.push({ start: original.getStart(file), end: original.getEnd(), text: indented.slice(2) });
    else additions.push(indented);
  }
  if (additions.length > 0) replacements.push({ start: target.end - 1, end: target.end - 1, text: `${newline}${additions.join(newline + newline)}${newline}` });
  let result = source;
  for (const edit of replacements.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  assertValidSyntax(ts.createSourceFile('document.ts', result, ts.ScriptTarget.Latest, true), 'Codex produced invalid TypeScript');
  return result;
}
