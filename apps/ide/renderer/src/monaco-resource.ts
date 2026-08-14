import * as monacoApi from 'monaco-editor/editor';

/** Returns the exact stable resource identifier used internally by Monaco models and markers. */
export function canonicalMonacoResource(resource: string): string {
  return monacoApi.Uri.parse(resource).toString();
}
