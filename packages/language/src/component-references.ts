import type ts from 'typescript';
import type { PageModel } from '@webrad/project-model';

export interface ComponentReferenceScope {
  readonly className: string;
  readonly generatedClassName: string;
  readonly componentNames: readonly string[];
}

export interface ComponentReferenceEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export const COMPONENT_SCOPE_PREFIX = '// @webrad-component-scope ';

export function componentReferenceScope(document: PageModel): ComponentReferenceScope {
  return {
    className: document.name,
    generatedClassName: `${document.name}Generated`,
    componentNames: document.components
      .filter((component) => component.id !== document.rootComponentId)
      .map((component) => component.name),
  };
}

/** Metadata belongs to a generated declaration, never to authored source. */
export function readComponentReferenceScope(
  declaration: string,
): ComponentReferenceScope | undefined {
  const line = declaration
    .split('\n')
    .find((candidate) => candidate.startsWith(COMPONENT_SCOPE_PREFIX));
  if (line === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(line.slice(COMPONENT_SCOPE_PREFIX.length));
    if (
      typeof value !== 'object' ||
      value === null ||
      !('className' in value) ||
      typeof value.className !== 'string' ||
      !('generatedClassName' in value) ||
      typeof value.generatedClassName !== 'string' ||
      !('componentNames' in value) ||
      !Array.isArray(value.componentNames) ||
      !value.componentNames.every((name: unknown) => typeof name === 'string')
    )
      return undefined;
    return value as ComponentReferenceScope;
  } catch {
    return undefined;
  }
}

/** Append module-local, editor-only names so every authored offset stays unchanged. */
export function appendComponentReferenceDeclarations(
  api: typeof ts,
  fileName: string,
  source: string,
  scope: ComponentReferenceScope,
): string {
  const sourceFile = api.createSourceFile(fileName, source, api.ScriptTarget.Latest, true);
  const declared = new Set<string>();
  const collectBinding = (name: ts.BindingName): void => {
    if (api.isIdentifier(name)) declared.add(name.text);
    else
      for (const element of name.elements)
        if (api.isBindingElement(element)) collectBinding(element.name);
  };
  // Function-scoped `var` in a top-level block also shadows the component name.
  const collect = (node: ts.Node): void => {
    if (api.isVariableDeclaration(node)) {
      const list = node.parent;
      if (
        api.isVariableDeclarationList(list) &&
        ((list.flags & api.NodeFlags.BlockScoped) === 0 ||
          (api.isVariableStatement(list.parent) && list.parent.parent === sourceFile))
      )
        collectBinding(node.name);
    }
    if (api.isImportClause(node)) {
      if (node.name) declared.add(node.name.text);
      if (node.namedBindings) {
        if (api.isNamespaceImport(node.namedBindings)) declared.add(node.namedBindings.name.text);
        else for (const element of node.namedBindings.elements) declared.add(element.name.text);
      }
      return;
    }
    if (api.isImportEqualsDeclaration(node)) declared.add(node.name.text);
    if (
      api.isClassDeclaration(node) ||
      api.isFunctionDeclaration(node) ||
      api.isEnumDeclaration(node) ||
      api.isModuleDeclaration(node)
    ) {
      if (node.parent === sourceFile && node.name) declared.add(node.name.text);
      return;
    }
    if (api.isFunctionLike(node) || api.isClassExpression(node)) return;
    api.forEachChild(node, collect);
  };
  for (const statement of sourceFile.statements) collect(statement);
  const moduleName = JSON.stringify(`./${scope.className}.generated`);
  const declarations = scope.componentNames
    .filter((name) => !declared.has(name))
    .map(
      (name) =>
        `declare const ${name}: import(${moduleName}).${scope.generatedClassName}[${JSON.stringify(name)}];`,
    );
  return declarations.length === 0 ? source : `${source}\n${declarations.join('\n')}\nexport {};\n`;
}

function hasInstanceContext(
  api: typeof ts,
  node: ts.Node,
  scope: ComponentReferenceScope,
): boolean {
  let child = node;
  for (let parent = node.parent; parent !== undefined; child = parent, parent = parent.parent) {
    if (api.isFunctionDeclaration(parent) || api.isFunctionExpression(parent)) return false;
    if (api.isClassDeclaration(parent) || api.isClassExpression(parent)) {
      if (parent.name?.text !== scope.className) return false;
      if (
        !parent.heritageClauses?.some(
          (clause) =>
            clause.token === api.SyntaxKind.ExtendsKeyword &&
            clause.types.some(
              (type) =>
                api.isIdentifier(type.expression) &&
                type.expression.text === scope.generatedClassName,
            ),
        )
      )
        return false;
      if (
        !api.isClassElement(child) ||
        (api.canHaveModifiers(child) &&
          api
            .getModifiers(child)
            ?.some((modifier) => modifier.kind === api.SyntaxKind.StaticKeyword))
      )
        return false;
      if (api.isConstructorDeclaration(child)) {
        const superStatement = child.body?.statements.find(
          (statement) =>
            api.isExpressionStatement(statement) &&
            api.isCallExpression(statement.expression) &&
            statement.expression.expression.kind === api.SyntaxKind.SuperKeyword,
        );
        return superStatement !== undefined && node.getStart() >= superStatement.end;
      }
      return (
        ((api.isMethodDeclaration(child) ||
          api.isGetAccessorDeclaration(child) ||
          api.isSetAccessorDeclaration(child)) &&
          ((child.body !== undefined && node.getStart() >= child.body.getStart()) ||
            isParameterInitializer(api, node, child))) ||
        (api.isPropertyDeclaration(child) &&
          child.initializer !== undefined &&
          node.getStart() >= child.initializer.getStart())
      );
    }
    // Object methods have their own receiver; arrows retain the enclosing page receiver.
    if (
      (api.isMethodDeclaration(parent) ||
        api.isGetAccessorDeclaration(parent) ||
        api.isSetAccessorDeclaration(parent)) &&
      !api.isClassDeclaration(parent.parent) &&
      !api.isClassExpression(parent.parent)
    )
      return false;
  }
  return false;
}

