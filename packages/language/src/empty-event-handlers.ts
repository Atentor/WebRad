import ts from 'typescript';
import type { PageModel, WebRadProject } from '@webrad/project-model';

/** Remove only bound, ordinary instance methods whose bodies contain whitespace alone. */
export function pruneEmptyEventHandlers(
  project: WebRadProject,
  userSources: Readonly<Record<string, string>>,
): { readonly project: WebRadProject; readonly userSources: Readonly<Record<string, string>> } {
  const sources = { ...userSources };
  const clean = <T extends PageModel>(document: T, directory: string): T => {
    const path = `${directory}/${document.name}.ts`;
    const source = sources[path];
    if (source === undefined) return document;
    const bound = new Set(
      document.components.flatMap((component) => Object.values(component.events)),
    );
    bound.delete(null);
    if (bound.size === 0) return document;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declaration = file.statements.find(
      (node): node is ts.ClassDeclaration =>
        ts.isClassDeclaration(node) && node.name?.text === document.name,
    );
    if (!declaration) return document;
    const removals = declaration.members.filter(
      (member): member is ts.MethodDeclaration & { readonly name: ts.Identifier } => {
        if (
          !ts.isMethodDeclaration(member) ||
          !ts.isIdentifier(member.name) ||
          !bound.has(member.name.text)
        )
          return false;
        if (!member.body || member.body.statements.length !== 0) return false;
        if (
          member.modifiers?.some(
            (modifier) => ts.isDecorator(modifier) || modifier.kind === ts.SyntaxKind.StaticKeyword,
          )
        )
          return false;
        if (member.parameters.some((parameter) => parameter.initializer !== undefined))
          return false;
        const handlerName = member.name.text;
        if (
          declaration.members.filter(
            (other) => other.name && ts.isIdentifier(other.name) && other.name.text === handlerName,
          ).length !== 1
        )
          return false;
        return source.slice(member.body.getStart(file) + 1, member.body.getEnd() - 1).trim() === '';
      },
    );
    if (removals.length === 0) return document;
    // Parser recovery in an unfinished file must never cause an authored method to disappear.
    const diagnostics = ts.transpileModule(source, {
      fileName: path,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ESNext, experimentalDecorators: true },
    }).diagnostics;
    if (diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
      return document;
    const removed = new Set(removals.map((member) => member.name.text));
    let nextSource = source;
    for (const member of [...removals].sort((left, right) => right.pos - left.pos)) {
      // AST ranges preserve every byte outside the removed declaration, including other methods.
      nextSource = nextSource.slice(0, member.getStart(file)) + nextSource.slice(member.getEnd());
    }
    sources[path] = nextSource;
    return {
      ...document,
      components: document.components.map((component) => ({
        ...component,
        events: Object.fromEntries(
          Object.entries(component.events).map(([event, handler]) => [
            event,
            handler !== null && removed.has(handler) ? null : handler,
          ]),
        ),
      })),
    };
  };
  return {
    project: {
      ...project,
      pages: project.pages.map((page) => clean(page, 'pages')),
      reusableElements: project.reusableElements.map((reusable) => clean(reusable, 'reusables')),
    },
    userSources: sources,
  };
}
