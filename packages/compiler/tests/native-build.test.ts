import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  assembleProject,
  deserializePage,
  deserializeProjectManifest,
  updateProjectSettings,
} from '@webrad/project-model';
import { generateTauriProject } from '@webrad/native-build';
import { compileProjectToMemory } from '../src/index.js';

describe('native application compiler integration', () => {
  it('compiles the real Hello WebRAD source into local Tauri assets and executes its typed event', async () => {
    const example = path.resolve('examples/hello-webrad');
    const manifest = deserializeProjectManifest(
      await fs.readFile(path.join(example, 'HelloWebRad.wrproj'), 'utf8'),
    );
    const pages = await Promise.all(
      manifest.pages.map(async (page) =>
        deserializePage(await fs.readFile(path.join(example, page.pageFile), 'utf8')),
      ),
    );
    const original = assembleProject(manifest, pages);
    const project = updateProjectSettings(original, {
      pwa: { ...original.settings.pwa, enabled: true },
      build: { ...original.settings.build, minify: false },
      environmentVariables: [
        {
          name: 'MODE',
          values: { development: 'development-only-value', production: 'native-production-value' },
        },
      ],
    });
    const userSources = Object.fromEntries(
      await Promise.all(
        manifest.pages.map(
          async (page) =>
            [page.codeFile, await fs.readFile(path.join(example, page.codeFile), 'utf8')] as const,
        ),
      ),
    );
    const before = { ...userSources };
    const result = await compileProjectToMemory(project, { target: 'native', userSources });
    expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
    expect(result.previewHtml).toBeUndefined();
    expect(result.files['index.html']).toContain('./assets/app.js');
    expect(result.files['index.html']).not.toMatch(/pwa-register|webmanifest/u);
    expect(Object.keys(result.files)).not.toContain('service-worker.js');
    expect(result.files['assets/app.js']).not.toMatch(
      /node:|require\(["']electron|development-only-value/u,
    );
    expect(userSources).toEqual(before);

    const workspace = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-native-hello-')),
    );
    const dom = new JSDOM('<html><body class="wr-project-surface"></body></html>', {
      url: 'http://tauri.localhost/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    try {
      const settings = {
        ...project.settings.nativeApplication,
        build: {
          ...project.settings.nativeApplication.build,
          platform: 'windows' as const,
          bundleFormat: 'exe' as const,
        },
      };
      await generateTauriProject({
        settings,
        directory: workspace,
        files: result.files,
        binaryFiles: result.binaryFiles,
      });
      const config = JSON.parse(
        await fs.readFile(path.join(workspace, 'src-tauri/tauri.conf.json'), 'utf8'),
      ) as { build: { frontendDist: string } };
      const frontend = path.resolve(workspace, 'src-tauri', config.build.frontendDist);
      expect(await fs.readFile(path.join(frontend, 'assets/app.js'), 'utf8')).toBe(
        result.files['assets/app.js'],
      );
      const messages: string[] = [];
      dom.window.alert = (message: unknown): void => {
        messages.push(String(message));
      };
      dom.window.eval(result.files['assets/app.js'] ?? '');
      const edit = dom.window.document.querySelector('input');
      const button = dom.window.document.querySelector('button');
      expect(edit).not.toBeNull();
      expect(button).not.toBeNull();
      if (edit === null || button === null) throw new Error('Hello WebRAD did not mount.');
      edit.value = 'Tauri';
      edit.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      button.click();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(messages).toEqual(['Olá Tauri']);
    } finally {
      dom.window.close();
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });
});
