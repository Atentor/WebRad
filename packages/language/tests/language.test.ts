import { describe, expect, it } from 'vitest';

import { parseForm, type FormModel } from '@webrad/project-model';

import {
  createUserFormSource,
  ensureEventHandler,
  generateFormArtifacts,
  generateFormSource,
  generateFormTypings,
  generateRuntimeTypings,
} from '../src/index.js';

function testForm(): FormModel {
  return parseForm({
    formatVersion: 1,
    id: 'form-model',
    name: 'FrmMain',
    caption: 'Main',
    width: 640,
    height: 480,
    layoutMode: 'absolute',
    rootComponentId: 'form-root',
    components: [
      {
        id: 'form-root',
        type: 'WebForm',
        name: 'FrmMain',
        parentId: null,
        bounds: { x: 0, y: 0, width: 640, height: 480 },
        props: { caption: 'Main', visible: true, enabled: true },
        events: { OnCreate: null, OnShow: null, OnHide: null, OnResize: null },
        children: ['button-show', 'api-client'],
      },
      {
        id: 'button-show',
        type: 'WebButton',
        name: 'BTNMostrar',
        parentId: 'form-root',
        bounds: { x: 16, y: 16, width: 120, height: 32 },
        props: { caption: 'Mostrar', visible: true, enabled: true },
        events: { OnClick: 'BTNMostrarClick' },
        children: [],
      },
      {
        id: 'api-client',
        type: 'WebApiClient',
        name: 'ApiClient1',
        parentId: 'form-root',
        bounds: { x: 0, y: 0, width: 96, height: 48 },
        props: { baseUrl: 'https://api.example.test' },
        events: {},
        children: [],
      },
    ],
  });
}

describe('form language generation', () => {
  it('generates separate executable source and editor typings from the model', () => {
    const form = testForm();
    const source = generateFormSource(form);
    const typings = generateFormTypings(form);
    const userSource = createUserFormSource(form);
    const artifacts = generateFormArtifacts(form);

    expect(source).toContain('public readonly BTNMostrar: WebButton;');
    expect(source).toContain('new WebButton(this.requireComponentElement("button-show"))');
    expect(source).toContain(
      'this.ApiClient1 = new WebApiClient({"baseUrl":"https://api.example.test"})',
    );
    expect(source).not.toContain('requireComponentElement("api-client")');
    expect(source).toContain(
      'this.bindGeneratedEvent(this.BTNMostrar, "OnClick", "BTNMostrarClick")',
    );
    expect(typings).toContain('export declare abstract class FrmMainGenerated extends WebForm');
    expect(userSource).toContain('export class FrmMain extends FrmMainGenerated');
    expect(artifacts.generatedFileName).toBe('forms/FrmMain.generated.ts');
    expect(artifacts.userFileName).toBe('forms/FrmMain.ts');
    expect(generateRuntimeTypings()).toContain("declare module '@webrad/runtime'");
  });
});

describe('event handler AST editing', () => {
  it('inserts a typed async method and returns its navigation position', () => {
    const original = `// user formatting is retained
export class FrmMain extends FrmMainGenerated {
  readonly answer = 42;
}
`;
    const edit = ensureEventHandler(original, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(true);
    expect(edit.sourceText).toContain('import type { WebButton } from "@webrad/runtime";');
    expect(edit.sourceText).toContain('async BTNMostrarClick(sender: WebButton): Promise<void>');
    expect(edit.sourceText).toContain('readonly answer = 42;');
    expect(edit.location.line).toBeGreaterThan(1);

    const second = ensureEventHandler(edit.sourceText, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });
    expect(second.changed).toBe(false);
    expect(second.sourceText).toBe(edit.sourceText);
    expect(second.location).toEqual(edit.location);
  });

  it('uses an existing aliased runtime type import', () => {
    const edit = ensureEventHandler(
      `import type { WebButton as Button } from '@webrad/runtime';
export class FrmMain {}
`,
      {
        className: 'FrmMain',
        componentName: 'BTNMostrar',
        componentType: 'WebButton',
        eventName: 'OnClick',
      },
    );
    expect(edit.sourceText).toContain('sender: Button');
    expect(edit.sourceText.match(/@webrad\/runtime/g)).toHaveLength(1);
  });

  it('does not duplicate an existing property-style handler', () => {
    const source = `export class FrmMain {
  BTNMostrarClick = async (sender: WebButton): Promise<void> => {};
}
`;
    const edit = ensureEventHandler(source, {
      className: 'FrmMain',
      componentName: 'BTNMostrar',
      componentType: 'WebButton',
      eventName: 'OnClick',
    });

    expect(edit.changed).toBe(false);
    expect(edit.sourceText).toBe(source);
  });
});
