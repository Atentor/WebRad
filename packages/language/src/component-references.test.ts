import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  analyzeComponentReferences,
  appendComponentReferenceDeclarations,
  applyComponentReferenceEdits,
  isComponentReferencePosition,
  type ComponentReferenceScope,
} from './component-references';

const scope: ComponentReferenceScope = {
  className: 'PageMain',
  generatedClassName: 'PageMainGenerated',
  componentNames: ['Button1', 'Edit1'],
};

function analyze(source: string, referenceScope = scope) {
  const fileName = '/pages/PageMain.ts';
  const authored = `import { PageMainGenerated } from './PageMain.generated';\n${source}`;
  const snapshot = appendComponentReferenceDeclarations(ts, fileName, authored, referenceScope);
  const host = ts.createCompilerHost({ noLib: true, strict: true });
  host.getSourceFile = (name) =>
    name === fileName
      ? ts.createSourceFile(name, snapshot, ts.ScriptTarget.Latest, true)
      : undefined;
  const program = ts.createProgram([fileName], { noLib: true, strict: true }, host);
  const file = program.getSourceFile(fileName)!;
  const result = analyzeComponentReferences(
    ts,
    file,
    program.getTypeChecker(),
    authored.length,
    referenceScope,
  );
  return {
    ...result,
    file,
    authored,
    output: applyComponentReferenceEdits(authored, result.edits),
  };
}

