import ts from 'typescript';

export interface EventHandlerRequest {
  readonly className: string;
  readonly componentName: string;
  readonly componentType: string;
  readonly eventName: string;
  readonly handlerName?: string;
  readonly fileName?: string;
  readonly senderName?: string;
  readonly async?: boolean;
}

export interface SourceLocation {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

export interface EventHandlerEdit {
  readonly sourceText: string;
  readonly text: string;
  readonly changed: boolean;
  readonly methodName: string;
  readonly location: SourceLocation;
}

export class LanguageEditError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'LanguageEditError';
  }
}

function assertIdentifier(value: string, description: string): void {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    value,
  );
  const firstToken = scanner.scan();
  const secondToken = scanner.scan();
  if (firstToken !== ts.SyntaxKind.Identifier || secondToken !== ts.SyntaxKind.EndOfFileToken) {
    throw new LanguageEditError(`${description} "${value}" is not a valid TypeScript identifier.`);
  }
}

export function eventHandlerName(componentName: string, eventName: string): string {
  const suffix = eventName.startsWith('On') ? eventName.slice(2) : eventName;
  return `${componentName}${suffix}`;
}

function findClass(sourceFile: ts.SourceFile, className: string): ts.ClassDeclaration | undefined {
  let match: ts.ClassDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (match !== undefined) return;
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return match;
}

function memberName(member: ts.ClassElement): string | undefined {
  const name = member.name;
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

function findHandlerMember(
  declaration: ts.ClassDeclaration,
  methodName: string,
): ts.ClassElement | undefined {
  return declaration.members.find((member) => memberName(member) === methodName);
}

function locationOf(sourceFile: ts.SourceFile, member: ts.ClassElement): SourceLocation {
  const start = member.name?.getStart(sourceFile) ?? member.getStart(sourceFile);
  const lineAndColumn = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    start,
    end: member.end,
    line: lineAndColumn.line + 1,
    column: lineAndColumn.character + 1,
  };
}

function importedLocalName(sourceFile: ts.SourceFile, importedName: string): string | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (statement.moduleSpecifier.text !== '@webrad/runtime') continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      if ((specifier.propertyName?.text ?? specifier.name.text) === importedName) {
        return specifier.name.text;
      }
    }
  }
  return undefined;
}

function createMethod(
  methodName: string,
  senderName: string,
  componentTypeName: string,
  asynchronous: boolean,
): ts.MethodDeclaration {
  return ts.factory.createMethodDeclaration(
    asynchronous ? [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)] : undefined,
    undefined,
    ts.factory.createIdentifier(methodName),
    undefined,
    undefined,
    [
      ts.factory.createParameterDeclaration(
        undefined,
        undefined,
        ts.factory.createIdentifier(senderName),
        undefined,
        ts.factory.createTypeReferenceNode(componentTypeName),
        undefined,
      ),
    ],
    asynchronous
      ? ts.factory.createTypeReferenceNode('Promise', [
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        ])
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    ts.factory.createBlock([], true),
  );
}

interface TextEdit {
  readonly position: number;
  readonly text: string;
}

function applyEdits(sourceText: string, edits: readonly TextEdit[]): string {
  let result = sourceText;
  for (const edit of [...edits].sort((left, right) => right.position - left.position)) {
    result = `${result.slice(0, edit.position)}${edit.text}${result.slice(edit.position)}`;
  }
  return result;
}

function insertionIndent(sourceText: string, classDeclaration: ts.ClassDeclaration): string {
  const start = classDeclaration.getStart();
  let lineStart = start;
  while (lineStart > 0 && sourceText.charCodeAt(lineStart - 1) !== 10) lineStart -= 1;
  let indent = '';
  for (let index = lineStart; index < start; index += 1) {
    const character = sourceText[index];
    if (character !== ' ' && character !== '\t') break;
    indent += character;
  }
  return `${indent}  `;
}

function indentPrintedNode(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : `${indent}${line}`))
    .join('\n');
}

