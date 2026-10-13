import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dialog, Menu, nativeImage, type BrowserWindow } from 'electron';
import { DEPLOY_MANIFEST } from './deploy-files';
import { loadProjectFiles } from './project-files';

interface DeploySmokeEvidence {
  readonly busyDialog: boolean;
  readonly fileProgress: readonly { readonly completed: number; readonly total: number }[];
  readonly notifications: readonly {
    readonly phase: string;
    readonly completedFiles: number;
    readonly totalFiles: number;
  }[];
  readonly finalCompleted: number;
  readonly finalTotal: number;
}

/** Real settings controls, native directory capability, save, Deploy IPC, and file progress. */
export async function runDeploySmoke(
  window: BrowserWindow,
  projectPath: string,
  log: (message: string) => void,
  screenshotPath?: string,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  const destination = path.join(path.dirname(projectPath), 'deploy');
  async function waitFor(expression: string): Promise<void> {
    const waitDeadline = Math.min(deadline, Date.now() + 20_000);
    while (Date.now() < waitDeadline) {
      if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    const evidence: unknown = await window.webContents.executeJavaScript(
      `({ dialogs: [...document.querySelectorAll('[role=dialog]')].map((element) => element.textContent), output: document.querySelector('.wr-bottom-panel')?.textContent })`,
    );
    log(`Deploy smoke timeout evidence: ${JSON.stringify(evidence)}`);
    throw new Error(`Deploy smoke timed out: ${expression}`);
  }
  async function click(selector: string): Promise<void> {
    await waitFor(
      `(() => { const control = document.querySelector(${JSON.stringify(selector)}); return control instanceof HTMLElement && !control.matches(':disabled'); })()`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
      true,
    );
  }
  async function setField(selector: string, value: string): Promise<void> {
    await window.webContents.executeJavaScript(
      `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) throw new Error('Missing Deploy settings control');
      const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`,
      true,
    );
  }
  let previousScreenshot: Buffer | undefined;
  async function screenshot(suffix: string): Promise<void> {
    if (screenshotPath === undefined) return;
    if (!path.isAbsolute(screenshotPath))
      throw new Error('Deploy smoke screenshot must be an absolute path.');
    const extension = path.extname(screenshotPath) || '.png';
    const target =
      suffix === ''
        ? screenshotPath
        : `${screenshotPath.slice(0, screenshotPath.length - path.extname(screenshotPath).length)}-${suffix}${extension}`;
    await window.webContents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
    if (suffix === '') await new Promise<void>((resolve) => setTimeout(resolve, 250));
    let bytes: Buffer | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const capture = await window.webContents.capturePage();
      if (capture.isEmpty()) throw new Error('Deploy smoke screenshot was empty.');
      bytes = capture.toPNG();
      if (!previousScreenshot?.equals(bytes)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    if (!bytes || previousScreenshot?.equals(bytes))
      throw new Error('Deploy screenshot did not refresh after the visible panel changed.');
    previousScreenshot = bytes;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    log(`renderer Deploy screenshot saved: ${target}`);
  }

  const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Project')?.submenu;
  if (!menu?.items.some((item) => item.label === 'Deploy'))
    throw new Error('Missing Project / Deploy menu item.');
  window.webContents.send('webrad:menu-command', 'file.openProject');
  await waitFor("document.querySelector('.wr-page-surface') !== null");
  window.webContents.send('webrad:menu-command', 'project.deploy');
  await waitFor(
    "document.querySelector('#project-settings-panel-build input[type=text]') !== null",
  );
  await fs.mkdir(destination);
  const originalPicker = dialog.showOpenDialog;
  dialog.showOpenDialog = (async () => ({
    canceled: false,
    filePaths: [destination],
  })) as typeof dialog.showOpenDialog;
  try {
    await click('.wr-project-settings-directory button');
    await waitFor(
      `document.querySelector('.wr-project-settings-directory input')?.value === ${JSON.stringify(destination)}`,
    );
  } finally {
    dialog.showOpenDialog = originalPicker;
  }
  await screenshot('build');
  log('renderer Deploy menu and directory settings passed');

  await click('#project-settings-tab-pwa');
  await click('#project-settings-panel-pwa input[type=checkbox]');
  await setField('#project-settings-panel-pwa input[type=text]', 'Deploy Smoke');
  await setField('#project-settings-panel-pwa select', 'standalone');
  await setField('#project-settings-panel-pwa input[type=color]', '#123456');
  await screenshot('pwa');
  await click('.wr-project-settings-actions button.primary');
  await waitFor("document.querySelector('.wr-project-settings-dialog') === null");
  window.webContents.send('webrad:menu-command', 'file.save');
  let saved = await loadProjectFiles(projectPath);
  while (
    Date.now() < deadline &&
    (!saved.project.settings.pwa.enabled ||
      saved.project.settings.build.deployDirectory !== destination)
  ) {
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    saved = await loadProjectFiles(projectPath);
  }
  if (
    !saved.project.settings.pwa.enabled ||
    saved.project.settings.pwa.shortName !== 'Deploy Smoke' ||
    saved.project.settings.pwa.themeColor !== '#123456' ||
    saved.project.settings.build.deployDirectory !== destination
  ) {
    throw new Error('Deploy and PWA settings did not persist through the real Save command.');
  }
  log('renderer PWA project settings passed');

  await window.webContents.executeJavaScript(
    `(() => {
    const evidence = { busyDialog: false, fileProgress: [], notifications: [] };
    const observe = () => {
      const dialog = document.querySelector('.wr-deploy-dialog');
      const progress = dialog?.querySelector('progress');
      if (dialog?.querySelector('button:disabled') && progress instanceof HTMLProgressElement) {
        evidence.busyDialog = true;
        if (progress.hasAttribute('value') && progress.max > 1 && progress.value > 0 && progress.value < progress.max) evidence.fileProgress.push({ completed: progress.value, total: progress.max });
      }
    };
    const observer = new MutationObserver(observe);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    const unsubscribe = window.webrad.deploy.subscribe((progress) => { evidence.notifications.push(progress); observe(); });
    window.__webradDeploySmoke = { evidence, stop: () => { observer.disconnect(); unsubscribe(); } };
  })()`,
    true,
  );
  try {
    window.webContents.send('webrad:menu-command', 'project.deploy');
    await waitFor(
      "document.querySelector('.wr-deploy-dialog [role=status]')?.textContent === 'Your application is ready for hosting.'",
    );
    const evidence = (await window.webContents.executeJavaScript(`(() => {
      const progress = document.querySelector('.wr-deploy-dialog progress');
      return { ...window.__webradDeploySmoke.evidence, finalCompleted: progress?.value, finalTotal: progress?.max };
    })()`)) as DeploySmokeEvidence;
    log(`renderer Deploy progress evidence: ${JSON.stringify(evidence)}`);
    if (
      !evidence.busyDialog ||
      evidence.fileProgress.length === 0 ||
      !evidence.notifications.some(
        (item) =>
          item.phase === 'writing' &&
          item.completedFiles > 0 &&
          item.completedFiles < item.totalFiles,
      ) ||
      evidence.finalTotal <= 0 ||
      evidence.finalCompleted !== evidence.finalTotal
    ) {
      throw new Error(
        'Deploy modal did not display actual intermediate file progress and a complete count.',
      );
    }
    log(
      `renderer Deploy file progress passed: ${String(evidence.finalCompleted)} of ${String(evidence.finalTotal)} files`,
    );
    const entries = await fs.readdir(destination, { withFileTypes: true });
    if (!entries.some((entry) => entry.name === 'assets' && entry.isDirectory()))
      throw new Error('Deploy assets folder missing.');
    if (entries.some((entry) => ['pages', 'reusable', 'models', 'units'].includes(entry.name)))
      throw new Error('Deploy retained split application folders.');
    if (
      await fs.stat(path.join(destination, 'assets/chunks')).then(
        () => true,
        () => false,
      )
    )
      throw new Error('Deploy retained split JavaScript chunks.');
    const html = await fs.readFile(path.join(destination, 'index.html'), 'utf8');
    if (html.includes('type="module"') || !html.includes('<script src="./assets/app.js"></script>'))
      throw new Error('Deploy did not use the classic Preview bundle.');
    if (!html.includes('manifest.webmanifest') || !html.includes('assets/pwa-register.js'))
      throw new Error('Hosted HTML does not load PWA output.');
    const manifest = JSON.parse(
      await fs.readFile(path.join(destination, 'manifest.webmanifest'), 'utf8'),
    ) as Record<string, unknown>;
    if (
      manifest.short_name !== 'Deploy Smoke' ||
      manifest.theme_color !== '#123456' ||
      manifest.start_url !== './' ||
      manifest.scope !== './'
    )
      throw new Error('PWA manifest differs from saved settings.');
    for (const size of [192, 512]) {
      const icon = nativeImage.createFromPath(
        path.join(destination, 'assets', 'icons', `pwa-${String(size)}.png`),
      );
      if (icon.isEmpty() || icon.getSize().width !== size || icon.getSize().height !== size)
        throw new Error(`PWA ${String(size)}px icon did not render.`);
    }
    const worker = await fs.readFile(path.join(destination, 'service-worker.js'), 'utf8');
    if (!worker.includes('const offline = true') || !worker.includes('index.html'))
      throw new Error('Offline PWA shell missing.');
    const allEntries = await fs.readdir(destination, { recursive: true, withFileTypes: true });
    if (
      allEntries.some(
        (entry) =>
          entry.isFile() &&
          (entry.name.endsWith('.ts') ||
            entry.name.endsWith('.wrpage') ||
            entry.name.endsWith('.wrproj') ||
            entry.name.endsWith('.map')),
      )
    )
      throw new Error('Deploy leaked project authoring files or disabled source maps.');
    const fileCount = allEntries.filter(
      (entry) => entry.isFile() && entry.name !== DEPLOY_MANIFEST,
    ).length;
    if (fileCount !== evidence.finalTotal)
      throw new Error('Deploy file count does not match generated artifacts.');
    log(
      `renderer Deploy hosting output passed: ${String(fileCount)} browser files with PWA manifest, PNG icons, and offline worker`,
    );
    await screenshot('');
    await click('.wr-deploy-dialog .wr-modal-actions button');
    await waitFor("document.querySelector('.wr-deploy-dialog') === null");
  } finally {
    await window.webContents.executeJavaScript(
      'window.__webradDeploySmoke?.stop(); delete window.__webradDeploySmoke;',
    );
  }
}
