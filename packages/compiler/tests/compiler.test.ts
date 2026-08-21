import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addComponent,
  addComponentStyle,
  bindComponentEvent,
  createComponentStyle,
  createProject,
  setComponentStyle,
  updatePage,
  type PageModel,
  type WebRadProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime/visual';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import { compileProject, compileProjectToMemory } from '../src/index.js';
import {
  collectTailwindCandidates,
  compileTailwindStyles,
  GENERATED_APP_CSS,
} from '../src/styles.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-compiler-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function executableProject(): WebRadProject {
  let sequence = 0;
  const idFactory = (): string => `stable-${String((sequence += 1))}`;
  const project = createProject('HelloWebRad', { idFactory });
  let page: PageModel = project.pages[0] as PageModel;
  const rootId = page.rootComponentId;
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebEdit', {
      id: 'edit-name',
      name: 'EDTNome',
      parentId: rootId,
      x: 24,
      y: 24,
    }),
    rootId,
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'button-show',
      name: 'BTNMostrar',
      parentId: rootId,
      x: 24,
      y: 72,
    }),
    rootId,
  );
  page = addComponent(
    page,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'api-client',
      name: 'ApiClient1',
      parentId: rootId,
      props: { baseUrl: 'https://api.example.test' },
    }),
    rootId,
  );
  page = bindComponentEvent(page, rootId, 'OnCreate', 'PageMainCreate');
  page = bindComponentEvent(page, 'button-show', 'OnClick', 'BTNMostrarClick');
  return updatePage(project, page.id, page);
}

function styledExecutableProject(): WebRadProject {
  const project = executableProject();
  const style = createComponentStyle('Primary Button', 'WebButton', {
    idFactory: () => 'style-primary-button',
    classes: {
      base: 'bg-blue-600 px-6 text-white tracking-[0.125em]',
      hover: 'bg-blue-700',
      focus: 'ring-2 ring-blue-300',
      active: 'scale-95',
      disabled: 'cursor-not-allowed opacity-50',
      animation: 'transition-all duration-200 animate-pulse',
      advanced:
        'rounded-lg [box-shadow:0_4px_12px_rgb(0_0_0_/_0.25)] [&>span]:text-red-500 bg-blue-600',
    },
  });
  const withStyle = addComponentStyle(project, style);
  return setComponentStyle(withStyle, withStyle.pages[0]!.id, 'button-show', style.id);
}

