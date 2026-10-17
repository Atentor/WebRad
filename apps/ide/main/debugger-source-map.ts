import { eachMapping, originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import type { DebugLocation } from '../shared/debugger-contracts';

interface MappedPosition {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly generatedLine: number;
  readonly generatedColumn: number;
}

export function portableDebugPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

/** Only authored files supplied by the compiler can be exposed in the IDE. */
export class DebugSourceMap {
  private readonly map: TraceMap;
  private readonly paths: Map<string, string>;
  private readonly positions: MappedPosition[] = [];
  readonly blackboxedPositions: { lineNumber: number; columnNumber: number }[] = [];

  constructor(sourceMap: string, authoredPaths: readonly string[]) {
    this.map = new TraceMap(sourceMap);
    this.paths = new Map(authoredPaths.map((entry) => [portableDebugPath(entry), entry]));
    let blackboxed = false;
    eachMapping(this.map, (entry) => {
      const sourcePath =
        entry.source === null ? undefined : this.paths.get(portableDebugPath(entry.source));
      const nextBlackboxed = sourcePath === undefined;
      if (nextBlackboxed !== blackboxed) {
        const boundary = {
          lineNumber: entry.generatedLine - 1,
          columnNumber: entry.generatedColumn,
        };
        const previous = this.blackboxedPositions.at(-1);
        if (
          previous?.lineNumber === boundary.lineNumber &&
          previous.columnNumber === boundary.columnNumber
        )
          this.blackboxedPositions.pop();
        else this.blackboxedPositions.push(boundary);
        blackboxed = nextBlackboxed;
      }
      if (entry.source === null || entry.originalLine === null || entry.originalColumn === null)
        return;
      if (sourcePath === undefined) return;
      this.positions.push({
        path: sourcePath,
        line: entry.originalLine,
        column: entry.originalColumn + 1,
        generatedLine: entry.generatedLine - 1,
        generatedColumn: entry.generatedColumn,
      });
    });
  }

  generated(path: string, line: number, column = 1): MappedPosition | undefined {
    const normalized = portableDebugPath(path);
    const candidates = this.positions.filter(
      (entry) => portableDebugPath(entry.path) === normalized && entry.line >= line,
    );
    candidates.sort(
      (a, b) =>
        a.line - b.line ||
        Number(a.column < column) - Number(b.column < column) ||
        a.column - b.column ||
        a.generatedLine - b.generatedLine ||
        a.generatedColumn - b.generatedColumn,
    );
    return candidates[0];
  }

  original(lineNumber: number, columnNumber: number): DebugLocation | undefined {
    const position = originalPositionFor(this.map, { line: lineNumber + 1, column: columnNumber });
    if (position.source === null || position.line === null || position.column === null)
      return undefined;
    const sourcePath = this.paths.get(portableDebugPath(position.source));
    return sourcePath === undefined
      ? undefined
      : { path: sourcePath, line: position.line, column: position.column + 1 };
  }
}
