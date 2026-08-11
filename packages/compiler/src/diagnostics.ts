import path from 'node:path';

import type { Message } from 'esbuild';
import ts from 'typescript';

import { VIRTUAL_ROOT } from './source-graph.js';
import type { CompileDiagnostic, CompileDiagnosticCategory } from './types.js';

function portableFileName(fileName: string): string {
  const relative = path.relative(VIRTUAL_ROOT, fileName);
  if (!relative.startsWith('..') && !path.isAbsolute(relative))
    return relative.replaceAll('\\', '/');
  return fileName;
}

function categoryOf(category: ts.DiagnosticCategory): CompileDiagnosticCategory {
  if (category === ts.DiagnosticCategory.Error) return 'error';
  if (category === ts.DiagnosticCategory.Warning) return 'warning';
  return 'info';
}

export function fromTypeScriptDiagnostic(diagnostic: ts.Diagnostic): CompileDiagnostic {
  const file = diagnostic.file;
  const start = diagnostic.start;
  const position =
    file !== undefined && start !== undefined
      ? file.getLineAndCharacterOfPosition(start)
      : undefined;
  return {
    category: categoryOf(diagnostic.category),
    source: 'typescript',
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    file: file === undefined ? undefined : portableFileName(file.fileName),
    line: position === undefined ? undefined : position.line + 1,
    column: position === undefined ? undefined : position.character + 1,
    length: diagnostic.length,
  };
}

export function fromEsbuildMessage(
  message: Message,
  category: 'error' | 'warning',
): CompileDiagnostic {
  return {
    category,
    source: 'esbuild',
    message: message.text,
    file: message.location?.file,
    line: message.location?.line,
    column: message.location === null ? undefined : message.location.column + 1,
    length: message.location?.length,
  };
}
