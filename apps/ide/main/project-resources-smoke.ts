import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dialog, Menu, type BrowserWindow } from 'electron';
import { loadProjectFiles } from './project-files';

/** Real renderer/Monaco/save/F9 flow using an isolated project and native-picker fixture. */
export async function runProjectResourcesSmoke(
  window: BrowserWindow,
  projectPath: string,
  log: (message: string) => void,
): Promise<void> {
  async function waitFor(expression: string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if ((await window.webContents.executeJavaScript(expression)) === true) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    const evidence: unknown = await window.webContents.executeJavaScript(
      `({ text: document.querySelector('.monaco-editor')?.textContent, focus: document.activeElement?.className, output: document.querySelector('.wr-bottom-panel')?.textContent })`,
    );
    log(`Project resources smoke evidence: ${JSON.stringify(evidence)}`);
    throw new Error(`Project resources smoke timed out: ${expression}`);
  }
  async function click(selector: string): Promise<void> {
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)})?.click()`,
      true,
    );
  }
  const projectMenu = Menu.getApplicationMenu()?.items.find(
    (item) => item.label === 'Project',
  )?.submenu;
  for (const label of ['Add Model', 'Add Unit', 'Import Asset…']) {
    if (!projectMenu?.items.some((item) => item.label === label))
      throw new Error(`Missing Project menu item: ${label}`);
  }
  window.webContents.send('webrad:menu-command', 'file.openProject');
  await waitFor("document.querySelector('.wr-page-surface') !== null");
  await click('[aria-label="Project Explorer"]');
  await waitFor("document.querySelector('[role=tree]') !== null");

  for (const [kind, name, source] of [
    [
      'Model',
      'ResourceModel',
      'export class ResourceModel { public name: string = "Resource Smoke"; }',
    ],
    [
      'Unit',
      'ResourceHelpers',
      'import { ResourceModel } from "../models/ResourceModel"; export function resourceName(): string { return new ResourceModel().name; }',
    ],
  ] as const) {
    window.webContents.send(
      'webrad:menu-command',
      kind === 'Model' ? 'project.addModel' : 'project.addUnit',
    );
    await waitFor("document.querySelector('[role=dialog] input') !== null");
    await window.webContents.executeJavaScript(
      `(() => {
      const input = document.querySelector('[role=dialog] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
      true,
    );
    await click('[role="dialog"] button[type="submit"]');
    await waitFor(
      "document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea') !== null && document.querySelector('[role=dialog]') === null",
    );
    await window.webContents.executeJavaScript(
      "document.querySelector('.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea').focus()",
      true,
    );
    window.webContents.focus();
    window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'A',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    });
    window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: 'A',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    });
    window.webContents.insertText(source);
    await waitFor(
      `document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160), ' ').includes(${JSON.stringify(kind === 'Model' ? 'Resource Smoke' : 'resourceName')}) === true`,
    );
    window.webContents.send('webrad:menu-command', 'file.save');
    const sourcePath = path.join(
      path.dirname(projectPath),
      kind === 'Model' ? 'models' : 'units',
      `${name}.ts`,
    );
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        if ((await fs.readFile(sourcePath, 'utf8')) === source) break;
      } catch {
        /* Save pending. */
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    if ((await fs.readFile(sourcePath, 'utf8')) !== source)
      throw new Error(`Authored ${kind} did not save.`);
  }
  log('renderer project Models and Units passed');

  const fixturePath = path.join(path.dirname(projectPath), 'resource-image.png');
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPa0AAAAASUVORK5CYII=',
    'base64',
  );
  await fs.writeFile(fixturePath, bytes);
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = (async () => ({
    canceled: false,
    filePaths: [fixturePath],
  })) as typeof dialog.showOpenDialog;
  try {
    window.webContents.send('webrad:menu-command', 'project.importAsset');
    await waitFor(
      "(() => { const image = document.querySelector('.wr-asset-preview img'); return image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1; })()",
    );
  } finally {
    dialog.showOpenDialog = originalPicker;
  }
  window.webContents.send('webrad:menu-command', 'file.save');
  await waitFor("document.querySelector('.wr-toolbar')?.textContent?.includes('*') === false");
  const saved = await loadProjectFiles(projectPath);
  if (saved.project.sourceFiles?.length !== 2 || saved.project.assets?.length !== 1)
    throw new Error('Resource manifest did not save.');
  if (
    !(await fs.readFile(path.join(saved.rootPath, 'assets/imported/resource-image.png'))).equals(
      bytes,
    )
  )
    throw new Error('Imported binary content differs.');
  log('renderer project asset import passed');

  await new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve());
    window.webContents.reload();
  });
  await waitFor("document.querySelector('.wr-page-surface') !== null");
  await click('[aria-label="Project Explorer"]');
  await waitFor(
    "document.querySelector('[role=tree]')?.textContent?.includes('ResourceModel.ts') === true && document.querySelector('[role=tree]')?.textContent?.includes('resource-image.png') === true",
  );
  window.webContents.send('webrad:menu-command', 'run.run');
  await waitFor('document.querySelector(\'iframe[title="WebRAD application preview"]\') !== null');
  const previewUrl: unknown = await window.webContents.executeJavaScript(
    "document.querySelector('iframe')?.src",
  );
  if (typeof previewUrl !== 'string') throw new Error('Preview URL unavailable.');
  const response = await fetch(new URL('assets/imported/resource-image.png', previewUrl));
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(bytes))
    throw new Error('F9 Preview asset content differs.');
  log('renderer project resources restore and F9 passed');
}
