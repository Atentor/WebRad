declare module 'monaco-editor/languages/features/typescript/ts.worker.js' {
  import type tsApi from 'typescript';
  export const ts: { readonly typescript: typeof tsApi };
  export interface SerializedDiagnostic extends Omit<
    tsApi.Diagnostic,
    'file' | 'relatedInformation'
  > {
    readonly file?: { readonly fileName: string };
  }
  export class TypeScriptWorker {
    constructor(context: unknown, data: unknown);
    getScriptSnapshot(fileName: string): tsApi.IScriptSnapshot | undefined;
    getScriptVersion(fileName: string): string;
    getExtraLibs(): Record<string, { readonly content: string; readonly version: number }>;
    getLanguageService(): tsApi.LanguageService;
    getSemanticDiagnostics(fileName: string): Promise<SerializedDiagnostic[]>;
    getCompletionsAtPosition(
      fileName: string,
      position: number,
    ): Promise<tsApi.CompletionInfo | undefined>;
    getDefinitionAtPosition(
      fileName: string,
      position: number,
    ): Promise<readonly tsApi.DefinitionInfo[] | undefined>;
    getFormattingEditsForDocument(
      fileName: string,
      options: tsApi.FormatCodeSettings,
    ): Promise<tsApi.TextChange[]>;
    getNavigationTree(fileName: string): Promise<tsApi.NavigationTree | undefined>;
    getSuggestionDiagnostics(fileName: string): Promise<SerializedDiagnostic[]>;
    getReferencesAtPosition(
      fileName: string,
      position: number,
    ): Promise<readonly tsApi.ReferenceEntry[] | undefined>;
    getRenameInfo(
      fileName: string,
      position: number,
      options: tsApi.RenameInfoOptions,
    ): Promise<tsApi.RenameInfo>;
    getCodeFixesAtPosition(
      fileName: string,
      start: number,
      end: number,
      errorCodes: number[],
      options: tsApi.FormatCodeSettings,
    ): Promise<tsApi.CodeFixAction[]>;
  }
  export function initialize(factory: (context: unknown, data: unknown) => TypeScriptWorker): void;
}
