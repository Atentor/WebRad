import ts from 'typescript';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ComponentView } from '@webrad/components';
import { compileProjectToMemory } from '@webrad/compiler';
import {
  DATA_GRID_CELL_KINDS,
  parseProject,
  serializeProject,
  findDefaultComponentStyle,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
} from '@webrad/project-model';
import {
  WebApiClient,
  WebDataGrid,
  WebToggle,
  WEB_DATA_GRID_CELL_KINDS,
  normalizeWebDataGridConfiguration,
} from '@webrad/runtime';
import { generateRuntimeTypings } from '@webrad/language';
import {
  dataGridToggleApiConfiguration,
  dataGridToggleConfiguration,
  dataGridToggleProject,
  dataGridToggleRows,
  dataGridToggleSources,
} from './fixtures/data-grid-toggle';

it('persists Toggle columns and exposes their shared colors in grid styles', () => {
  const project = dataGridToggleProject();
  expect(parseProject(JSON.parse(serializeProject(project)))).toEqual(project);
  expect(WEB_DATA_GRID_CELL_KINDS).toEqual(DATA_GRID_CELL_KINDS);
  expect(
    normalizeWebDataGridConfiguration(dataGridToggleConfiguration()).columns[0]!.cellKind,
  ).toBe('toggle');
  for (const name of ['toggleCheckedColor', 'toggleThumbColor']) {
    expect(
      COMPONENT_STYLE_PROPERTY_DEFINITIONS.find((p) => p.name === name)!.componentTypes,
    ).toEqual(['WebToggle', 'WebDataGrid']);
  }
  expect(findDefaultComponentStyle(project.styles, 'WebDataGrid')!.states.base).toMatchObject({
    toggleCheckedColor: 'var(--wr-palette-aurora-blue)',
    toggleThumbColor: 'var(--wr-palette-aurora-white)',
  });
  const node = project.pages[0]!.components.find((n) => n.id === 'grid')!;
  const dom = new JSDOM(renderToStaticMarkup(<ComponentView node={node} designTime />));
  const switches = [...dom.window.document.querySelectorAll('[role=switch]')];
  expect(switches).toHaveLength(6);
  expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
    'true',
    'false',
    'false',
    'false',
    'true',
    'false',
  ]);
  expect(switches.every((s) => s.textContent === '')).toBe(true);
  expect(dom.window.document.body.textContent).not.toContain('Ignored caption');
  dom.window.close();
});

it('renders bound boolean values, preserves grid click details and releases cell Toggle instances', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  for (const name of [
    'HTMLDivElement',
    'HTMLButtonElement',
    'HTMLElement',
    'CustomEvent',
    'EventTarget',
  ] as const)
    vi.stubGlobal(name, dom.window[name]);
  const dispose = vi.spyOn(WebToggle.prototype, 'dispose');
  try {
    const host = dom.window.document.createElement('div');
    dom.window.document.body.append(host);
    const grid = new WebDataGrid(host);
    const api = new WebApiClient({
      id: 'api',
      baseUrl: 'https://api.example.test',
      apiClientConfig: dataGridToggleApiConfiguration(),
      fetch: async () =>
        new Response(JSON.stringify({ customers: dataGridToggleRows }), {
          headers: { 'content-type': 'application/json' },
        }),
    });
    grid.dataGridConfig = dataGridToggleConfiguration();
    grid.bindApiClient(api);
    await api.execute('Load');
    const switches = [...host.querySelectorAll<HTMLButtonElement>('[role=switch]')];
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(switches.every((s) => s.disabled && s.tabIndex === -1 && s.textContent === '')).toBe(
      true,
    );
    switches[0]!.click();
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true');
    const clicked = vi.fn();
    grid.bindEvent('OnCellClick', clicked);
    switches[0]!.parentElement!.click();
    expect((clicked.mock.calls[0]![1] as CustomEvent).detail).toMatchObject({
      rowIndex: 0,
      columnIndex: 0,
      value: true,
      column: { cellKind: 'toggle' },
    });
    grid.dataGridConfig = { ...grid.dataGridConfig };
    expect(dispose).toHaveBeenCalled();
    switches[0]!.disabled = false;
    switches[0]!.click();
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true');
    const current = host.querySelector<HTMLButtonElement>('[role=switch]')!;
    grid.dispose();
    grid.dispose();
    current.disabled = false;
    current.click();
    expect(current.getAttribute('aria-checked')).toBe('true');
    api.dispose();
  } finally {
    dispose.mockRestore();
    vi.unstubAllGlobals();
    dom.window.close();
  }
});

it('includes Toggle in Monaco cell-kind completion and rejects unsupported kinds', () => {
  const name = '/virtual/cell.ts';
  const source = `import type { WebDataGridCellKind } from '@webrad/runtime';
const kind: WebDataGridCellKind = 'toggle';
const invalid: WebDataGridCellKind = 'slider';
void kind; void invalid;`;
  const files = new Map([
    [name, source],
    ['/virtual/runtime.d.ts', generateRuntimeTypings()],
  ]);
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  };
  const service = ts.createLanguageService({
    getCompilationSettings: () => options,
    getCurrentDirectory: () => '/virtual',
    getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const value = files.get(name) ?? ts.sys.readFile(name);
      return value === undefined ? undefined : ts.ScriptSnapshot.fromString(value);
    },
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
    directoryExists: (name) => name === '/virtual' || ts.sys.directoryExists(name),
  });
  try {
    const position = source.indexOf("'toggle'") + 1;
    expect(
      service.getCompletionsAtPosition(name, position, {})?.entries.map((e) => e.name),
    ).toContain('toggle');
    expect(service.getSemanticDiagnostics(name).map((d) => d.code)).toEqual([2322]);
  } finally {
    service.dispose();
  }
});

it('executes a compiled Preview with data-bound Toggle cells and OnCellClick', async () => {
  const compiled = await compileProjectToMemory(dataGridToggleProject(), {
    userSources: dataGridToggleSources,
  });
  expect(compiled.success, JSON.stringify(compiled.diagnostics)).toBe(true);
  const dom = new JSDOM('<!doctype html><body></body>', {
    runScripts: 'outside-only',
    url: 'https://preview.test/',
  });
  dom.window.fetch = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ customers: dataGridToggleRows }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  try {
    dom.window.eval(compiled.files['assets/app.js']!);
    await vi.waitFor(() =>
      expect(dom.window.document.querySelectorAll('[role=switch]')).toHaveLength(6),
    );
    const switches = [...dom.window.document.querySelectorAll<HTMLButtonElement>('[role=switch]')];
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    switches[0]!.parentElement!.click();
    expect(dom.window.document.querySelector<HTMLElement>('.wr-webpage')!.dataset.clicked).toBe(
      '{"row":0,"kind":"toggle","value":true}',
    );
    expect(dom.window.document.body.textContent).not.toContain('Ignored caption');
  } finally {
    dom.window.close();
  }
}, 30_000);
