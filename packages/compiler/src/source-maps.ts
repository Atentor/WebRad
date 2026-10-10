import path from 'node:path';

import {
  addMapping,
  GenMapping,
  setIgnore,
  setSourceContent,
  toEncodedMap,
} from '@jridgewell/gen-mapping';
import { eachMapping, TraceMap } from '@jridgewell/trace-mapping';
import { applyComponentReferenceEdits, type ComponentReferenceEdit } from '@webrad/language';

import { VIRTUAL_ROOT } from './source-graph.js';

export const DEBUG_SCRIPT_URL = 'webrad-debug://app.js';

function portableSourcePath(source: string): string {
  const portable = source.replaceAll('\\', '/');
  if (portable.startsWith('webrad-runtime:')) return `__runtime/${portable.slice(15)}`;
  if (portable.startsWith('webrad-restgo:')) return `__restgo/${portable.slice(14)}`;
  const virtualMarker = '.webrad-compiler-virtual/';
  const markerOffset = portable.lastIndexOf(virtualMarker);
  if (markerOffset >= 0) return portable.slice(markerOffset + virtualMarker.length);
  return portable.startsWith('webrad:') ? portable.slice(7) : portable;
}

function lineStarts(source: string): readonly number[] {
  const starts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    const character = source[offset];
    if (character === '\r' && source[offset + 1] === '\n') offset += 1;
    if (
      character === '\r' ||
      character === '\n' ||
      character === '\u2028' ||
      character === '\u2029'
    )
      starts.push(offset + 1);
  }
  return starts;
}

function sourcePosition(
  starts: readonly number[],
  offset: number,
): { line: number; column: number } {
  let lower = 0;
  let upper = starts.length;
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((starts[middle] ?? 0) <= offset) lower = middle;
    else upper = middle;
  }
  return { line: lower + 1, column: offset - (starts[lower] ?? 0) };
}

/** Invert only the compiler's AST-selected edits; authored sources are never changed. */
function editedPositionMapper(source: string, edits: readonly ComponentReferenceEdit[]) {
  const authoredStarts = lineStarts(source);
  const compiledStarts = lineStarts(applyComponentReferenceEdits(source, edits));
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  return (line: number, column: number): { line: number; column: number } => {
    const compiledOffset = (compiledStarts[line - 1] ?? source.length) + column;
    let delta = 0;
    for (const edit of sorted) {
      const compiledStart = edit.start + delta;
      if (compiledOffset < compiledStart) break;
      const compiledEnd = compiledStart + edit.text.length;
      if (compiledOffset < compiledEnd) {
        const identifier = source.slice(edit.start, edit.end);
        const localOffset = compiledOffset - compiledStart;
        const suffixOffset = edit.text.lastIndexOf(identifier);
        // A shorthand property also retains its original key before the inserted this.
        const originalOffset =
          edit.text.startsWith(identifier) && localOffset < identifier.length
            ? localOffset
            : Math.max(0, Math.min(identifier.length, localOffset - suffixOffset));
        return sourcePosition(authoredStarts, edit.start + originalOffset);
      }
      delta += edit.text.length - (edit.end - edit.start);
    }
    return sourcePosition(authoredStarts, compiledOffset - delta);
  };
}

/** Compose esbuild's bundle mappings with instance-reference edits and portable project paths. */
export function composeSourceMap(
  sourceMap: string,
  sources: ReadonlyMap<string, string>,
  sourceEdits: ReadonlyMap<string, readonly ComponentReferenceEdit[]>,
): string {
  const traced = new TraceMap(sourceMap);
  const composed = new GenMapping({ file: traced.file });
  const authored = new Map(
    [...sources].map(([file, content]) => [
      path.relative(VIRTUAL_ROOT, file).replaceAll('\\', '/'),
      content,
    ]),
  );
  const remappers = new Map(
    [...sourceEdits].flatMap(([file, edits]) => {
      const content = sources.get(file);
      return content === undefined
        ? []
        : [
            [
              path.relative(VIRTUAL_ROOT, file).replaceAll('\\', '/'),
              editedPositionMapper(content, edits),
            ] as const,
          ];
    }),
  );
  for (const [index, source] of traced.sources.entries()) {
    if (source === null) continue;
    const portable = portableSourcePath(source);
    setSourceContent(
      composed,
      portable,
      authored.get(portable) ?? traced.sourcesContent?.[index] ?? null,
    );
    if (
      portable.startsWith('__runtime/') ||
      portable.startsWith('__restgo/') ||
      portable === 'entry.ts' ||
      portable.endsWith('.generated.ts')
    )
      setIgnore(composed, portable);
  }
  eachMapping(traced, (mapping) => {
    const generated = { line: mapping.generatedLine, column: mapping.generatedColumn };
    if (
      mapping.source === null ||
      mapping.originalLine === null ||
      mapping.originalColumn === null
    ) {
      addMapping(composed, { generated });
      return;
    }
    const source = portableSourcePath(mapping.source);
    const original = remappers.get(source)?.(mapping.originalLine, mapping.originalColumn) ?? {
      line: mapping.originalLine,
      column: mapping.originalColumn,
    };
    if (mapping.name === null) addMapping(composed, { generated, source, original });
    else addMapping(composed, { generated, source, original, name: mapping.name });
  });
  return JSON.stringify(toEncodedMap(composed));
}
