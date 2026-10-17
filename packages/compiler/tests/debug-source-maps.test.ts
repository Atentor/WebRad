import {
  eachMapping,
  generatedPositionFor,
  originalPositionFor,
  sourceContentFor,
  TraceMap,
} from '@jridgewell/trace-mapping';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  addReusableElement,
  bindComponentEvent,
  createProject,
  createReusableElement,
  updatePage,
} from '@webrad/project-model';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { compileProjectToMemory } from '../src/index.js';

function sourcePosition(source: string, token: string): { line: number; column: number } {
  const offset = source.indexOf(token);
  if (offset < 0) throw new Error(`Missing test token: ${token}`);
  const prefix = source.slice(0, offset).split('\n');
  return { line: prefix.length, column: prefix[prefix.length - 1]?.length ?? 0 };
}

describe('debug source maps', () => {
  it('maps the complete debug bundle to original portable authored sources and preserves execution', async () => {
    let project = createProject('Debugger');
    let page = project.pages[0]!;
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebButton', {
        id: 'debug-button',
        name: 'Button1',
        parentId: page.rootComponentId,
      }),
      page.rootComponentId,
    );
    page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'PageMainCreate');
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebVideoPlayer', {
        id: 'debug-video',
        name: 'VideoPlayer1',
        parentId: page.rootComponentId,
      }),
      page.rootComponentId,
    );
    project = updatePage(project, page.id, page);
    let reusable = createReusableElement('DebugReusable');
    reusable = addComponent(
      reusable,
      defaultComponentRegistry.createComponent('WebLabel', {
        id: 'debug-label',
        name: 'Label1',
        parentId: reusable.rootComponentId,
      }),
      reusable.rootComponentId,
    );
    project = addReusableElement(project, reusable);
    page = addComponent(
      page,
      defaultComponentRegistry.createComponent('WebReusableElement', {
        id: 'debug-reusable-placement',
        name: 'Reusable1',
        parentId: page.rootComponentId,
        props: { reusableElementId: reusable.id },
      }),
      page.rootComponentId,
    );
    project = updatePage(project, page.id, page);
    const pageSource = [
      `import { PageMainGenerated } from './PageMain.generated';`,
      `import { Customer } from '../models/Customer';`,
      `import { greeting } from '../units/Helpers';`,
      'export class PageMain extends PageMainGenerated {',
      '  public PageMainCreate(): void {',
      `    const emoji = '😀'; Button1.caption = greeting(new Customer()); Button1.visible = true;`,
      `    const refs = { Button1 }; this.element.dataset.caption = refs.Button1.caption + emoji;`,
      `    this.element.dataset.scriptText = '</SCRIPT>';`,
      `    this.element.dataset.scriptVariants = JSON.stringify(['</script>', '</ScRiPt>', '</SCRIPT>']); this.element.dataset.afterEscapes = 'mapped';`,
      `    /* </script> */ this.element.dataset.afterComment = 'mapped-comment';`,
      '  }',
      '}',
    ].join('\r\n');
    const reusableSource = `import { DebugReusableGenerated } from './DebugReusable.generated';
export class DebugReusable extends DebugReusableGenerated {
  public setCaption(): void { Label1.caption = 'Reusable'; Label1.visible = false; }
}`;
    const modelSource = `export class Customer { public name: string = 'Ada'; }`;
    const unitSource = `import type { Customer } from '../models/Customer';
export function greeting(customer: Customer): string { return 'Hello ' + customer.name; }`;
    const userSources = Object.freeze({
      'pages\\PageMain.ts': pageSource,
      'reusables/DebugReusable.ts': reusableSource,
      'models/Customer.ts': modelSource,
      'units/Helpers.ts': unitSource,
    });
    const result = await compileProjectToMemory(project, {
      userSources,
      debug: true,
      minify: true,
      sourcemap: false,
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.debug?.scriptUrl).toBe('webrad-debug://app.js');
    expect(result.debug?.sourceMap).toBe(result.files['assets/app.js.map']);
    expect(result.previewHtml).toContain('//# sourceURL=webrad-debug://app.js\n</script>');
    expect(result.files['assets/app.js']).not.toContain('sourceURL=');
    expect(result.files['assets/app.js']?.split('\n').length).toBeGreaterThan(100);
    const map = new TraceMap(result.debug!.sourceMap);
    const shakaIndex = map.sources.indexOf('__vendor/shaka/shaka-player.ui.js');
    expect(shakaIndex).toBeGreaterThanOrEqual(0);
    const encoded = JSON.parse(result.debug!.sourceMap) as {
      ignoreList?: number[];
      x_google_ignoreList?: number[];
    };
    expect(encoded.ignoreList ?? encoded.x_google_ignoreList).toContain(shakaIndex);
    expect(map.sources).toEqual(
      expect.arrayContaining([
        'pages/PageMain.ts',
        'reusables/DebugReusable.ts',
        'models/Customer.ts',
        'units/Helpers.ts',
      ]),
    );
    expect(
      map.sources.every(
        (source) =>
          source !== null &&
          !source.includes('\\') &&
          !source.includes('.webrad-compiler-virtual') &&
          !source.includes(':'),
      ),
    ).toBe(true);
    for (const [source, content] of Object.entries({
      'pages/PageMain.ts': pageSource,
      'reusables/DebugReusable.ts': reusableSource,
      'models/Customer.ts': modelSource,
      'units/Helpers.ts': unitSource,
    }))
      expect(sourceContentFor(map, source)).toBe(content);
    const authoredMappings: { line: number; column: number }[] = [];
    eachMapping(map, (mapping) => {
      if (
        mapping.source === 'pages/PageMain.ts' &&
        mapping.originalLine !== null &&
        mapping.originalColumn !== null
      )
        authoredMappings.push({ line: mapping.originalLine, column: mapping.originalColumn });
    });
    for (const token of [
      'Button1.caption',
      'greeting(new Customer())',
      'Button1.visible',
      'refs =',
      'this.element.dataset.caption',
      "'</SCRIPT>'",
      'this.element.dataset.afterEscapes',
      'this.element.dataset.afterComment',
    ]) {
      const position = sourcePosition(pageSource, token);
      expect(authoredMappings, token).toContainEqual(position);
      const generated = generatedPositionFor(map, { source: 'pages/PageMain.ts', ...position });
      expect(generated.line, token).not.toBeNull();
      const roundtrip = originalPositionFor(map, {
        line: generated.line!,
        column: generated.column!,
      });
      expect(roundtrip, token).toMatchObject({ source: 'pages/PageMain.ts', ...position });
    }
    expect(userSources['pages\\PageMain.ts']).toBe(pageSource);
    const parsed = new JSDOM(result.previewHtml);
    try {
      // No HTML-time escaping may shift generated columns after esbuild creates the map.
      expect(parsed.window.document.querySelector('script')?.textContent).toBe(
        `${result.files['assets/app.js']}\n//# sourceURL=webrad-debug://app.js\n`,
      );
    } finally {
      parsed.window.close();
    }
    const dom = new JSDOM(result.previewHtml, {
      runScripts: 'dangerously',
      url: 'http://localhost/preview/',
    });
    try {
      expect(
        dom.window.document.querySelector('[data-webrad-id="debug-button"]')?.textContent,
      ).toBe('Hello Ada');
      expect(
        dom.window.document.querySelector<HTMLElement>('[data-caption]')?.dataset.caption,
      ).toBe('Hello Ada😀');
      expect(
        dom.window.document.querySelector<HTMLElement>('[data-script-text]')?.dataset.scriptText,
      ).toBe('</SCRIPT>');
      const variants = dom.window.document.querySelector<HTMLElement>('[data-script-variants]');
      expect(variants?.dataset.scriptVariants).toBe(
        JSON.stringify(['</script>', '</ScRiPt>', '</SCRIPT>']),
      );
      expect(variants?.dataset.afterEscapes).toBe('mapped');
      expect(variants?.dataset.afterComment).toBe('mapped-comment');
    } finally {
      dom.window.close();
    }
  }, 120_000);

  it('keeps normal builds free of debugger metadata while correcting requested source maps', async () => {
    const result = await compileProjectToMemory(createProject('OrdinaryBrowser'), {
      userSources: {},
      sourcemap: true,
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.debug).toBeUndefined();
    expect(result.previewHtml).not.toContain('webrad-debug://');
    expect(new TraceMap(result.files['assets/app.js.map']!).sources).toContain('pages/PageMain.ts');
  }, 120_000);

  it('executes nested HTML delimiters and tagged raw templates with the exact mapped debug script', async () => {
    let project = createProject('HtmlScriptDelimiters');
    let page = project.pages[0]!;
    page = bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'PageMainCreate');
    project = updatePage(project, page.id, page);
    const source = `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  public PageMainCreate(): void {
    document.documentElement.dataset.executedScript = document.currentScript?.textContent ?? '';
    document.documentElement.dataset.htmlTrap = '<!--<script>';
    document.documentElement.dataset.rawTemplate = String.raw\`</script><ScRiPt>\`;
    document.documentElement.dataset.afterTrap = 'executed';
  }
}`;
    const result = await compileProjectToMemory(project, {
      userSources: { 'pages/PageMain.ts': source },
      debug: true,
    });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    const map = new TraceMap(result.debug!.sourceMap);
    const position = sourcePosition(source, 'document.documentElement.dataset.afterTrap');
    const generated = generatedPositionFor(map, { source: 'pages/PageMain.ts', ...position });
    expect(
      originalPositionFor(map, { line: generated.line!, column: generated.column! }),
    ).toMatchObject({
      source: 'pages/PageMain.ts',
      ...position,
    });
    const dom = new JSDOM(result.previewHtml, {
      runScripts: 'dangerously',
      url: 'http://localhost/preview/',
    });
    try {
      const values = dom.window.document.documentElement.dataset;
      expect(
        values.executedScript ===
          `${result.files['assets/app.js']}\n//# sourceURL=webrad-debug://app.js\n`,
      ).toBe(true);
      expect(values.htmlTrap).toBe('<!--<script>');
      expect(values.rawTemplate).toBe('</script><ScRiPt>');
      expect(values.afterTrap).toBe('executed');
    } finally {
      dom.window.close();
    }
  }, 120_000);
});
