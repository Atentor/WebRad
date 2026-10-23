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
  const result = await compileProjectToMemory(popupSmokeProject(), {
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