describe('compileProject', () => {
  it('validates, typechecks and writes an ordinary browser application', async () => {
    const outputDirectory = await temporaryDirectory();
    const project = executableProject();
    const originalUserSource = `import { PageMainGenerated } from './PageMain.generated';

export class PageMain extends PageMainGenerated {
  public PageMainCreate(): void {
    this.EDTNome.value = 'Ada';
    this.EDTNome.x = 36;
    const configuredBaseUrl = this.ApiClient1.baseUrl;
    this.ApiClient1.baseUrl = \`\${configuredBaseUrl}/v1\`;
    this.element.dataset.runtimeContract = JSON.stringify({
      editId: this.EDTNome.id,
      editName: this.EDTNome.name,
      editValue: this.EDTNome.value,
      editX: this.EDTNome.x,
      editWidth: this.EDTNome.width,
      buttonCaption: this.BTNMostrar.caption,
      apiId: this.ApiClient1.id,
      apiName: this.ApiClient1.name,
      apiBaseUrl: this.ApiClient1.baseUrl,
    });
  }

  public async BTNMostrarClick(): Promise<void> {
    Message(\`Olá \${this.EDTNome.value}\`);
  }
}
`;
    const userSources = { 'pages/PageMain.ts': originalUserSource };

    const result = await compileProject(project, { outputDirectory, userSources });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['index.html']).toContain('./assets/app.js');
    expect(result.files['assets/app.js']).toContain('BTNMostrarClick');
    expect(result.files['assets/app.js']).toContain('https://api.example.test');
    expect(result.files['assets/app.js']).toContain('api-client');
    expect(result.files['assets/app.css']).toContain('.wr-webpage');
    expect(result.files['assets/app.css']).toContain('.wr-webbutton:hover:not(:disabled)');
    expect(result.previewHtml).toContain('<script>');
    expect(result.previewHtml).toContain('<style>');
    await expect(fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
    await expect(
      fs.readFile(path.join(outputDirectory, 'assets', 'app.js'), 'utf8'),
    ).resolves.toContain('mountPage');
    await expect(fs.stat(path.join(outputDirectory, 'pages', 'PageMain.ts'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
    expect(userSources['pages/PageMain.ts']).toBe(originalUserSource);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    expect(() => dom.window.eval(result.files['assets/app.js'] ?? '')).not.toThrow();
    expect(dom.window.document.querySelector('[data-webrad-id="api-client"]')).toBeNull();
    const mountedPage = dom.window.document.querySelector<HTMLElement>('[data-webrad-page-id]');
    expect(mountedPage).not.toBeNull();
    const serializedContract = mountedPage?.dataset.runtimeContract;
    expect(serializedContract).toBeDefined();
    expect(JSON.parse(serializedContract ?? '{}') as unknown).toEqual({
      editId: 'edit-name',
      editName: 'EDTNome',
      editValue: 'Ada',
      editX: 36,
      editWidth: 160,
      buttonCaption: 'Button',
      apiId: 'api-client',
      apiName: 'ApiClient1',
      apiBaseUrl: 'https://api.example.test/v1',
    });
    const editElement = dom.window.document.querySelector('[data-webrad-id="edit-name"]');
    expect(editElement).toBeInstanceOf(dom.window.HTMLInputElement);
    if (!(editElement instanceof dom.window.HTMLInputElement)) {
      throw new TypeError('Compiled WebEdit did not render an input element.');
    }
    expect(editElement.value).toBe('Ada');
    expect(editElement.style.left).toBe('36px');
    dom.window.close();
  });

  it('embeds the same browser-safe component stylesheet used by the designer projection', () => {
    expect(GENERATED_APP_CSS).toContain(WEBRAD_COMPONENT_CSS);
    expect(GENERATED_APP_CSS).toContain('--wr-control-surface: #f5f7fa');
  });

  it('compiles only saved Tailwind candidates with states, animation and arbitrary values', async () => {
    const project = styledExecutableProject();
    const css = await compileTailwindStyles(project.styles);
    const candidates = collectTailwindCandidates(project.styles);

    expect(candidates).toEqual(
      expect.arrayContaining([
        'bg-blue-600',
        'hover:bg-blue-700',
        'focus:ring-2',
        'active:scale-95',
        'disabled:opacity-50',
        'aria-disabled:opacity-50',
        'animate-pulse',
        '[box-shadow:0_4px_12px_rgb(0_0_0_/_0.25)]',
        '[&>span]:text-red-500',
      ]),
    );
    expect(candidates.filter((candidate) => candidate === 'bg-blue-600')).toHaveLength(1);
    expect(css).toContain('.bg-blue-600');
    expect(css).toContain('.hover\\:bg-blue-700');
    expect(css).toContain('.disabled\\:opacity-50');
    expect(css).toContain('.aria-disabled\\:opacity-50');
    expect(css).toContain('.animate-pulse');
    expect(css).toContain('.tracking-\\[0\\.125em\\]');
    expect(css).toContain('.\\[box-shadow\\:0_4px_12px_rgb\\(0_0_0_\\/_0\\.25\\)\\]');
    expect(css).toContain('.\\[\\&\\>span\\]\\:text-red-500 > span');
    expect(css).not.toContain('.m-96');
    expect(css).not.toContain('::file-selector-button');
  });

  it('rejects brace expansion syntax instead of expanding authored candidates', async () => {
    const style = createComponentStyle('Unsafe Expansion', 'WebButton', {
      idFactory: () => 'style-unsafe-expansion',
      classes: { advanced: 'bg-{red,blue}-500' },
    });

    await expect(compileTailwindStyles([style])).rejects.toThrow(
      'Braces are reserved for @source expansion',
    );
  });

  it('ships static Tailwind CSS and applies the selected style in the compiled browser app', async () => {
    const result = await compileProjectToMemory(styledExecutableProject(), { userSources: {} });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const css = result.files['assets/app.css'] ?? '';
    expect(css).toContain('@layer theme, base, components, utilities');
    expect(css).toContain('@layer components');
    expect(css).toContain('@layer utilities');
    expect(css).toContain('.wr-webbutton');
    expect(css).toContain('.bg-blue-600');
    expect(result.files['assets/app.js']).not.toContain('@tailwindcss');

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const button = dom.window.document.querySelector<HTMLElement>('[data-webrad-id="button-show"]');
    expect(button).not.toBeNull();
    expect([...(button?.classList ?? [])]).toEqual(
      expect.arrayContaining([
        'bg-blue-600',
        'hover:bg-blue-700',
        'disabled:opacity-50',
        'animate-pulse',
      ]),
    );
    dom.window.close();
  });

  it('preserves an empty style binding and lets it own paint properties', async () => {
    const project = executableProject();
    const emptyStyle = createComponentStyle('Empty Page', 'WebPage', {
      idFactory: () => 'style-empty-page',
    });
    const withStyle = addComponentStyle(project, emptyStyle);
    const assigned = setComponentStyle(
      withStyle,
      withStyle.pages[0]!.id,
      withStyle.pages[0]!.rootComponentId,
      emptyStyle.id,
    );
    const painted: WebRadProject = {
      ...assigned,
      pages: assigned.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === page.rootComponentId
            ? {
                ...component,
                props: { ...component.props, backgroundColor: 'rgb(255, 0, 0)' },
              }
            : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(painted, { userSources: {} });
    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['assets/app.js']).toMatch(/"styleClassName":\s*""/u);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    Object.defineProperties(dom.window, {
      fetch: { value: globalThis.fetch },
      Headers: { value: globalThis.Headers },
    });
    dom.window.eval(result.files['assets/app.js'] ?? '');
    const page = dom.window.document.querySelector<HTMLElement>('[data-webrad-page-id]');
    expect(page?.style.backgroundColor).toBe('');
    dom.window.close();
  });

  it('returns structured TypeScript diagnostics without writing a broken build', async () => {
    const outputDirectory = await temporaryDirectory();
    const result = await compileProject(executableProject(), {
      outputDirectory,
      userSources: {
        'pages/PageMain.ts': `import { PageMainGenerated } from './PageMain.generated';
export class PageMain extends PageMainGenerated {
  broken: MissingType;
}
`,
      },
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        category: 'error',
        source: 'typescript',
        file: 'pages/PageMain.ts',
      }),
    );
    await expect(fs.stat(path.join(outputDirectory, 'index.html'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('supports a no-write memory build for Preview', async () => {
    const outputDirectory = path.join(await temporaryDirectory(), 'memory-output');
    const result = await compileProjectToMemory(executableProject(), {
      outputDirectory,
      userSources: {},
    });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.previewHtml).toContain('webradPageId');
    await expect(fs.stat(outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects component names that collide with the generated page runtime API', async () => {
    const project = executableProject();
    const invalidProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) =>
          component.id === 'api-client' ? { ...component, name: 'show' } : component,
        ),
      })),
    };

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        source: 'model',
        message: expect.stringContaining('runtime API'),
      }),
    );
  });

  it('rejects unknown or incorrectly typed component properties', async () => {
    let sequence = 0;
    const project = createProject('BrokenProps', () => `broken-${String((sequence += 1))}`);
    const page = project.pages[0]!;
    const root = page.components[0]!;
    const invalidProject = {
      ...project,
      pages: [
        {
          ...page,
          components: [
            {
              ...root,
              props: { ...root.props, visible: 'yes', mysteryProperty: true },
            },
          ],
        },
      ],
    };

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('visible'))).toBe(
      true,
    );
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('mysteryProperty')),
    ).toBe(true);
  });

  it('rejects styles that target unknown or nonvisual registry entries', async () => {
    const project = executableProject();
    const unknown = createComponentStyle('Unknown Style', 'MissingControl', {
      idFactory: () => 'style-unknown',
    });
    const nonvisual = createComponentStyle('API Style', 'WebApiClient', {
      idFactory: () => 'style-api',
    });
    const invalidProject = addComponentStyle(addComponentStyle(project, unknown), nonvisual);

    const result = await compileProjectToMemory(invalidProject, { userSources: {} });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'registry',
          message: expect.stringContaining('unknown component type'),
          path: ['styles', 0, 'componentType'],
        }),
        expect.objectContaining({
          source: 'registry',
          message: expect.stringContaining('nonvisual component type'),
          path: ['styles', 1, 'componentType'],
        }),
      ]),
    );
  });
});
