import type tsApi from 'typescript';
import {
  TypeScriptWorker,
  ts as services,
} from 'monaco-editor/languages/features/typescript/ts.worker.js';
import {
  analyzeComponentReferences,
  appendComponentReferenceDeclarations,
  componentReferenceNamesAtPosition,
  isComponentReferencePosition,
  readComponentReferenceScope,
} from '@webrad/language/component-references';

const ts = services.typescript;

/** The worker sees module-local declarations; the editor model always stays authored. */
export class ComponentTypeScriptWorker extends TypeScriptWorker {
  private scope(fileName: string) {
    if (!fileName.endsWith('.ts') || fileName.endsWith('.d.ts')) return undefined;
    const declaration = this.getExtraLibs()[`${fileName.slice(0, -3)}.generated.d.ts`];
    return declaration === undefined ? undefined : readComponentReferenceScope(declaration.content);
  }

  public override getScriptVersion(fileName: string): string {
    const version = this.getExtraLibs()[`${fileName.slice(0, -3)}.generated.d.ts`]?.version ?? '';
    return `${super.getScriptVersion(fileName)}:${version}`;
  }

  public override getScriptSnapshot(fileName: string): tsApi.IScriptSnapshot | undefined {
    const original = super.getScriptSnapshot(fileName);
    const scope = this.scope(fileName);
    if (original === undefined || scope === undefined) return original;
    const source = original.getText(0, original.getLength());
    return ts.ScriptSnapshot.fromString(
      appendComponentReferenceDeclarations(ts, fileName, source, scope),
    );
  }

  public override async getSemanticDiagnostics(fileName: string) {
    const diagnostics = await super.getSemanticDiagnostics(fileName);
    const scope = this.scope(fileName);
    const sourceFile = this.getLanguageService().getProgram()?.getSourceFile(fileName);
    const original = super.getScriptSnapshot(fileName);
    const program = this.getLanguageService().getProgram();
    if (!scope || !sourceFile || !original || !program) return diagnostics;
    const analysis = analyzeComponentReferences(
      ts,
      sourceFile,
      program.getTypeChecker(),
      original.getLength(),
      scope,
    );
    return [
      ...diagnostics.filter(
        (diagnostic) => diagnostic.start === undefined || diagnostic.start < original.getLength(),
      ),
      ...analysis.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        file: { fileName },
        relatedInformation: undefined,
      })),
    ];
  }

  public override async getCompletionsAtPosition(fileName: string, position: number) {
    const info = await super.getCompletionsAtPosition(fileName, position);
    const scope = this.scope(fileName);
    const sourceFile = this.getLanguageService().getProgram()?.getSourceFile(fileName);
    if (!info || !scope || !sourceFile) return info;
    const available = isComponentReferencePosition(ts, sourceFile, position, scope);
    const program = this.getLanguageService().getProgram();
    const original = super.getScriptSnapshot(fileName);
    const names = new Set(
      program && original
        ? componentReferenceNamesAtPosition(
            ts,
            sourceFile,
            program.getTypeChecker(),
            original.getLength(),
            position,
            scope,
          )
        : [],
    );
    return {
      ...info,
      webradSupportsComponentReferences: available,
      entries:
        available || info.isMemberCompletion
          ? info.entries.map((entry) =>
              !info.isMemberCompletion && names.has(entry.name)
                ? { ...entry, sortText: `0000_${entry.name}` }
                : entry,
            )
          : info.entries.filter((entry) => !names.has(entry.name)),
    };
  }

  public override async getDefinitionAtPosition(fileName: string, position: number) {
    const definitions = await super.getDefinitionAtPosition(fileName, position);
    const scope = this.scope(fileName);
    const length = super.getScriptSnapshot(fileName)?.getLength();
    if (!scope || length === undefined) return definitions;
    // Bare names navigate to the real generated field, rather than an invisible declaration.
    return definitions?.flatMap((definition) => {
      if (definition.fileName !== fileName || definition.textSpan.start < length)
        return [definition];
      const declarationPath = `${fileName.slice(0, -3)}.generated.d.ts`;
      const sourceFile = this.getLanguageService().getProgram()?.getSourceFile(declarationPath);
      const classNode = sourceFile?.statements.find(
        (node) => ts.isClassDeclaration(node) && node.name?.text === scope.generatedClassName,
      );
      if (classNode === undefined || !ts.isClassDeclaration(classNode)) return [];
      const member = classNode.members.find(
        (node) =>
          ts.isPropertyDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === definition.name,
      );
      if (!member || !sourceFile) return [];
      return [
        {
          ...definition,
          fileName: declarationPath,
          textSpan: { start: member.getStart(sourceFile), length: member.getWidth(sourceFile) },
        },
      ];
    });
  }

  public override async getFormattingEditsForDocument(
    fileName: string,
    options: tsApi.FormatCodeSettings,
  ) {
    const edits = await super.getFormattingEditsForDocument(fileName, options);
    const length = super.getScriptSnapshot(fileName)?.getLength();
    return length === undefined
      ? edits
      : edits.filter((edit) => edit.span.start + edit.span.length <= length);
  }

  public override async getNavigationTree(fileName: string) {
    const tree = await super.getNavigationTree(fileName);
    const length = super.getScriptSnapshot(fileName)?.getLength();
    if (!tree || length === undefined) return tree;
    const trim = (item: tsApi.NavigationTree): tsApi.NavigationTree => ({
      ...item,
      spans: item.spans
        .filter((span) => span.start < length)
        .map((span) => ({ ...span, length: Math.min(span.length, length - span.start) })),
      childItems: item.childItems
        ?.filter((child) => child.spans.some((span) => span.start < length))
        .map(trim),
    });
    return trim(tree);
  }

  public override async getSuggestionDiagnostics(fileName: string) {
    const diagnostics = await super.getSuggestionDiagnostics(fileName);
    const length = super.getScriptSnapshot(fileName)?.getLength();
    return length === undefined
      ? diagnostics
      : diagnostics.filter(
          (diagnostic) => diagnostic.start === undefined || diagnostic.start < length,
        );
  }

  public override async getReferencesAtPosition(fileName: string, position: number) {
    const references = await super.getReferencesAtPosition(fileName, position);
    return references?.filter((reference) => {
      const length = super.getScriptSnapshot(reference.fileName)?.getLength();
      return length === undefined || reference.textSpan.start < length;
    });
  }

  public override async getRenameInfo(
    fileName: string,
    position: number,
    options: tsApi.RenameInfoOptions,
  ) {
    const definitions = await super.getDefinitionAtPosition(fileName, position);
    const length = super.getScriptSnapshot(fileName)?.getLength();
    if (
      length !== undefined &&
      definitions?.some(
        (definition) => definition.fileName === fileName && definition.textSpan.start >= length,
      )
    ) {
      return {
        canRename: false as const,
        localizedErrorMessage: 'Rename this component in the Designer.',
      };
    }
    return super.getRenameInfo(fileName, position, options);
  }

  public override async getCodeFixesAtPosition(
    fileName: string,
    start: number,
    end: number,
    errorCodes: number[],
    options: tsApi.FormatCodeSettings,
  ) {
    const fixes = await super.getCodeFixesAtPosition(fileName, start, end, errorCodes, options);
    return fixes.filter((fix) =>
      fix.changes.every((change) => {
        const length = super.getScriptSnapshot(change.fileName)?.getLength();
        return (
          length === undefined ||
          change.textChanges.every((edit) => edit.span.start + edit.span.length <= length)
        );
      }),
    );
  }
}
