import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  addComponent,
  bindComponentEvent,
  createProject,
  updateForm,
  type FormModel,
  type WebRadProject,
} from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { WEBRAD_COMPONENT_CSS } from '@webrad/runtime/visual';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import { compileProject, compileProjectToMemory } from '../src/index.js';
import { GENERATED_APP_CSS } from '../src/styles.js';

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
  let form: FormModel = project.forms[0] as FormModel;
  const rootId = form.rootComponentId;
  form = addComponent(
    form,
    defaultComponentRegistry.createComponent('WebEdit', {
      id: 'edit-name',
      name: 'EDTNome',
      parentId: rootId,
      x: 24,
      y: 24,
    }),
    rootId,
  );
  form = addComponent(
    form,
    defaultComponentRegistry.createComponent('WebButton', {
      id: 'button-show',
      name: 'BTNMostrar',
      parentId: rootId,
      x: 24,
      y: 72,
    }),
    rootId,
  );
  form = addComponent(
    form,
    defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'api-client',
      name: 'ApiClient1',
      parentId: rootId,
      props: { baseUrl: 'https://api.example.test' },
    }),
    rootId,
  );
  form = bindComponentEvent(form, 'button-show', 'OnClick', 'BTNMostrarClick');
  return updateForm(project, form.id, form);
}

describe('compileProject', () => {
  it('validates, typechecks and writes an ordinary browser application', async () => {
    const outputDirectory = await temporaryDirectory();
    const project = executableProject();
    const originalUserSource = `import { FrmMainGenerated } from './FrmMain.generated';

export class FrmMain extends FrmMainGenerated {
  public async BTNMostrarClick(): Promise<void> {
    Message(\`Olá \${this.EDTNome.value}\`);
  }
}
`;
    const userSources = { 'forms/FrmMain.ts': originalUserSource };

    const result = await compileProject(project, { outputDirectory, userSources });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    expect(result.files['index.html']).toContain('./assets/app.js');
    expect(result.files['assets/app.js']).toContain('BTNMostrarClick');
    expect(result.files['assets/app.js']).toContain('https://api.example.test');
    expect(result.files['assets/app.js']).not.toContain('"id": "api-client"');
    expect(result.files['assets/app.css']).toContain('.wr-webform');
    expect(result.files['assets/app.css']).toContain('.wr-webbutton:hover:not(:disabled)');
    expect(result.previewHtml).toContain('<script>');
    expect(result.previewHtml).toContain('<style>');
    await expect(fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8')).resolves.toContain(
      '<!doctype html>',
    );
    await expect(
      fs.readFile(path.join(outputDirectory, 'assets', 'app.js'), 'utf8'),
    ).resolves.toContain('mountForm');
    await expect(fs.stat(path.join(outputDirectory, 'forms', 'FrmMain.ts'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(userSources['forms/FrmMain.ts']).toBe(originalUserSource);

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
    expect(dom.window.document.querySelector('[data-webrad-form-id]')).not.toBeNull();
    dom.window.close();
  });

  it('embeds the same browser-safe component stylesheet used by the designer projection', () => {
    expect(GENERATED_APP_CSS).toContain(WEBRAD_COMPONENT_CSS);
    expect(GENERATED_APP_CSS).toContain('--wr-control-surface: #f5f7fa');
  });

  it('returns structured TypeScript diagnostics without writing a broken build', async () => {
    const outputDirectory = await temporaryDirectory();
    const result = await compileProject(executableProject(), {
      outputDirectory,
      userSources: {
        'forms/FrmMain.ts': `import { FrmMainGenerated } from './FrmMain.generated';
export class FrmMain extends FrmMainGenerated {
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
        file: 'forms/FrmMain.ts',
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
    expect(result.previewHtml).toContain('webradFormId');
    await expect(fs.stat(outputDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects component names that collide with the generated form runtime API', async () => {
    const project = executableProject();
    const invalidProject = {
      ...project,
      forms: project.forms.map((form) => ({
        ...form,
        components: form.components.map((component) =>
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
    const form = project.forms[0]!;
    const root = form.components[0]!;
    const invalidProject = {
      ...project,
      forms: [
        {
          ...form,
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
});
