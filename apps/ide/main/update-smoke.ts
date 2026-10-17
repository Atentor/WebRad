import type { BrowserWindow } from 'electron';
import { UpdateService } from './update-service';

let smokeService: UpdateService | undefined;
let downloads = 0;
let installations = 0;

/** Explicit CLI-only fixture. Never uses the network or invokes an OS installer. */
export function createUpdateSmokeService(canInstall: () => boolean): UpdateService {
  const target = {
    platform: 'win32',
    arch: 'x64',
    kind: 'squirrel',
    file: 'webrad-999.0.0-full.nupkg',
    size: 1,
    sha256: 'a'.repeat(64),
    signed: false,
  } as const;
  smokeService = new UpdateService({
    currentVersion: '0.1.11',
    canInstall,
    readManifest: async () => ({
      formatVersion: 1,
      version: '999.0.0',
      publishedAt: '2026-10-15T12:00:00.000Z',
      targets: [target],
    }),
    selectBackend: async () => ({
      target,
      backend: {
        mode: 'automatic',
        download: async (_manifest, _target, progress) => {
          downloads++;
          progress(50);
          await new Promise((resolve) => setTimeout(resolve, 300));
        },
        install: async () => {
          installations++;
        },
      },
    }),
  });
  return smokeService;
}

async function waitFor(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Update smoke timed out: ${expression}`);
}

export async function runUpdateSmoke(
  window: BrowserWindow,
  log: (message: string) => void,
): Promise<void> {
  await waitFor(window, "!!document.querySelector('.wr-toolbar') && !!window.webrad?.updates");
  if (await window.webContents.executeJavaScript("!!document.querySelector('.wr-toolbar-update')"))
    throw new Error('Update button appeared before a newer release was confirmed.');
  await window.webContents.executeJavaScript('window.webrad.updates.check()', true);
  await waitFor(
    window,
    "document.querySelector('[data-update-status=available]')?.textContent.trim() === 'Update'",
  );
  if (downloads || installations) throw new Error('Checking updates started an installation.');
  log('renderer update availability without download passed');
  await window.webContents.executeJavaScript(
    "window.webrad.lifecycle.setDirty(true); document.querySelector('[data-update-status=available]').click()",
    true,
  );
  await waitFor(
    window,
    "document.querySelector('[data-update-status=ready]')?.textContent.trim() === 'Update'",
  );
  if (installations !== 0 || downloads !== 1 || smokeService?.getState().status !== 'ready')
    throw new Error('Update bypassed unsaved changes.');
  log('renderer update download and unsaved changes guard passed');
  await window.webContents.executeJavaScript(
    "window.webrad.lifecycle.setDirty(false); document.querySelector('[data-update-status=ready]').click()",
    true,
  );
  await waitFor(
    window,
    "document.querySelector('[role=dialog]')?.textContent.includes('Installing update') === true",
  );
  if (
    Number(installations) !== 1 ||
    downloads !== 1 ||
    smokeService.getState().status !== 'installing'
  )
    throw new Error('Update install action did not reach its backend exactly once.');
  log('renderer update install action and restart feedback passed');
}
