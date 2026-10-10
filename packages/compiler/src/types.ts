import type { ComponentRegistry } from '@webrad/component-registry';

export type CompileDiagnosticCategory = 'error' | 'warning' | 'info';
export type CompileDiagnosticSource = 'model' | 'registry' | 'typescript' | 'esbuild' | 'compiler';

export interface CompileDiagnostic {
  readonly category: CompileDiagnosticCategory;
  readonly source: CompileDiagnosticSource;
  readonly message: string;
  readonly code?: string | number;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly length?: number;
  readonly path?: readonly (string | number)[];
}

export interface CompileProjectOptions {
  readonly outputDirectory: string;
  readonly userSources: Readonly<Record<string, string>>;
  readonly write?: boolean;
  readonly minify?: boolean;
  readonly sourcemap?: boolean;
  /** Emit the original TypeScript mappings and an unminified Debug Preview. */
  readonly debug?: boolean;
  readonly registry?: ComponentRegistry;
}

export interface CompileProjectResult {
  readonly success: boolean;
  readonly outputDirectory: string;
  readonly diagnostics: readonly CompileDiagnostic[];
  /** Browser files keyed by their POSIX path relative to outputDirectory. */
  readonly files: Readonly<Record<string, string>>;
  /** The same real app bundle as `files`, inlined for the isolated HTTP Preview. */
  readonly previewHtml?: string;
  /** Original authored-source mappings for the JavaScript executed by Debug Preview. */
  readonly debug?: {
    readonly sourceMap: string;
    readonly scriptUrl: string;
  };
}

export interface CompileProjectMemoryOptions extends Omit<
  CompileProjectOptions,
  'outputDirectory' | 'write'
> {
  readonly outputDirectory?: string;
}
