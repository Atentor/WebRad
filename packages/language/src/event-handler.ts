import ts from 'typescript';
import {
  defaultComponentRegistry,
  type ComponentEventDefinition,
} from '@webrad/component-registry';

export interface EventHandlerRequest {
  readonly className: string;
  readonly componentName: string;
  readonly componentType: string;
  readonly eventName: string;
  readonly handlerName?: string;
  readonly fileName?: string;
  readonly senderName?: string;
  readonly eventType?: ComponentEventDefinition['eventType'];
  /** Optional runtime detail type for the generated CustomEvent parameter. */
  readonly eventDetailType?: string;
  /** Optional event detail fields to destructure in the generated handler body. */
  readonly eventDetailProperties?: readonly string[];
  /** Generated document alias for a repeating row's third event argument. */
  readonly currentRowType?: string;
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
  /** Collapsed cursor target inside the handler body. */
  readonly cursor: SourceLocation;
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

function sourceLocation(sourceFile: ts.SourceFile, start: number, end: number): SourceLocation {
  const lineAndColumn = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    start,
    end,
    line: lineAndColumn.line + 1,
    column: lineAndColumn.character + 1,
  };
}

function locationOf(sourceFile: ts.SourceFile, member: ts.ClassElement): SourceLocation {
  const start = member.name?.getStart(sourceFile) ?? member.getStart(sourceFile);
  return sourceLocation(sourceFile, start, member.end);
}

function handlerBody(member: ts.ClassElement): ts.ConciseBody | undefined {
  if (ts.isMethodDeclaration(member)) return member.body;
  if (!ts.isPropertyDeclaration(member)) return undefined;
  const initializer = member.initializer;
  if (initializer === undefined) return undefined;
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return initializer.body;
  }
  return undefined;
}

function handlerSignature(
  member: ts.ClassElement,
): ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (ts.isMethodDeclaration(member)) return member;
  if (!ts.isPropertyDeclaration(member) || member.initializer === undefined) return undefined;
  return ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer)
    ? member.initializer
    : undefined;
}

function firstEditablePositionInBlock(sourceFile: ts.SourceFile, block: ts.Block): number {
  const firstStatement = block.statements[0];
  if (firstStatement !== undefined) return firstStatement.getStart(sourceFile);

  const closingBrace = block.getEnd() - 1;
  let position = block.getStart(sourceFile) + 1;
  while (position < closingBrace) {
    const character = sourceFile.text[position];
    if (character === '\n') {
      let lineEnd = position + 1;
      while (
        lineEnd < closingBrace &&
        (sourceFile.text[lineEnd] === ' ' || sourceFile.text[lineEnd] === '\t')
      ) {
        lineEnd += 1;
      }
      if (
        lineEnd < closingBrace &&
        (sourceFile.text[lineEnd] === '\n' || sourceFile.text[lineEnd] === '\r')
      ) {
        return lineEnd;
      }
    }
    if (character !== ' ' && character !== '\t' && character !== '\r' && character !== '\n') break;
    position += 1;
  }
  return position;
}

function cursorLocationOf(sourceFile: ts.SourceFile, member: ts.ClassElement): SourceLocation {
  const body = handlerBody(member);
  if (body === undefined) return locationOf(sourceFile, member);
  const position = ts.isBlock(body)
    ? firstEditablePositionInBlock(sourceFile, body)
    : body.getStart(sourceFile);
  return sourceLocation(sourceFile, position, position);
}

