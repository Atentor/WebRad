import ts from 'typescript';
import { assertValidPageName, type ProjectSourceFile } from '@webrad/project-model';

/** Initial authored source only; subsequent edits belong to the code editor. */
export function createUserProjectSource(file: ProjectSourceFile): string {
  assertValidPageName(file.name);
  const statement =
    file.kind === 'model'
      ? ts.factory.createClassDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          file.name,
          undefined,
          undefined,
          [],
        )
      : ts.factory.createExportDeclaration(undefined, false, ts.factory.createNamedExports([]));
  const source = ts.createSourceFile('', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return (
    ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printNode(ts.EmitHint.Unspecified, statement, source) + '\n'
  );
}