describe('instance component references', () => {
  it('does not require row context for authored members in repeating event arrows', () => {
    const result = analyze(
      `export class PageMain extends PageMainGenerated {
      idselecionado = 0;
      handler = () => { idselecionado++; this.idselecionado++; };
    }`,
      {
        ...scope,
        repeatingHandlers: {
          handler: { currentRowType: 'Row', componentIds: { Button1: 'button' } },
        },
      },
    );
    expect(result.diagnostics.map(({ code, messageText }) => ({ code, messageText }))).toEqual([]);
    expect(result.edits).toHaveLength(1);
    expect(result.output).not.toContain('__wrCurrentRow');
  });
  it('resolves authored fields, methods, shorthand and local bindings through the instance', () => {
    const result = analyze(`export class PageMain extends PageMainGenerated {
      private idselecionado = 0;
      private format(value: number): string { return String(value); }
      handler() {
        idselecionado += 1;
        const record = { idselecionado };
        const run = () => format(record.idselecionado);
        { const idselecionado = 'local'; send(idselecionado); }
        this.idselecionado = 2;
        return run();
      }
    }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(3);
    expect(result.output).toContain('this.idselecionado += 1');
    expect(result.output).toContain('{ idselecionado: this.idselecionado }');
    expect(result.output).toContain('() => this.format(record.idselecionado)');
    expect(result.output).toContain("const idselecionado = 'local'; send(idselecionado)");
  });

  it('resolves members, arguments, shorthand properties, templates, fields, getters and arrows', () => {
    const result = analyze(`export class PageMain extends PageMainGenerated {
      value = Edit1.value;
      get current() { return Edit1; }
      handler() {
        Button1.enabled = false;
        const record = { Edit1 };
        send(Edit1, record, \`Name: \${Edit1.value}\`);
        const callback = () => Button1.caption = 'Saved';
        callback();
      }
    }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(7);
    expect(result.output).toContain('value = this.Edit1.value');
    expect(result.output).toContain('{ Edit1: this.Edit1 }');
    expect(result.output).toContain('send(this.Edit1, record, `Name: ${this.Edit1.value}`)');
    expect(result.output).not.toContain('declare const');
  });

  it('preserves lexical shadowing, object keys, qualified accesses, comments and literal strings', () => {
    const result = analyze(`export class PageMain extends PageMainGenerated {
      handler(Button1: { enabled: boolean }) {
        Button1.enabled = false;
        const literal = 'Edit1.value'; // Edit1.value
        const obj = { Edit1: literal };
        obj.Edit1;
        { const Edit1 = obj; Edit1.Edit1; }
        this.Edit1.value = literal;
        return Edit1;
      }
    }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(1);
    expect(result.output).toContain('return this.Edit1');
    expect(result.output).toContain('Button1.enabled = false');
    expect(result.output).toContain("'Edit1.value'; // Edit1.value");
    expect(result.output).toContain('obj.Edit1');
    expect(result.output).toContain('this.Edit1.value = literal');
  });

  it('honors imports, module declarations, block bindings and function-scoped var hoisting', () => {
    const imported = analyze(`import { Button1 } from './helper';
      export class PageMain extends PageMainGenerated { handler() { Button1.enabled = false; return Edit1; } }`);
    expect(imported.edits).toHaveLength(1);
    const hoisted = analyze(`export class PageMain extends PageMainGenerated {
      handler() { Button1.caption = 'local'; if (true) { var Button1 = { caption: '' }; } return Edit1; }
    }`);
    expect(hoisted.edits).toHaveLength(1);
    const block = analyze(`{ const Button1 = 42; }
      export class PageMain extends PageMainGenerated { handler() { return Button1; } }`);
    expect(block.edits).toHaveLength(1);
  });

  it('keeps top-level loop and catch bindings local while honoring module var declarations', () => {
    const result = analyze(`for (let Button1 of []) { Button1; }
      for (const Edit1 of []) { Edit1; }
      try {} catch (Button1) { Button1; }
      export class PageMain extends PageMainGenerated {
        handler() { return { Button1, Edit1 }; }
      }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(2);
    expect(result.output).toContain('return { Button1: this.Button1, Edit1: this.Edit1 }');
    expect(result.output).toContain('for (let Button1 of []) { Button1; }');

    const moduleVar = analyze(`for (var Button1 of []) { Button1; }
      export class PageMain extends PageMainGenerated { handler() { return { Button1, Edit1 }; } }`);
    expect(moduleVar.edits).toHaveLength(1);
    expect(moduleVar.output).toContain('return { Button1, Edit1: this.Edit1 }');
  });

  it('uses the receiver in method parameter defaults and destructuring defaults', () => {
    const result = analyze(`export class PageMain extends PageMainGenerated {
      handler(value = Button1.caption, { text = Edit1.value } = {}) { return value + text; }
      callback(action = () => Button1.enabled = false) { action(); }
    }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(3);
    expect(result.output).toContain('value = this.Button1.caption');
    expect(result.output).toContain('{ text = this.Edit1.value }');
    expect(result.output).toContain('() => this.Button1.enabled = false');
    expect(
      isComponentReferencePosition(
        ts,
        result.file,
        result.authored.indexOf('Button1.caption'),
        scope,
      ),
    ).toBe(true);
  });

  it.each([
    'Button1.enabled = false;',
    'export { Button1 };',
    'export class PageMain extends PageMainGenerated { static handler() { return Button1; } }',
    'export class PageMain extends PageMainGenerated { handler() { function callback() { return Button1; } } }',
    'export class PageMain extends PageMainGenerated { handler() { const obj = { run() { return Button1; } }; } }',
    'export class PageMain extends PageMainGenerated { handler() { class Nested { run() { return Button1; } } } }',
    'export class Unrelated { handler() { return Button1; } }',
    'export class PageMain extends PageMainGenerated { constructor() { Button1.caption = "early"; super(document.body); } }',
    'export class PageMain extends PageMainGenerated { [Button1.caption]() {} }',
    'export class PageMain extends PageMainGenerated { constructor(value = Button1.caption) { super(value); } }',
    'export class PageMain extends PageMainGenerated { static handler(value = Button1.caption) {} }',
  ])('rejects component access without the page instance: %s', (source) => {
    const result = analyze(source);
    expect(result.edits).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe(95001);
    expect(
      result.authored.slice(result.diagnostics[0]?.start, (result.diagnostics[0]?.start ?? 0) + 7),
    ).toBe('Button1');
  });

  it('supports constructors after super and leaves type queries as ordinary TypeScript', () => {
    const result = analyze(`export class PageMain extends PageMainGenerated {
      constructor(element: HTMLElement) { super(element);Button1.caption = 'ready'; }
      handler(value: typeof Edit1) { return value; }
    }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.edits).toHaveLength(1);
    expect(result.output).toContain('typeof Edit1');
  });

  it('limits component suggestions to the same instance context as the compiler', () => {
    for (const [source, allowed] of [
      ['export class PageMain extends PageMainGenerated { handler() { Button1; } }', true],
      [
        'export class PageMain extends PageMainGenerated { handler() { const cb = () => Button1; } }',
        true,
      ],
      ['export class PageMain extends PageMainGenerated { static handler() { Button1; } }', false],
      [
        'export class PageMain extends PageMainGenerated { handler() { function cb() { Button1; } } }',
        false,
      ],
    ] as const) {
      const result = analyze(source);
      expect(
        isComponentReferencePosition(ts, result.file, result.authored.indexOf('Button1'), scope),
      ).toBe(allowed);
    }
  });
});