function importedLocalName(
  sourceFile: ts.SourceFile,
  importedName: string,
  moduleName = '@webrad/runtime',
): string | undefined {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    if (statement.moduleSpecifier.text !== moduleName) continue;
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
  eventDetailTypeName: string | undefined,
  eventDetailProperties: readonly string[] | undefined,
  asynchronous: boolean,
  currentRowType: string | undefined,
  nativeEventType: string,
): ts.MethodDeclaration {
  const eventDetailDestructuring =
    eventDetailProperties === undefined || eventDetailProperties.length === 0
      ? undefined
      : ts.factory.createVariableStatement(
          undefined,
          ts.factory.createVariableDeclarationList(
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createObjectBindingPattern(
                  eventDetailProperties.map((property) =>
                    ts.factory.createBindingElement(
                      undefined,
                      undefined,
                      ts.factory.createIdentifier(property),
                      undefined,
                    ),
                  ),
                ),
                undefined,
                undefined,
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createIdentifier('event'),
                  ts.factory.createIdentifier('detail'),
                ),
              ),
            ],
            ts.NodeFlags.Const,
          ),
        );
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
      ...(eventDetailTypeName === undefined
        ? [
            ts.factory.createParameterDeclaration(
              undefined,
              undefined,
              'event',
              undefined,
              ts.factory.createTypeReferenceNode(nativeEventType),
              undefined,
            ),
          ]
        : [
            ts.factory.createParameterDeclaration(
              undefined,
              undefined,
              ts.factory.createIdentifier('event'),
              undefined,
              ts.factory.createTypeReferenceNode('CustomEvent', [
                ts.factory.createTypeReferenceNode(eventDetailTypeName),
              ]),
              undefined,
            ),
          ]),
      ...(currentRowType === undefined
        ? []
        : [
            ts.factory.createParameterDeclaration(
              undefined,
              undefined,
              'CurrentRow',
              undefined,
              ts.factory.createTypeReferenceNode(currentRowType),
              undefined,
            ),
          ]),
    ],
    asynchronous
      ? ts.factory.createTypeReferenceNode('Promise', [
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        ])
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
    ts.factory.createBlock(
      eventDetailDestructuring === undefined ? [] : [eventDetailDestructuring],
      true,
    ),
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
    .map((line) => {
      if (line.length === 0) return line;
      // The TypeScript printer uses four spaces; the editor uses two.
      let leadingSpaces = 0;
      while (line[leadingSpaces] === ' ') leadingSpaces += 1;
      return indent + ' '.repeat(leadingSpaces / 2) + line.slice(leadingSpaces);
    })
    .join('\n');
}

