import type { BuildDiagnostic } from '../../shared/contracts';

export type ProblemCategory = BuildDiagnostic['category'];
export type ProblemOrigin = 'monaco' | 'build';

export interface ProblemRange {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface EditorProblem {
  readonly id: string;
  readonly category: ProblemCategory;
  readonly message: string;
  readonly source: string;
  readonly code?: string | number;
  readonly resource?: string;
  readonly file?: string;
  readonly range?: ProblemRange;
  readonly length?: number;
  readonly path?: readonly (string | number)[];
  readonly origins: readonly ProblemOrigin[];
  readonly owners: readonly string[];
}

/** The structural subset of Monaco's IMarker used by the Problems projection. */
export interface MonacoMarkerLike {
  readonly owner: string;
  readonly resource: { toString(): string };
  readonly severity: number;
  readonly code?: string | { readonly value: string };
  readonly message: string;
  readonly source?: string;
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface NormalizeBuildDiagnosticOptions {
  /** Resolves the compiler's portable file name to the canonical Monaco model URI. */
  readonly resolveResource?: (file: string) => string | undefined;
  /** Supplies current source text so a diagnostic length can span lines accurately. */
  readonly getSourceText?: (file: string) => string | undefined;
}

export interface ProblemCounts {
  readonly total: number;
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

const MONACO_WARNING_SEVERITY = 4;
const MONACO_ERROR_SEVERITY = 8;

function categoryFromMarkerSeverity(severity: number): ProblemCategory {
  if (severity >= MONACO_ERROR_SEVERITY) return 'error';
  if (severity >= MONACO_WARNING_SEVERITY) return 'warning';
  return 'info';
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function normalizedRange(range: ProblemRange): ProblemRange {
  const startLineNumber = positiveInteger(range.startLineNumber, 1);
  const startColumn = positiveInteger(range.startColumn, 1);
  let endLineNumber = positiveInteger(range.endLineNumber, startLineNumber);
  let endColumn = positiveInteger(range.endColumn, startColumn + 1);
  if (
    endLineNumber < startLineNumber ||
    (endLineNumber === startLineNumber && endColumn <= startColumn)
  ) {
    endLineNumber = startLineNumber;
    endColumn = startColumn + 1;
  }
  return { startLineNumber, startColumn, endLineNumber, endColumn };
}

function lineStartOffset(sourceText: string, requestedLine: number): number | undefined {
  if (requestedLine === 1) return 0;
  let line = 1;
  for (let offset = 0; offset < sourceText.length; offset += 1) {
    if (sourceText[offset] !== '\n') continue;
    line += 1;
    if (line === requestedLine) return offset + 1;
  }
  return undefined;
}

function positionAtOffset(
  sourceText: string,
  requestedOffset: number,
): {
  readonly lineNumber: number;
  readonly column: number;
} {
  const offset = Math.max(0, Math.min(requestedOffset, sourceText.length));
  let lineNumber = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (sourceText[index] !== '\n') continue;
    lineNumber += 1;
    lineStart = index + 1;
  }
  return { lineNumber, column: offset - lineStart + 1 };
}

function rangeFromBuildDiagnostic(
  diagnostic: BuildDiagnostic,
  sourceText: string | undefined,
): ProblemRange | undefined {
  if (diagnostic.line === undefined) return undefined;
  const startLineNumber = positiveInteger(diagnostic.line, 1);
  const startColumn = positiveInteger(diagnostic.column, 1);
  const length = positiveInteger(diagnostic.length, 1);
  if (sourceText !== undefined) {
    const lineOffset = lineStartOffset(sourceText, startLineNumber);
    if (lineOffset !== undefined) {
      const startOffset = Math.min(lineOffset + startColumn - 1, sourceText.length);
      const end = positionAtOffset(sourceText, startOffset + length);
      return normalizedRange({
        startLineNumber,
        startColumn,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      });
    }
  }
  return normalizedRange({
    startLineNumber,
    startColumn,
    endLineNumber: startLineNumber,
    endColumn: startColumn + length,
  });
}

function normalizedMarkerCode(code: MonacoMarkerLike['code']): string | undefined {
  return typeof code === 'string' ? code : code?.value;
}

function portableFileName(file: string | undefined): string | undefined {
  return file?.replaceAll('\\', '/');
}

function problemLocation(problem: Omit<EditorProblem, 'id'>): string {
  if (problem.resource !== undefined) return problem.resource;
  if (problem.file !== undefined) return portableFileName(problem.file) ?? problem.file;
  if (problem.path !== undefined) return JSON.stringify(problem.path);
  return `source:${problem.source}`;
}

function problemIdentity(problem: Omit<EditorProblem, 'id'>): string {
  return JSON.stringify([
    problemLocation(problem),
    problem.range?.startLineNumber ?? 0,
    problem.range?.startColumn ?? 0,
    problem.message,
  ]);
}

function withIdentity(problem: Omit<EditorProblem, 'id'>): EditorProblem {
  return { ...problem, id: problemIdentity(problem) };
}

export function normalizeMonacoMarker(marker: MonacoMarkerLike): EditorProblem {
  return withIdentity({
    category: categoryFromMarkerSeverity(marker.severity),
    message: marker.message,
    source: marker.source ?? marker.owner,
    code: normalizedMarkerCode(marker.code),
    resource: marker.resource.toString(),
    range: normalizedRange({
      startLineNumber: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLineNumber: marker.endLineNumber,
      endColumn: marker.endColumn,
    }),
    origins: ['monaco'],
    owners: [marker.owner],
  });
}

export function normalizeMonacoMarkers(
  markers: readonly MonacoMarkerLike[],
): readonly EditorProblem[] {
  return markers.map(normalizeMonacoMarker);
}

export function normalizeBuildDiagnostic(
  diagnostic: BuildDiagnostic,
  options: NormalizeBuildDiagnosticOptions = {},
): EditorProblem {
  const file = portableFileName(diagnostic.file);
  const sourceText = file === undefined ? undefined : options.getSourceText?.(file);
  return withIdentity({
    category: diagnostic.category,
    message: diagnostic.message,
    source: diagnostic.source ?? 'build',
    code: diagnostic.code,
    resource: file === undefined ? undefined : options.resolveResource?.(file),
    file,
    range: rangeFromBuildDiagnostic(diagnostic, sourceText),
    length: diagnostic.length,
    path: diagnostic.path,
    origins: ['build'],
    owners: [],
  });
}

export function normalizeBuildDiagnostics(
  diagnostics: readonly BuildDiagnostic[],
  options: NormalizeBuildDiagnosticOptions = {},
): readonly EditorProblem[] {
  return diagnostics.map((diagnostic) => normalizeBuildDiagnostic(diagnostic, options));
}

function severityRank(category: ProblemCategory): number {
  if (category === 'error') return 0;
  if (category === 'warning') return 1;
  return 2;
}

function highestSeverity(left: ProblemCategory, right: ProblemCategory): ProblemCategory {
  return severityRank(left) <= severityRank(right) ? left : right;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function mergeDuplicate(left: EditorProblem, right: EditorProblem): EditorProblem {
  const source = left.source === 'build' && right.source !== 'build' ? right.source : left.source;
  const merged = {
    category: highestSeverity(left.category, right.category),
    message: left.message,
    source,
    code: left.code ?? right.code,
    resource: left.resource ?? right.resource,
    file: left.file ?? right.file,
    range: left.origins.includes('monaco') ? left.range : (right.range ?? left.range),
    length: left.length ?? right.length,
    path: left.path ?? right.path,
    origins: unique([...left.origins, ...right.origins]),
    owners: unique([...left.owners, ...right.owners]),
  } satisfies Omit<EditorProblem, 'id'>;
  return withIdentity(merged);
}

function compareText(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '', 'en');
}

export function compareEditorProblems(left: EditorProblem, right: EditorProblem): number {
  return (
    severityRank(left.category) - severityRank(right.category) ||
    compareText(left.resource ?? left.file, right.resource ?? right.file) ||
    (left.range?.startLineNumber ?? 0) - (right.range?.startLineNumber ?? 0) ||
    (left.range?.startColumn ?? 0) - (right.range?.startColumn ?? 0) ||
    compareText(left.message, right.message) ||
    compareText(
      left.code === undefined ? undefined : String(left.code),
      right.code === undefined ? undefined : String(right.code),
    )
  );
}

export function mergeEditorProblems(
  ...problemSets: readonly (readonly EditorProblem[])[]
): readonly EditorProblem[] {
  const byIdentity = new Map<string, EditorProblem>();
  for (const problem of problemSets.flat()) {
    const existing = byIdentity.get(problem.id);
    byIdentity.set(
      problem.id,
      existing === undefined ? problem : mergeDuplicate(existing, problem),
    );
  }
  return [...byIdentity.values()].sort(compareEditorProblems);
}

export function createEditorProblems(
  markers: readonly MonacoMarkerLike[],
  diagnostics: readonly BuildDiagnostic[],
  options: NormalizeBuildDiagnosticOptions = {},
): readonly EditorProblem[] {
  return mergeEditorProblems(
    normalizeMonacoMarkers(markers),
    normalizeBuildDiagnostics(diagnostics, options),
  );
}

export function countEditorProblems(problems: readonly EditorProblem[]): ProblemCounts {
  let error = 0;
  let warning = 0;
  let info = 0;
  for (const problem of problems) {
    if (problem.category === 'error') error += 1;
    else if (problem.category === 'warning') warning += 1;
    else info += 1;
  }
  return { total: problems.length, error, warning, info };
}

export function isProblemNavigable(problem: EditorProblem): boolean {
  return (
    (problem.resource !== undefined && problem.range !== undefined) ||
    (problem.file !== undefined && problem.range !== undefined) ||
    (problem.path?.length ?? 0) > 0
  );
}
