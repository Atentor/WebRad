import { describe, expect, it, vi } from 'vitest';

import type { BuildDiagnostic } from '../../shared/contracts';
import {
  countEditorProblems,
  createEditorProblems,
  isProblemNavigable,
  mergeEditorProblems,
  normalizeBuildDiagnostic,
  normalizeBuildDiagnostics,
  normalizeMonacoMarker,
  normalizeMonacoMarkers,
  type EditorProblem,
  type MonacoMarkerLike,
} from './editor-problems';

function marker(overrides: Partial<MonacoMarkerLike> = {}): MonacoMarkerLike {
  return {
    owner: 'typescript',
    resource: { toString: () => 'file:///C:/Projects/Demo/forms/FrmMain.ts' },
    severity: 8,
    code: '2304',
    message: "Cannot find name 'MissingType'.",
    startLineNumber: 4,
    startColumn: 11,
    endLineNumber: 4,
    endColumn: 22,
    ...overrides,
  };
}

function buildDiagnostic(overrides: Partial<BuildDiagnostic> = {}): BuildDiagnostic {
  return {
    category: 'error',
    source: 'typescript',
    code: 2304,
    message: "Cannot find name 'MissingType'.",
    file: 'forms/FrmMain.ts',
    line: 4,
    column: 11,
    length: 11,
    ...overrides,
  };
}

describe('editor problems', () => {
  it('normalizes Monaco severity, resource, range, source, and code', () => {
    const problem = normalizeMonacoMarker(
      marker({
        source: 'ts',
        code: { value: 'TS2304' },
        endLineNumber: 3,
        endColumn: 1,
      }),
    );

    expect(problem).toMatchObject({
      category: 'error',
      source: 'ts',
      code: 'TS2304',
      resource: 'file:///C:/Projects/Demo/forms/FrmMain.ts',
      origins: ['monaco'],
      owners: ['typescript'],
      range: {
        startLineNumber: 4,
        startColumn: 11,
        endLineNumber: 4,
        endColumn: 12,
      },
    });
    expect(problem.id).toContain("Cannot find name 'MissingType'.");
  });

  it('maps Monaco warning, hint, and information severities', () => {
    expect(normalizeMonacoMarker(marker({ severity: 4 })).category).toBe('warning');
    expect(normalizeMonacoMarker(marker({ severity: 2 })).category).toBe('info');
    expect(normalizeMonacoMarker(marker({ severity: 1 })).category).toBe('info');
    expect(normalizeMonacoMarker(marker({ source: undefined })).source).toBe('typescript');
  });

  it('normalizes portable build paths and preserves compiler metadata', () => {
    const resolveResource = vi.fn((file: string) => `file:///C:/Projects/Demo/${file}`);
    const problem = normalizeBuildDiagnostic(
      buildDiagnostic({
        file: 'forms\\FrmMain.ts',
        path: ['forms', 0, 'components', 2, 'props', 'caption'],
      }),
      { resolveResource },
    );

    expect(resolveResource).toHaveBeenCalledWith('forms/FrmMain.ts');
    expect(problem).toMatchObject({
      category: 'error',
      source: 'typescript',
      code: 2304,
      file: 'forms/FrmMain.ts',
      resource: 'file:///C:/Projects/Demo/forms/FrmMain.ts',
      length: 11,
      path: ['forms', 0, 'components', 2, 'props', 'caption'],
      origins: ['build'],
      owners: [],
    });
  });

  it('uses current source text to calculate a multiline build range', () => {
    const problem = normalizeBuildDiagnostic(
      buildDiagnostic({ file: 'forms/Test.ts', line: 1, column: 2, length: 4 }),
      { getSourceText: () => 'abc\ndef' },
    );

    expect(problem.range).toEqual({
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 2,
      endColumn: 2,
    });
  });

  it('falls back to a safe single-line range when source text is unavailable', () => {
    const problem = normalizeBuildDiagnostic(
      buildDiagnostic({ line: 7, column: undefined, length: 0 }),
    );

    expect(problem.range).toEqual({
      startLineNumber: 7,
      startColumn: 1,
      endLineNumber: 7,
      endColumn: 2,
    });
  });

  it('deduplicates the same Monaco and build diagnostic while retaining both origins', () => {
    const resource = 'file:///C:/Projects/Demo/forms/FrmMain.ts';
    const problems = createEditorProblems([marker()], [buildDiagnostic()], {
      resolveResource: () => resource,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      code: '2304',
      file: 'forms/FrmMain.ts',
      resource,
      origins: ['monaco', 'build'],
      owners: ['typescript'],
    });
  });

  it('does not merge equal messages from different resources', () => {
    const problems = mergeEditorProblems(
      normalizeMonacoMarkers([
        marker(),
        marker({ resource: { toString: () => 'file:///C:/Projects/Demo/forms/Other.ts' } }),
      ]),
    );

    expect(problems).toHaveLength(2);
  });

  it('orders errors before warnings and information, then by location', () => {
    const problems = mergeEditorProblems(
      normalizeBuildDiagnostics([
        buildDiagnostic({ category: 'info', message: 'Info', file: 'z.ts', line: 1 }),
        buildDiagnostic({ category: 'error', message: 'Later', file: 'b.ts', line: 8 }),
        buildDiagnostic({ category: 'warning', message: 'Warning', file: 'a.ts', line: 1 }),
        buildDiagnostic({ category: 'error', message: 'Earlier', file: 'b.ts', line: 2 }),
      ]),
    );

    expect(problems.map((problem) => problem.message)).toEqual([
      'Earlier',
      'Later',
      'Warning',
      'Info',
    ]);
    expect(countEditorProblems(problems)).toEqual({ total: 4, error: 2, warning: 1, info: 1 });
  });

  it('marks source ranges and model paths as navigable', () => {
    const located = normalizeBuildDiagnostic(buildDiagnostic());
    const modelPath = normalizeBuildDiagnostic(
      buildDiagnostic({ file: undefined, line: undefined, path: ['forms', 0] }),
    );
    const global = normalizeBuildDiagnostic(
      buildDiagnostic({ file: undefined, line: undefined, path: undefined }),
    );

    expect(isProblemNavigable(located)).toBe(true);
    expect(isProblemNavigable(modelPath)).toBe(true);
    expect(isProblemNavigable(global)).toBe(false);
  });

  it('does not mutate the input arrays while merging', () => {
    const first = normalizeMonacoMarkers([marker()]);
    const second = normalizeBuildDiagnostics([buildDiagnostic()]);
    const firstSnapshot = structuredClone(first) as readonly EditorProblem[];
    const secondSnapshot = structuredClone(second) as readonly EditorProblem[];

    mergeEditorProblems(first, second);

    expect(first).toEqual(firstSnapshot);
    expect(second).toEqual(secondSnapshot);
  });
});