function printHandlerMethod(
  printer: ts.Printer,
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  indent: string,
): string {
  const printed = indentPrintedNode(
    printer.printNode(ts.EmitHint.Unspecified, method, sourceFile),
    indent,
  );
  if (method.body === undefined || method.body.statements.length > 0) return printed;

  // Parse only the generated fragment to locate its empty body without touching authored code.
  const prefix = 'class EventHandler {\n';
  const generated = ts.createSourceFile(
    sourceFile.fileName,
    prefix + printed + '\n}',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = findClass(generated, 'EventHandler');
  const member = declaration?.members[0];
  if (member === undefined || !ts.isMethodDeclaration(member) || member.body === undefined) {
    throw new LanguageEditError('TypeScript could not parse the generated event handler.');
  }
  return applyEdits(printed, [
    {
      position: member.body.getStart(generated) + 1 - prefix.length,
      text: '\n' + indent + '  ',
    },
  ]);
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
function ensureHandlerEventParameter(
  sourceText: string,
  sourceFile: ts.SourceFile,
  signature: ReturnType<typeof handlerSignature>,
  request: EventHandlerRequest,
  senderName: string,
): string {
  if (
    signature === undefined ||
    signature.parameters.some((parameter) => parameter.dotDotDotToken !== undefined)
  )
    return sourceText;

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const detailName = request.eventDetailType;
  const detailType =
    detailName === undefined
      ? undefined
      : detailName === 'Error'
        ? ts.factory.createTypeReferenceNode('Error')
        : importedLocalName(sourceFile, detailName) !== undefined
          ? ts.factory.createTypeReferenceNode(importedLocalName(sourceFile, detailName)!)
          : ts.factory.createImportTypeNode(
              ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('@webrad/runtime')),
              undefined,
              ts.factory.createIdentifier(detailName),
            );
  const eventType =
    detailType === undefined
      ? ts.factory.createTypeReferenceNode(request.eventType ?? 'Event')
      : ts.factory.createTypeReferenceNode('CustomEvent', [detailType]);
  const parameter = signature.parameters[1];
  let updated = sourceText;
  if (signature.parameters.length < 2) {
    const additions: ts.ParameterDeclaration[] = [];
    if (signature.parameters.length === 0)
      additions.push(
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          senderName,
          undefined,
          ts.factory.createImportTypeNode(
            ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('@webrad/runtime')),
            undefined,
            ts.factory.createIdentifier(request.componentType),
          ),
        ),
      );
    additions.push(
      ts.factory.createParameterDeclaration(undefined, undefined, 'event', undefined, eventType),
    );
    const text = additions
      .map((item) => printer.printNode(ts.EmitHint.Unspecified, item, sourceFile))
      .join(', ');
    if (
      ts.isArrowFunction(signature) &&
      !signature
        .getChildren(sourceFile)
        .some((child) => child.kind === ts.SyntaxKind.OpenParenToken)
    ) {
      const first = signature.parameters[0]!;
      updated =
        sourceText.slice(0, first.getStart(sourceFile)) +
        '(' +
        first.getText(sourceFile) +
        ', ' +
        text +
        ')' +
        sourceText.slice(first.end);
    } else {
      updated = applyEdits(sourceText, [
        {
          position: signature.parameters.end,
          text:
            (signature.parameters.length === 0
              ? ''
              : signature.parameters.hasTrailingComma
                ? ' '
                : ', ') + text,
        },
      ]);
    }
  } else if (
    parameter !== undefined &&
    (parameter.type === undefined ||
      (ts.isTypeReferenceNode(parameter.type) &&
        ts.isIdentifier(parameter.type.typeName) &&
        parameter.type.typeName.text === 'Event' &&
        (request.eventType !== 'Event' ||
          detailType !== undefined ||
          parameter.questionToken !== undefined)))
  ) {
    const replacement = ts.factory.updateParameterDeclaration(
      parameter,
      parameter.modifiers,
      parameter.dotDotDotToken,
      parameter.name,
      undefined,
      eventType,
      parameter.initializer,
    );
    updated =
      sourceText.slice(0, parameter.getStart(sourceFile)) +
      printer.printNode(ts.EmitHint.Unspecified, replacement, sourceFile) +
      sourceText.slice(parameter.end);
  }

  return updated;
}

