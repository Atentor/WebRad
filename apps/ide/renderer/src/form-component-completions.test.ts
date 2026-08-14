import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  formComponentCompletionSymbols,
  supportsTypeScriptThisExpression,
  type FormComponentSymbol,
} from './form-component-completions';

const ACTIVE_RESOURCE = 'file:///project/forms/FrmMain.ts';
const COMPONENTS: readonly FormComponentSymbol[] = [
  { name: 'Button1', type: 'WebButton' },
  { name: 'ApiClient1', type: 'WebApiClient' },
];

function completionInfoAtMarker(sourceWithMarker: string): unknown {
  const marker = '/*completion*/';
  const position = sourceWithMarker.indexOf(marker);
  if (position < 0) throw new Error('Completion test source is missing its marker.');
  const source = sourceWithMarker.replace(marker, '');
  const fileName = '/project/forms/FrmMain.ts';
  const host: ts.LanguageServiceHost = {
    fileExists: (candidate) => candidate === fileName,
    getCompilationSettings: () => ({ strict: true, target: ts.ScriptTarget.ES2022 }),
    getCurrentDirectory: () => '/project',
    getDefaultLibFileName: () => '',
    getScriptFileNames: () => [fileName],
    getScriptSnapshot: (candidate) =>
      candidate === fileName ? ts.ScriptSnapshot.fromString(source) : undefined,
    getScriptVersion: () => '1',
    readFile: (candidate) => (candidate === fileName ? source : undefined),
  };
  const service = ts.createLanguageService(host);
  try {
    return service.getCompletionsAtPosition(fileName, position, undefined);
  } finally {
    service.dispose();
  }
}

describe('form component completion selection', () => {
  it('offers visual and nonvisual component Names in a bare identifier context', () => {
    expect(
      formComponentCompletionSymbols(COMPONENTS, {
        activeResource: ACTIVE_RESOURCE,
        requestedResource: ACTIVE_RESOURCE,
        supportsThisExpression: true,
      }),
    ).toEqual(COMPONENTS);
  });

  it('leaves positions rejected by TypeScript to the native provider', () => {
    expect(
      formComponentCompletionSymbols(COMPONENTS, {
        activeResource: ACTIVE_RESOURCE,
        requestedResource: ACTIVE_RESOURCE,
        supportsThisExpression: false,
      }),
    ).toEqual([]);
  });

  it('uses TypeScript syntax to allow expressions and reject multiline or declaration contexts', () => {
    for (const source of [
      'class Form { Button1 = {}; handler() { /*completion*/Butt; } }',
      'class Form { Button1 = {}; handler() { const value = /*completion*/Butt; } }',
      'class Form { Button1 = {}; handler() { alert(/*completion*/Butt); } }',
      'class Form { Button1 = {}; handler() { return /*completion*/Butt; } }',
      'class Form { Button1 = {}; handler() { const value = { item: /*completion*/Butt }; } }',
    ]) {
      expect(supportsTypeScriptThisExpression(completionInfoAtMarker(source))).toBe(true);
    }

    for (const source of [
      'import {\n  /*completion*/Butt\n} from "module";',
      'class Form { Button1 = {}; handler() { /*\n /*completion*/Butt\n */ } }',
      'class Form { Button1 = {}; handler() { const text = `\n /*completion*/Butt`; } }',
      'class Form { Button1 = {}; handler() { const /*completion*/Butt = 1; } }',
      'class Form { Button1 = {}; handler(/*completion*/Butt: unknown) {} }',
      'class Form { Button1 = {}; /*completion*/Butt; }',
      'class Form { Button1 = {}; handler() { const value: /*completion*/Butt = {}; } }',
      'class Form { Button1 = {}; handler() { const value = { /*completion*/Butt }; } }',
    ]) {
      expect(supportsTypeScriptThisExpression(completionInfoAtMarker(source))).toBe(false);
    }
  });

  it('does not offer active-form components in another model', () => {
    expect(
      formComponentCompletionSymbols(COMPONENTS, {
        activeResource: ACTIVE_RESOURCE,
        requestedResource: 'file:///project/forms/FrmOther.ts',
        supportsThisExpression: true,
      }),
    ).toEqual([]);
  });
});
