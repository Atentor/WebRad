import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileProject, type CompileProjectResult } from '@webrad/compiler';
import {
  assembleProject,
  deserializePage,
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
  it('loads the persisted responsive Page project and compiles it as an Electron-free browser app', async () => {
    const manifestPath = path.join(exampleDirectory, 'HelloWebRad.wrproj');
    const manifest = deserializeProjectManifest(await fs.readFile(manifestPath, 'utf8'));
    const descriptor = manifest.pages[0];
    if (descriptor === undefined) throw new Error('HelloWebRad must describe PageMain.');

    const pagePath = path.join(exampleDirectory, ...descriptor.pageFile.split('/'));
    const generatedPath = path.join(exampleDirectory, ...descriptor.generatedFile.split('/'));
    const userCodePath = path.join(exampleDirectory, ...descriptor.codeFile.split('/'));
    const page = deserializePage(await fs.readFile(pagePath, 'utf8'));
    const project = assembleProject(manifest, [page]);
    const generatedCodeBefore = await fs.readFile(generatedPath, 'utf8');
    const userCodeBefore = await fs.readFile(userCodePath, 'utf8');

    expect(manifest).toMatchObject({
      formatVersion: 2,
      id: 'hello-webrad-project-v1',
      entryPage: 'hello-webrad-form-main-v1',
    });
    expect(descriptor).toEqual({
      id: 'hello-webrad-form-main-v1',
      name: 'PageMain',
      pageFile: 'pages/PageMain.wrpage',
      generatedFile: 'pages/PageMain.generated.ts',
      codeFile: 'pages/PageMain.ts',
    });
    expect(project.pages).toEqual([page]);
    expect(page.components.map((component) => component.name)).toEqual([
      'PageMain',
      'LBLNome',
      'EDTNome',
      'BTNMostrar',
    ]);

    const root = page.components.find((component) => component.id === page.rootComponentId);
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
      page.components
        .filter((component) => component.id !== page.rootComponentId)
        .every((component) => component.parentId === page.rootComponentId),
    ).toBe(true);
    expect(page.components.find((component) => component.name === 'EDTNome')?.props).toMatchObject({
      readOnly: false,
      tabIndex: 0,
    });
    expect(
      page.components.find((component) => component.name === 'BTNMostrar')?.events.OnClick,
    ).toBe('BTNMostrarClick');
    expect(generatedCodeBefore).toContain(
      'export abstract class PageMainGenerated extends WebPage',
    );
    expect(generatedCodeBefore).toContain(
      "this.bindGeneratedEvent(this.BTNMostrar, 'OnClick', 'BTNMostrarClick')",
    );
    expect(userCodeBefore).toContain('Message(`Olá ${EDTNome.value}`);');

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
    expect(appJavaScript).toContain('mountPage');
    expect(appCss).toContain('.wr-webpage');
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