export function findEventHandler(
  sourceText: string,
  request: Pick<
    EventHandlerRequest,
    'className' | 'componentName' | 'eventName' | 'handlerName' | 'fileName'
  >,
): SourceLocation | undefined {
  const sourceFile = ts.createSourceFile(
    request.fileName ?? 'Page.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = findClass(sourceFile, request.className);
  if (declaration === undefined) return undefined;
  const method = findHandlerMember(
    declaration,
    request.handlerName ?? eventHandlerName(request.componentName, request.eventName),
  );
  return method === undefined ? undefined : locationOf(sourceFile, method);
}

/** Inserts one handler using TypeScript AST positions, or returns its existing navigation target. */
export function ensureEventHandler(
  sourceText: string,
  request: EventHandlerRequest,
): EventHandlerEdit {
  const methodName =
    request.handlerName ?? eventHandlerName(request.componentName, request.eventName);
  const senderName = request.senderName ?? 'sender';
  assertIdentifier(request.className, 'Class name');
  assertIdentifier(request.componentName, 'Component name');
  assertIdentifier(request.componentType, 'Component type');
  assertIdentifier(methodName, 'Handler name');
  assertIdentifier(senderName, 'Sender parameter');

  const fileName = request.fileName ?? `${request.className}.ts`;
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = findClass(sourceFile, request.className);
  if (declaration === undefined) {
    throw new LanguageEditError(`Class "${request.className}" was not found in ${fileName}.`);
  }
  const existing = findHandlerMember(declaration, methodName);
  if (existing !== undefined) {
    const location = locationOf(sourceFile, existing);
    return { sourceText, text: sourceText, changed: false, methodName, location };
  }

  const localTypeName =
    importedLocalName(sourceFile, request.componentType) ?? request.componentType;
  const method = createMethod(methodName, senderName, localTypeName, request.async ?? true);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printedMethod = printer.printNode(ts.EmitHint.Unspecified, method, sourceFile);
  const indent = insertionIndent(sourceText, declaration);
  const classClosingBrace = declaration.getEnd() - 1;
  const edits: TextEdit[] = [
    {
      position: classClosingBrace,
      text: `\n${indentPrintedNode(printedMethod, indent)}\n${indent.slice(0, -2)}`,
    },
  ];
  if (importedLocalName(sourceFile, request.componentType) === undefined) {
    const importDeclaration = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        true,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier(request.componentType),
          ),
        ]),
      ),
      ts.factory.createStringLiteral('@webrad/runtime'),
      undefined,
    );
    const printedImport = printer.printNode(ts.EmitHint.Unspecified, importDeclaration, sourceFile);
    edits.push({ position: 0, text: `${printedImport}\n` });
  }

  const updated = applyEdits(sourceText, edits);
  const updatedSourceFile = ts.createSourceFile(
    fileName,
    updated,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const updatedClass = findClass(updatedSourceFile, request.className);
  const updatedMethod =
    updatedClass === undefined ? undefined : findHandlerMember(updatedClass, methodName);
  if (updatedMethod === undefined) {
    throw new LanguageEditError(`TypeScript could not parse the inserted handler "${methodName}".`);
  }
  return {
    sourceText: updated,
    text: updated,
    changed: true,
    methodName,
    location: locationOf(updatedSourceFile, updatedMethod),
  };
}

export const insertEventHandler = ensureEventHandler;
export const ensureHandler = ensureEventHandler;

export interface RenamePageSourceResult {
  readonly sourceText: string;
  readonly changed: boolean;
}

/** Renames a page class and its generated-base import using TypeScript AST spans. */
export function renamePageUserSource(
  sourceText: string,
  oldPageName: string,
  newPageName: string,
  fileName = `${oldPageName}.ts`,
): RenamePageSourceResult {
  assertIdentifier(oldPageName, 'Old page name');
  assertIdentifier(newPageName, 'New page name');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = findClass(sourceFile, oldPageName);
  if (!declaration?.name) {
    throw new LanguageEditError(`Class "${oldPageName}" was not found in ${fileName}.`);
  }
  const oldGeneratedName = `${oldPageName}Generated`;
  const newGeneratedName = `${newPageName}Generated`;
  const edits: { position: number; end: number; text: string }[] = [
    {
      position: declaration.name.getStart(sourceFile),
      end: declaration.name.getEnd(),
      text: newPageName,
    },
  ];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.moduleSpecifier.text === `./${oldPageName}.generated`) {
      edits.push({
        position: statement.moduleSpecifier.getStart(sourceFile),
        end: statement.moduleSpecifier.getEnd(),
        text: JSON.stringify(`./${newPageName}.generated`),
      });
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        for (const identifier of [specifier.propertyName, specifier.name]) {
          if (identifier?.text === oldGeneratedName) {
            edits.push({
              position: identifier.getStart(sourceFile),
              end: identifier.getEnd(),
              text: newGeneratedName,
            });
          }
        }
      }
    }
  }

  for (const clause of declaration.heritageClauses ?? []) {
    for (const heritageType of clause.types) {
      if (
        ts.isIdentifier(heritageType.expression) &&
        heritageType.expression.text === oldGeneratedName
      ) {
        edits.push({
          position: heritageType.expression.getStart(sourceFile),
          end: heritageType.expression.getEnd(),
          text: newGeneratedName,
        });
      }
    }
  }

  const uniqueEdits = [
    ...new Map(edits.map((edit) => [`${edit.position}:${edit.end}`, edit])).values(),
  ];
  let updated = sourceText;
  for (const edit of uniqueEdits.sort((left, right) => right.position - left.position)) {
    updated = `${updated.slice(0, edit.position)}${edit.text}${updated.slice(edit.end)}`;
  }
  return { sourceText: updated, changed: updated !== sourceText };
}
