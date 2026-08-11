import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileProject, type CompileProjectResult } from '@webrad/compiler';
import {
  assembleProject,
  deserializeForm,
  deserializeProjectManifest,
} from '@webrad/project-model';
import { afterEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';

const exampleDirectory = fileURLToPath(new URL('../examples/hello-webrad/', import.meta.url));
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-hello-example-'));
  temporaryDirectories.push(directory);
  return directory;
}

function outputFile(result: CompileProjectResult, fileName: string): string {
  const contents = result.files[fileName];
  if (contents === undefined) throw new Error(`Compiler did not emit ${fileName}.`);
  return contents;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('examples/hello-webrad', () => {
  it('loads the persisted v1 project and compiles it as an Electron-free browser app', async () => {
    const manifestPath = path.join(exampleDirectory, 'HelloWebRad.wrproj');
    const manifest = deserializeProjectManifest(await fs.readFile(manifestPath, 'utf8'));
    const descriptor = manifest.forms[0];
    if (descriptor === undefined) throw new Error('HelloWebRad must describe FrmMain.');

    const formPath = path.join(exampleDirectory, ...descriptor.formFile.split('/'));
    const generatedPath = path.join(exampleDirectory, ...descriptor.generatedFile.split('/'));
    const userCodePath = path.join(exampleDirectory, ...descriptor.codeFile.split('/'));
    const form = deserializeForm(await fs.readFile(formPath, 'utf8'));
    const project = assembleProject(manifest, [form]);
    const generatedCodeBefore = await fs.readFile(generatedPath, 'utf8');
    const userCodeBefore = await fs.readFile(userCodePath, 'utf8');

    expect(manifest).toMatchObject({
      formatVersion: 1,
      id: 'hello-webrad-project-v1',
      entryForm: 'hello-webrad-form-main-v1',
    });
    expect(descriptor).toEqual({
      id: 'hello-webrad-form-main-v1',
      name: 'FrmMain',
      formFile: 'forms/FrmMain.wrform',
      generatedFile: 'forms/FrmMain.generated.ts',
      codeFile: 'forms/FrmMain.ts',
    });
    expect(project.forms).toEqual([form]);
    expect(form.components.map((component) => component.name)).toEqual([
      'FrmMain',
      'LBLNome',
      'EDTNome',
      'BTNMostrar',
    ]);

    const root = form.components.find((component) => component.id === form.rootComponentId);
    expect(root).toMatchObject({
      id: 'hello-webrad-component-form-main-v1',
      parentId: null,
      children: [
        'hello-webrad-component-label-name-v1',
        'hello-webrad-component-edit-name-v1',
        'hello-webrad-component-button-show-v1',
      ],
    });
    expect(
      form.components
        .filter((component) => component.id !== form.rootComponentId)
        .every((component) => component.parentId === form.rootComponentId),
    ).toBe(true);
    expect(form.components.find((component) => component.name === 'EDTNome')?.props).toMatchObject({
      readOnly: false,
      tabIndex: 0,
    });
    expect(
      form.components.find((component) => component.name === 'BTNMostrar')?.events.OnClick,
    ).toBe('BTNMostrarClick');
    expect(generatedCodeBefore).toContain('export abstract class FrmMainGenerated extends WebForm');
    expect(generatedCodeBefore).toContain(
      "this.bindGeneratedEvent(this.BTNMostrar, 'OnClick', 'BTNMostrarClick')",
    );
    expect(userCodeBefore).toContain('Message(`Olá ${this.EDTNome.value}`);');

    const outputDirectory = await createTemporaryDirectory();
    const userSources = { [descriptor.codeFile]: userCodeBefore };
    const result = await compileProject(project, {
      outputDirectory,
      userSources,
    });

    expect(result.success, JSON.stringify(result.diagnostics, null, 2)).toBe(true);
    const indexHtml = outputFile(result, 'index.html');
    const appJavaScript = outputFile(result, 'assets/app.js');
    const appCss = outputFile(result, 'assets/app.css');
    if (result.previewHtml === undefined) throw new Error('Compiler did not produce previewHtml.');

    expect(indexHtml).toContain('./assets/app.js');
    expect(indexHtml).toContain('./assets/app.css');
    expect(appJavaScript).toContain('BTNMostrarClick');
    expect(appJavaScript).toContain('mountForm');
    expect(appCss).toContain('.wr-webform');
    expect(result.previewHtml).toContain('<script>');
    expect(result.previewHtml).toContain('<style>');
    for (const browserArtifact of [indexHtml, appJavaScript, appCss, result.previewHtml]) {
      expect(browserArtifact).not.toMatch(/\belectron\b/i);
    }

    await expect(fs.readFile(path.join(outputDirectory, 'index.html'), 'utf8')).resolves.toBe(
      indexHtml,
    );
    await expect(fs.readFile(path.join(outputDirectory, 'assets', 'app.js'), 'utf8')).resolves.toBe(
      appJavaScript,
    );
    await expect(
      fs.readFile(path.join(outputDirectory, 'assets', 'app.css'), 'utf8'),
    ).resolves.toBe(appCss);

    expect(userSources[descriptor.codeFile]).toBe(userCodeBefore);
    await expect(fs.readFile(userCodePath, 'utf8')).resolves.toBe(userCodeBefore);
    await expect(fs.readFile(generatedPath, 'utf8')).resolves.toBe(generatedCodeBefore);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
      url: 'https://preview.webrad.test/',
    });
    const alert = vi.fn();
    dom.window.alert = alert;
    dom.window.eval(appJavaScript);
    const edit = dom.window.document.querySelector<HTMLInputElement>('input');
    const button = dom.window.document.querySelector<HTMLButtonElement>('button');
    if (!edit || !button) throw new Error('The compiled example did not mount its real controls.');
    edit.value = 'Ada';
    button.click();
    expect(alert).toHaveBeenCalledWith('Olá Ada');
    dom.window.close();
  });
});
