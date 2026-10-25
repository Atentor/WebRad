import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { compileProjectToMemory } from '@webrad/compiler';
import { popupLayoutEvidence, popupSmokeProject, popupSmokeSources } from './popup-smoke-fixture';
import { publishPreviewHtml, revokePreview } from './preview-server';
import { trackSmokeRendererHealth } from './smoke-renderer-health';

export async function runPopupLayoutSmoke(
  log: (message: string) => void,
  screenshotPath?: string,
): Promise<void> {
  const project = popupSmokeProject();
  const result = await compileProjectToMemory(project, {
    userSources: popupSmokeSources,
  });
  if (!result.success || result.previewHtml === undefined)
    throw new Error(`Popup compilation failed: ${JSON.stringify(result.diagnostics)}`);
  const ownerId = -8;
  const browser = new BrowserWindow({
    show: false,
    width: 363,
    height: 500,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const assertHealthy = trackSmokeRendererHealth(browser.webContents);
  try {
    await browser.loadURL(await publishPreviewHtml(ownerId, result.previewHtml));
    await browser.webContents.executeJavaScript(
      `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    );
    let expectedOpens = 0;
    for (const width of [363, 768, 320]) {
      expectedOpens += 1;
      browser.setContentSize(width, 500);
      const evidence: unknown = await browser.webContents.executeJavaScript(
        `(async () => {
        const dialog = document.querySelector('dialog');
        if (dialog.open) await new Promise(resolve => {
          dialog.addEventListener('close', resolve, { once: true });
          dialog.close();
        });
        document.body.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return ${popupLayoutEvidence};
      })()`,
        true,
      );
      const buttons: unknown =
        evidence && typeof evidence === 'object' ? Reflect.get(evidence, 'buttons') : undefined;
      if (
        !Array.isArray(buttons) ||
        buttons.length !== 2 ||
        buttons.some(
          (button: unknown) =>
            typeof button !== 'object' || button === null || Reflect.get(button, 'width') !== 96,
        ) ||
        Reflect.get(evidence as object, 'overflow') !== false ||
        Reflect.get(evidence as object, 'barePageOpens') !== String(expectedOpens)
      ) {
        throw new Error(`Popup layout failed at ${String(width)}px: ${JSON.stringify(evidence)}`);
      }
    }
    if (screenshotPath) {
      const target = path.join(path.dirname(screenshotPath), 'popup-layout.png');
      await fs.writeFile(target, (await browser.webContents.capturePage()).toPNG());
    }
    const themeEvidence: unknown = await browser.webContents.executeJavaScript(
      `(async () => {
      const root = document.querySelector('.wr-webpage');
      const popup = document.querySelector('dialog');
      const opens = root.dataset.barePageOpens;
      if (root.dataset.themeAtCreate !== 'light') throw new Error('Theme was not initialized before OnCreate');
      const change = async key => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(resolve));
      };
      await change('F6');
      if (document.documentElement.dataset.webradTheme !== 'dark' || root.dataset.themeMode !== 'dark' || getComputedStyle(root).color !== 'rgb(241, 245, 249)') throw new Error('Dark runtime theme failed');
      const dark = getComputedStyle(popup).backgroundImage;
      if (!dark.includes('30, 41, 59')) throw new Error('Open Popup did not follow the dark theme: ' + dark);
      if (document.querySelector('.wr-webpage') !== root || document.querySelector('dialog') !== popup || !popup.open || root.dataset.barePageOpens !== opens) throw new Error('Theme replaced mounted components or their state');
      await change('F7');
      if (document.documentElement.dataset.webradTheme !== 'light' || root.dataset.themeResolved !== 'light') throw new Error('Light runtime theme failed');
      await change('F8');
      const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (document.documentElement.dataset.webradThemeMode !== 'system' || document.documentElement.dataset.webradTheme !== system) throw new Error('System runtime theme failed');
      await change('F6');
      if (localStorage.getItem(${JSON.stringify(`webrad:${project.id}:theme`)}) !== 'dark') throw new Error('Theme choice was not persisted');
      return { dark, system, retainedState: true };
    })()`,
      true,
    );
    if (screenshotPath)
      await fs.writeFile(
        path.join(path.dirname(screenshotPath), 'application-theme-dark.png'),
        (await browser.webContents.capturePage()).toPNG(),
      );
    await browser.loadURL(browser.webContents.getURL());
    const remembered: unknown = await browser.webContents.executeJavaScript(
      `(() => {
      const root = document.querySelector('.wr-webpage');
      if (root?.dataset.themeAtCreate !== 'dark') throw new Error('Remembered theme was not applied before OnCreate');
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true }));
      return document.documentElement.dataset.webradTheme === 'light' && localStorage.getItem(${JSON.stringify(`webrad:${project.id}:theme`)}) === null;
    })()`,
      true,
    );
    if (remembered !== true) throw new Error('Theme reset did not restore the project default.');
    log(
      'renderer application themes runtime passed: Light / Dark / System / typed change event / open Popup and page state retained / remembered choice before OnCreate / reset; ' +
        JSON.stringify(themeEvidence),
    );
    assertHealthy();
    log('renderer Popup responsive layout passed: 363, 768, 320px; open/reopen; buttons 96px');
    log(
      'renderer bare page members passed: private field, getter, method and arrow; compiled Preview',
    );
  } finally {
    browser.destroy();
    revokePreview(ownerId);
  }
}