export function ensureEventHandler(
  sourceText: string,
  request: EventHandlerRequest,
): EventHandlerEdit {
  const metadata = defaultComponentRegistry
    .get(request.componentType)
    ?.events.find((event) => event.name === request.eventName);
  request = {
    ...request,
    eventType: request.eventType ?? metadata?.eventType ?? 'Event',
    eventDetailType: request.eventDetailType ?? metadata?.eventDetailType,
    eventDetailProperties: request.eventDetailProperties ?? metadata?.eventDetailProperties,
  };
  const methodName =
    request.handlerName ?? eventHandlerName(request.componentName, request.eventName);
  const senderName = request.senderName ?? 'sender';
  assertIdentifier(request.className, 'Class name');
  assertIdentifier(request.componentName, 'Component name');
  assertIdentifier(request.componentType, 'Component type');
  assertIdentifier(methodName, 'Handler name');
  assertIdentifier(senderName, 'Sender parameter');
  if (request.eventDetailType !== undefined) {
    assertIdentifier(request.eventDetailType, 'Event detail type');
  }
  if (request.currentRowType !== undefined)
    assertIdentifier(request.currentRowType, 'Current row type');
  if (request.eventDetailProperties !== undefined) {
    if (request.eventDetailType === undefined) {
      throw new LanguageEditError('Event detail properties require an event detail type.');
    }
    const detailProperties = new Set<string>();
    for (const property of request.eventDetailProperties) {
      assertIdentifier(property, 'Event detail property');
      if (detailProperties.has(property)) {
        throw new LanguageEditError(
          `Event detail property "${property}" is declared more than once.`,
        );
      }
      detailProperties.add(property);
    }
  }

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
    const signature = handlerSignature(existing);
    const repaired = ensureHandlerEventParameter(
      sourceText,
      sourceFile,
      signature,
      request,
      senderName,
    );
    if (repaired !== sourceText) {
      const target = ensureEventHandler(repaired, request);
      return { ...target, changed: true };
    }
    if (request.currentRowType !== undefined && signature !== undefined) {
      const current = signature.parameters[2];
      const generatedModule = `./${request.className}.generated`;
      const localRowName = importedLocalName(sourceFile, request.currentRowType, generatedModule);
      const correctType =
        current?.type !== undefined &&
        ((ts.isTypeReferenceNode(current.type) &&
          ts.isIdentifier(current.type.typeName) &&
          current.type.typeName.text === localRowName) ||
          (ts.isImportTypeNode(current.type) &&
            ts.isLiteralTypeNode(current.type.argument) &&
            ts.isStringLiteral(current.type.argument.literal) &&
            current.type.argument.literal.text === generatedModule &&
            current.type.qualifier !== undefined &&
            ts.isIdentifier(current.type.qualifier) &&
            current.type.qualifier.text === request.currentRowType));
      if (
        current !== undefined &&
        ts.isIdentifier(current.name) &&
        current.name.text === 'CurrentRow' &&
        !correctType
      ) {
        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
        const type = ts.factory.createImportTypeNode(
          ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(generatedModule)),
          undefined,
          ts.factory.createIdentifier(request.currentRowType),
        );
        const parameter = ts.factory.updateParameterDeclaration(
          current,
          current.modifiers,
          current.dotDotDotToken,
          current.name,
          current.questionToken,
          type,
          current.initializer,
        );
        let updated =
          sourceText.slice(0, current.getStart(sourceFile)) +
          printer.printNode(ts.EmitHint.Unspecified, parameter, sourceFile) +
          sourceText.slice(current.end);
        if (
          current.type !== undefined &&
          ts.isTypeReferenceNode(current.type) &&
          ts.isIdentifier(current.type.typeName)
        ) {
          const previousType = current.type.typeName.text;
          let usedElsewhere = false;
          const visit = (node: ts.Node): void => {
            if (ts.isImportDeclaration(node) || node === current) return;
            if (ts.isIdentifier(node) && node.text === previousType) usedElsewhere = true;
            ts.forEachChild(node, visit);
          };
          ts.forEachChild(sourceFile, visit);
          if (!usedElsewhere)
            for (const statement of sourceFile.statements) {
              if (
                !ts.isImportDeclaration(statement) ||
                !ts.isStringLiteral(statement.moduleSpecifier) ||
                statement.moduleSpecifier.text !== generatedModule
              )
                continue;
              const clause = statement.importClause;
              const bindings = clause?.namedBindings;
              if (clause === undefined || bindings === undefined || !ts.isNamedImports(bindings))
                continue;
              const retained = bindings.elements.filter(
                (element) => element.name.text !== previousType,
              );
              if (retained.length === bindings.elements.length) continue;
              const replacement =
                retained.length === 0 && clause.name === undefined
                  ? ''
                  : printer.printNode(
                      ts.EmitHint.Unspecified,
                      ts.factory.updateImportDeclaration(
                        statement,
                        statement.modifiers,
                        ts.factory.updateImportClause(
                          clause,
                          clause.isTypeOnly,
                          clause.name,
                          retained.length === 0
                            ? undefined
                            : ts.factory.updateNamedImports(bindings, retained),
                        ),
                        statement.moduleSpecifier,
                        statement.attributes,
                      ),
                      sourceFile,
                    );
              const adjustment =
                statement.getStart(sourceFile) > current.end
                  ? updated.length - sourceText.length
                  : 0;
              updated =
                updated.slice(0, statement.getStart(sourceFile) + adjustment) +
                replacement +
                updated.slice(statement.end + adjustment);
              break;
            }
        }
        const target = ensureEventHandler(updated, { ...request, currentRowType: undefined });
        return { ...target, sourceText: updated, text: updated, changed: true };
      }
    }
    if (
      request.currentRowType !== undefined &&
      signature !== undefined &&
      !signature.parameters.some(
        (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === 'CurrentRow',
      )
    ) {
      if (signature.parameters.length > 2) {
        throw new LanguageEditError(
          'A repeating row handler must name its third parameter CurrentRow.',
        );
      }
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
      const parameters = [...signature.parameters];
      if (parameters.length === 0)
        parameters.push(
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            senderName,
            undefined,
            ts.factory.createImportTypeNode(
              ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral('@webrad/runtime')),
              undefined,
              ts.factory.createIdentifier(request.componentType),
            ),
            undefined,
          ),
        );
      if (parameters.length === 1)
        parameters.push(
          ts.factory.createParameterDeclaration(
            undefined,
            undefined,
            'event',
            undefined,
            ts.factory.createTypeReferenceNode(request.eventType ?? 'Event'),
            undefined,
          ),
        );
      parameters.push(
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          'CurrentRow',
          undefined,
          ts.factory.createImportTypeNode(
            ts.factory.createLiteralTypeNode(
              ts.factory.createStringLiteral(`./${request.className}.generated`),
            ),
            undefined,
            ts.factory.createIdentifier(request.currentRowType),
          ),
          undefined,
        ),
      );
      let replacement = parameters
        .map((parameter) => printer.printNode(ts.EmitHint.Unspecified, parameter, sourceFile))
        .join(', ');
      if (
        ts.isArrowFunction(signature) &&
        !signature
          .getChildren(sourceFile)
          .some((child) => child.kind === ts.SyntaxKind.OpenParenToken)
      )
        replacement = `(${replacement})`;
      const updated =
        sourceText.slice(0, signature.parameters.pos) +
        replacement +
        sourceText.slice(signature.parameters.end);
      const target = ensureEventHandler(updated, { ...request, currentRowType: undefined });
      return { ...target, sourceText: updated, text: updated, changed: true };
    }
    const location = locationOf(sourceFile, existing);
    return {
      sourceText,
      text: sourceText,
      changed: false,
      methodName,
      location,
      cursor: cursorLocationOf(sourceFile, existing),
    };
  }

  const localTypeName =
    importedLocalName(sourceFile, request.componentType) ?? request.componentType;
  const localEventDetailTypeName =
    request.eventDetailType === undefined
      ? undefined
      : (importedLocalName(sourceFile, request.eventDetailType) ?? request.eventDetailType);
  const method = createMethod(
    methodName,
    senderName,
    localTypeName,
    localEventDetailTypeName,
    request.eventDetailProperties,
    request.async ?? true,
    request.currentRowType === undefined
      ? undefined
      : (importedLocalName(
          sourceFile,
          request.currentRowType,
          `./${request.className}.generated`,
        ) ?? request.currentRowType),
    request.eventType ?? 'Event',
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const indent = insertionIndent(sourceText, declaration);
  const printedMethod = printHandlerMethod(printer, method, sourceFile, indent);

  const classClosingBrace = declaration.getEnd() - 1;
  const edits: TextEdit[] = [
    {
      position: classClosingBrace,
      text: `\n${printedMethod}\n${indent.slice(0, -2)}`,
    },
  ];
  const missingImports = [request.componentType, request.eventDetailType].filter(
    (typeName): typeName is string =>
      typeName !== undefined &&
      typeName !== 'Error' &&
      importedLocalName(sourceFile, typeName) === undefined,
  );
  if (
    request.currentRowType !== undefined &&
    importedLocalName(sourceFile, request.currentRowType, `./${request.className}.generated`) ===
      undefined
  ) {
    const generatedImport = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        true,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier(request.currentRowType),
          ),
        ]),
      ),
      ts.factory.createStringLiteral(`./${request.className}.generated`),
    );
    edits.push({
      position: 0,
      text: printer.printNode(ts.EmitHint.Unspecified, generatedImport, sourceFile) + '\n',
    });
  }
  for (const typeName of missingImports) {
    const importDeclaration = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        true,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(typeName)),
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
    cursor: cursorLocationOf(updatedSourceFile, updatedMethod),
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
