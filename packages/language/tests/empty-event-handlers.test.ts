import { describe, expect, it } from 'vitest';
import { createProject, createReusableElement, type PageModel } from '@webrad/project-model';
import { pruneEmptyEventHandlers } from '../src/empty-event-handlers';
function bind<T extends PageModel>(document: T, events: Record<string, string>): T {
  return {
    ...document,
    components: document.components.map((component) => ({ ...component, events })),
  };
}
describe('save cleanup of empty event handlers', () => {
  it('removes shared empty handlers and all their bindings, preserving exact unrelated source and IDs', () => {
    const project = createProject('Cleanup');
    const page = bind(project.pages[0]!, { OnShow: 'Empty', OnHide: 'Empty', OnClick: 'Keep' });
    const source =
      'export class index {\r\n  async Empty(): Promise<void> {\r\n    \r\n  }\r\n  Keep() { return; }\r\n  Helper() {}\r\n}\r\n';
    const sources = { 'pages/index.ts': source, 'units/Untouched.ts': 'function keep() {}' };
    const result = pruneEmptyEventHandlers({ ...project, pages: [page] }, sources);
    expect(result.userSources['pages/index.ts']).toBe(
      source.replace('async Empty(): Promise<void> {\r\n    \r\n  }', ''),
    );
    expect(result.project.pages[0]?.components[0]?.events).toEqual({
      OnShow: null,
      OnHide: null,
      OnClick: 'Keep',
    });
    expect(result.project.pages[0]?.components.map((component) => component.id)).toEqual(
      page.components.map((component) => component.id),
    );
    expect(result.userSources['units/Untouched.ts']).toBe(sources['units/Untouched.ts']);
    expect(page.components[0]?.events.OnShow).toBe('Empty');
    expect(sources['pages/index.ts']).toBe(source);
    expect(pruneEmptyEventHandlers(result.project, result.userSources)).toEqual(result);
  });
  it.each([
    'Empty() { /* intentional */ }',
    'Empty() { // TODO\n }',
    'Empty() { return; }',
    'Empty() { ; }',
    'Empty() { const value = "{}"; }',
    'Empty(value = performWork()) {}',
    '@decorate Empty() {}',
    'static Empty() {}',
    'Empty(value: string): void; Empty(value: string) {}',
  ])('preserves meaningful or special handler declarations: %s', (method) => {
    const project = createProject('Cleanup');
    const page = bind(project.pages[0]!, { OnShow: 'Empty' });
    const sources = { 'pages/index.ts': `export class index { ${method} }` };
    expect(pruneEmptyEventHandlers({ ...project, pages: [page] }, sources).userSources).toEqual(
      sources,
    );
  });
  it('isolates page/reusable classes and skips malformed or missing sources', () => {
    const project = createProject('Cleanup');
    const reusable = bind(createReusableElement('Card'), { OnShow: 'Empty' });
    const page = bind(project.pages[0]!, { OnShow: 'Empty' });
    const sources = {
      'pages/index.ts': 'export class index { Empty() {} Broken( }',
      'reusables/Card.ts': 'class Other { Empty() {} }\nexport class Card { Empty() {} }',
    };
    const result = pruneEmptyEventHandlers(
      { ...project, pages: [page], reusableElements: [reusable] },
      sources,
    );
    expect(result.userSources['pages/index.ts']).toBe(sources['pages/index.ts']);
    expect(result.project.pages[0]?.components[0]?.events.OnShow).toBe('Empty');
    expect(result.userSources['reusables/Card.ts']).toBe(
      'class Other { Empty() {} }\nexport class Card {  }',
    );
    expect(result.project.reusableElements[0]?.components[0]?.events.OnShow).toBeNull();
    expect(pruneEmptyEventHandlers({ ...project, pages: [page] }, {}).project.pages[0]).toEqual(
      page,
    );
  });
});