/** Method defaults evaluate with the instance receiver, including destructuring defaults. */
function isParameterInitializer(
  api: typeof ts,
  node: ts.Node,
  method: ts.SignatureDeclaration,
): boolean {
  let child = node;
  for (
    let parent = node.parent;
    parent && parent !== method;
    child = parent, parent = parent.parent
  )
    if ((api.isParameter(parent) || api.isBindingElement(parent)) && parent.initializer === child)
      return true;
  return false;
}

/** Completion must use the same instance boundary as compilation. */
function nodeAtOffset(api: typeof ts, sourceFile: ts.SourceFile, offset: number): ts.Node {
  let target: ts.Node = sourceFile;
  const visit = (node: ts.Node): void => {
    if (node.pos <= offset && offset <= node.end) {
      target = node;
      api.forEachChild(node, visit);
    }
  };
  visit(sourceFile);
  return target;
}

export function isComponentReferencePosition(
  api: typeof ts,
  sourceFile: ts.SourceFile,
  offset: number,
  scope: ComponentReferenceScope,
): boolean {
  return hasInstanceContext(api, nodeAtOffset(api, sourceFile, offset), scope);
}

/** Distinguish injected names from local bindings when filtering native suggestions. */
export function componentReferenceNamesAtPosition(
  api: typeof ts,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  authoredLength: number,
  offset: number,
  scope: ComponentReferenceScope,
): readonly string[] {
  const names = new Set(scope.componentNames);
  return checker
    .getSymbolsInScope(nodeAtOffset(api, sourceFile, offset), api.SymbolFlags.Value)
    .filter(
      (symbol) =>
        names.has(symbol.name) &&
        symbol.declarations?.some(
          (declaration) =>
            declaration.getSourceFile() === sourceFile &&
            declaration.getStart(sourceFile) >= authoredLength,
        ),
    )
    .map((symbol) => symbol.name);
}

export interface ComponentReferenceAnalysis {
  readonly edits: readonly ComponentReferenceEdit[];
  readonly diagnostics: readonly ts.DiagnosticWithLocation[];
}

/** Resolve symbols, rather than matching identifier text, so lexical bindings always win. */
export function analyzeComponentReferences(
  api: typeof ts,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  authoredLength: number,
  scope: ComponentReferenceScope,
): ComponentReferenceAnalysis {
  const edits: ComponentReferenceEdit[] = [];
  const diagnostics: ts.DiagnosticWithLocation[] = [];
  const names = new Set(scope.componentNames);
  const visit = (node: ts.Node): void => {
    if (node.getStart(sourceFile) >= authoredLength) return;
    if (api.isIdentifier(node) && names.has(node.text)) {
      const shorthand = api.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
      let symbol = shorthand
        ? checker.getShorthandAssignmentValueSymbol(node.parent as ts.ShorthandPropertyAssignment)
        : checker.getSymbolAtLocation(node);
      if (symbol && (symbol.flags & api.SymbolFlags.Alias) !== 0)
        symbol = checker.getAliasedSymbol(symbol);
      const isAlias = symbol?.declarations?.some(
        (declaration) =>
          declaration.getSourceFile() === sourceFile &&
          declaration.getStart(sourceFile) >= authoredLength,
      );
      if (isAlias) {
        // Type queries need the declaration for typing, but produce no runtime reference.
        let ancestor: ts.Node | undefined = node.parent;
        while (
          ancestor &&
          !api.isTypeNode(ancestor) &&
          !api.isStatement(ancestor) &&
          !api.isClassElement(ancestor)
        )
          ancestor = ancestor.parent;
        if (ancestor && api.isTypeNode(ancestor)) return;
        if (!hasInstanceContext(api, node, scope)) {
          diagnostics.push({
            file: sourceFile,
            start: node.getStart(sourceFile),
            length: node.getWidth(sourceFile),
            category: api.DiagnosticCategory.Error,
            code: 95001,
            messageText: `Component '${node.text}' is available only in instance code of '${scope.className}'. Use an arrow function for callbacks.`,
          });
        } else {
          edits.push({
            start: node.getStart(sourceFile),
            end: node.end,
            text: shorthand ? `${node.text}: this.${node.text}` : `this.${node.text}`,
          });
        }
      }
    }
    api.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { edits, diagnostics };
}

/** Apply only AST-selected references to an in-memory build copy. */
export function applyComponentReferenceEdits(
  source: string,
  edits: readonly ComponentReferenceEdit[],
): string {
  if (edits.length === 0) return source;
  const chunks: string[] = [];
  let offset = 0;
  for (const edit of [...edits].sort((left, right) => left.start - right.start)) {
    chunks.push(source.slice(offset, edit.start), edit.text);
    offset = edit.end;
  }
  chunks.push(source.slice(offset));
  return chunks.join('');
}
