import type * as monacoApi from 'monaco-editor/editor';

interface SourceChange {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function splitsCharacter(source: string, offset: number): boolean {
  const previous = source.charCodeAt(offset - 1);
  const current = source.charCodeAt(offset);
  return (
    (previous === 13 && current === 10) ||
    (previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff)
  );
}

/** Reconcile a Project Model snapshot without replacing Monaco's buffer or undo history. */
export function sourceChange(previous: string, next: string): SourceChange | null {
  if (previous === next) return null;
  let start = 0;
  const commonLength = Math.min(previous.length, next.length);
  while (start < commonLength && previous[start] === next[start]) start += 1;
  if (splitsCharacter(previous, start) || splitsCharacter(next, start)) start -= 1;

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }
  if (splitsCharacter(previous, previousEnd) || splitsCharacter(next, nextEnd)) {
    previousEnd += 1;
    nextEnd += 1;
  }
  return { start, end: previousEnd, text: next.slice(start, nextEnd) };
}

export function synchronizeMonacoModel(
  model: monacoApi.editor.ITextModel,
  previous: string,
  next: string,
  editor: monacoApi.editor.IStandaloneCodeEditor | null,
): void {
  if (previous === next) return;
  model.pushStackElement();
  const newline = next.indexOf('\n');
  const nextEOL = newline < 0 ? model.getEOL() : next[newline - 1] === '\r' ? '\r\n' : '\n';
  if (nextEOL !== model.getEOL()) {
    model.pushEOL(nextEOL === '\r\n' ? 1 : 0);
    previous = model.getValue();
  }
  const change = sourceChange(previous, next);
  if (change === null) {
    model.pushStackElement();
    return;
  }
  const start = model.getPositionAt(change.start);
  const end = model.getPositionAt(change.end);
  const edit: monacoApi.editor.IIdentifiedSingleEditOperation = {
    range: {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    },
    text: change.text,
    forceMoveMarkers: true,
  };
  if (editor?.getModel() === model) {
    editor.executeEdits('webrad.project-model', [edit]);
  } else {
    model.pushEditOperations(null, [edit], () => null);
  }
  model.pushStackElement();
}
