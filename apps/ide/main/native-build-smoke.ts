import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dialog, Menu, type BrowserWindow, type NativeImage } from 'electron';
import { loadProjectFiles } from './project-files';

interface NativeBuildSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
  readonly screenshotPath?: string;
}

/** Real settings, preload, directory grant, compiler, Tauri generation and CI export; no toolchain mocks. */
export async function runNativeBuildSmoke(
  window: BrowserWindow,
  { projectPath, log, screenshotPath }: NativeBuildSmokeOptions,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  async function waitFor(expression: string): Promise<void> {
    const stepDeadline = Math.min(deadline, Date.now() + 15_000);
    while (Date.now() < stepDeadline) {
      if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    const evidence: unknown = await window.webContents.executeJavaScript(
      `({ dialogs: [...document.querySelectorAll('[role=dialog]')].map((element) => element.textContent), output: document.querySelector('.wr-bottom-panel')?.textContent })`,
    );
    log(`Native Build smoke timeout evidence: ${JSON.stringify(evidence)}`);
    throw new Error(`Native Build smoke timed out: ${expression}`);
  }
  async function click(selector: string): Promise<void> {
    await waitFor(`(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      return control instanceof HTMLElement && !control.matches(':disabled');
    })()`);
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
      true,
    );
  }
  async function clickButton(label: string, scope = '.wr-build-application-dialog'): Promise<void> {
    const expression = `(() => {
      const button = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})]
        .find((element) => element.textContent.trim() === ${JSON.stringify(label)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click(); return true;
    })()`;
    await waitFor(expression);
  }
  function fieldExpression(scope: string, label: string): string {
    return `(() => {
      const label = [...document.querySelectorAll(${JSON.stringify(`${scope} label`)})]
        .find((element) => element.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)});
      return label?.querySelector('input, select');
    })()`;
  }
  async function setField(scope: string, label: string, value: string): Promise<void> {
    const updated: unknown = await window.webContents.executeJavaScript(
      `(() => {
      const control = ${fieldExpression(scope, label)};
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
      const prototype = control instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      return true;
    })()`,
      true,
    );
    if (updated !== true) throw new Error(`Native Build smoke could not edit ${label}.`);
    await waitFor(`${fieldExpression(scope, label)}?.value === ${JSON.stringify(value)}`);
  }

  async function capturePresentedPage(): Promise<NativeImage> {
    // A DOM frame can finish before Chromium presents it, and invalidate() may
    // deliver a previously queued frame or no new frame for an unchanged page.
    // A temporary pixel provides a real paint fence: first observe its frame,
    // then remove it and deliver only the next frame with the pixel absent.
    const markerId = 'webrad-smoke-paint-marker';
    const removeMarker = `document.getElementById('${markerId}')?.remove()`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let stopFrames: (() => void) | undefined;
    try {
      return await new Promise<NativeImage>((resolve, reject) => {
        let markerPresented = false;
        timeout = setTimeout(
          () => reject(new Error('Native Build screenshot did not receive its paint fence.')),
          Math.max(1, Math.min(15_000, deadline - Date.now())),
        );
        const onFrame = (frame: NativeImage) => {
          if (frame.isEmpty()) {
            reject(new Error('Native Build screenshot was empty.'));
            return;
          }
          const pixel = frame.crop({ x: 0, y: 0, width: 1, height: 1 }).toBitmap();
          // Pure green has the same byte order in both RGBA and BGRA bitmaps.
          const hasMarker =
            pixel[0] === 0 && pixel[1] === 255 && pixel[2] === 0 && pixel[3] === 255;
          if (!markerPresented) {
            if (hasMarker) {
              markerPresented = true;
              void window.webContents.executeJavaScript(removeMarker).catch(reject);
            }
            return;
          }
          if (!hasMarker) resolve(frame);
        };
        const onPaint = (
          _event: Electron.Event,
          _dirty: Electron.Rectangle,
          frame: NativeImage,
        ): void => onFrame(frame);
        stopFrames = window.webContents.isOffscreen()
          ? () => window.webContents.off('paint', onPaint)
          : () => window.webContents.endFrameSubscription();
        if (window.webContents.isOffscreen()) window.webContents.on('paint', onPaint);
        else window.webContents.beginFrameSubscription(false, onFrame);
        void window.webContents
          .executeJavaScript(
            `(() => {
              const marker = document.createElement('div');
              marker.id = '${markerId}';
              marker.style.cssText = 'all: initial; position: fixed; left: 0; top: 0; width: 2px; height: 2px; background: #00ff00; z-index: 2147483647; pointer-events: none;';
              document.body.append(marker);
            })()`,
          )
          .catch(reject);
      });
    } finally {
      clearTimeout(timeout);
      stopFrames?.();
      await window.webContents.executeJavaScript(removeMarker).catch(() => undefined);
    }
  }
  const original = await loadProjectFiles(projectPath);
  const matrix = [
    { platform: 'web', formats: ['web'], host: null },
    { platform: 'windows', formats: ['nsis', 'msi', 'exe'], host: 'win32' },
    { platform: 'linux', formats: ['deb', 'rpm', 'appimage'], host: 'linux' },
    { platform: 'macos', formats: ['app', 'dmg'], host: 'darwin' },
    { platform: 'android', formats: ['apk', 'aab'], host: null },
    { platform: 'ios', formats: ['ios-app', 'ipa'], host: 'darwin' },
  ];
  const nativeScope = '#project-settings-panel-native';
  await click('button[aria-label="Project Settings"]');
  await setField('#project-settings-panel-general', 'Application name', '');
  await click('#project-settings-tab-native');
  await click('.wr-project-settings-actions button.primary');
  await waitFor(`(() => {
    const invalid = document.querySelector('[data-settings-field="applicationName"] input');
    const inlineError = document.getElementById(invalid?.getAttribute('aria-describedby'));
    return document.querySelector('#project-settings-tab-general')?.getAttribute('aria-selected') === 'true'
      && invalid === document.activeElement && invalid.getAttribute('aria-invalid') === 'true'
      && inlineError?.textContent.includes('Enter an application name');
  })()`);
  await setField('#project-settings-panel-general', 'Application name', original.project.settings.applicationName);
  await window.webContents.executeJavaScript(`(() => {
    const tab = document.querySelector('#project-settings-tab-general');
    tab.focus(); tab.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true, cancelable:true}));
  })()`, true);
  await waitFor(`document.activeElement?.id === 'project-settings-tab-environment'
    && document.querySelector('#project-settings-tab-environment')?.getAttribute('aria-selected') === 'true'
    && document.querySelectorAll('.wr-project-settings-dialog [role=tab][tabindex="0"]').length === 1`);
  for (const [key, section] of [['End', 'pwa'], ['Home', 'general']] as const) {
    await window.webContents.executeJavaScript(
      `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(key)}, bubbles:true, cancelable:true}))`,
      true,
    );
    await waitFor(`document.activeElement?.id === 'project-settings-tab-${section}'
      && document.querySelector('#project-settings-tab-${section}')?.getAttribute('aria-selected') === 'true'`);
  }
  await click('#project-settings-tab-native');
  const originalWidth = original.project.settings.nativeApplication.desktop.width;
  await setField(nativeScope, 'Initial Width', String(originalWidth + 1));
  await window.webContents.executeJavaScript(
    `document.querySelector('.wr-project-settings-dialog').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}))`,
    true,
  );
  await waitFor(`document.querySelector('[role=alertdialog]') !== null
    && document.activeElement?.textContent.trim() === 'Keep editing'
    && document.querySelector('.wr-project-settings-dialog')?.inert === true`);
  await window.webContents.executeJavaScript(
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}))`,
    true,
  );
  await waitFor(`document.querySelector('[role=alertdialog]') === null
    && ${fieldExpression(nativeScope, 'Initial Width')}?.value === ${JSON.stringify(String(originalWidth + 1))}`);
  await click('button[aria-label="Close project settings"]');
  await clickButton('Discard changes', '.wr-settings-discard-confirmation');
  await waitFor("document.querySelector('.wr-project-settings-dialog') === null");
  await click('button[aria-label="Project Settings"]');
  await click('#project-settings-tab-native');
  await waitFor(`${fieldExpression(nativeScope, 'Initial Width')}?.value === ${JSON.stringify(String(originalWidth))}`);
  log('renderer Project Settings draft protection and validation navigation passed');
  if (screenshotPath !== undefined) {
    if (!path.isAbsolute(screenshotPath))
      throw new Error('Native settings screenshots require an absolute output path.');
    const output = path.join(path.dirname(screenshotPath), 'native-settings');
    await fs.mkdir(output, { recursive: true });
    const bounds = window.getBounds();
    const minimum = window.getMinimumSize();
    const theme: unknown = await window.webContents.executeJavaScript(
      'document.documentElement.dataset.theme',
    );
    const layouts: unknown[] = [];
    try {
      window.setMinimumSize(600, 600);
      for (const width of [1000, 740]) {
        window.setContentSize(width, 760);
        for (const selectedTheme of ['dark', 'light']) {
          const current: unknown = await window.webContents.executeJavaScript(
            'document.documentElement.dataset.theme',
          );
          if (current !== selectedTheme) {
            await clickButton('Cancel', '.wr-project-settings-dialog');
            window.webContents.send('webrad:menu-command', 'view.toggleTheme');
            await waitFor(`document.documentElement.dataset.theme === '${selectedTheme}'`);
            await click('button[aria-label="Project Settings"]');
            await click('#project-settings-tab-native');
          }
          await waitFor(`innerWidth === ${String(width)}`);
          for (const [index, section] of [
            [0, 'identity'],
            [1, 'build'],
            [3, 'mobile'],
            [5, 'signing'],
          ] as const) {
            await window.webContents.executeJavaScript(
              `document.querySelectorAll('${nativeScope} fieldset')[${String(index)}].scrollIntoView({block:'start'})`,
            );
            const layout = (await window.webContents.executeJavaScript(`(() => {
              const panel = document.querySelector('${nativeScope}');
              const dialog = document.querySelector('.wr-project-settings-dialog');
              const footer = dialog.querySelector('.wr-project-settings-actions').getBoundingClientRect();
              const cards = [...panel.querySelectorAll('fieldset, .wr-native-image-card')];
              return {width:innerWidth, theme:document.documentElement.dataset.theme, section:'${section}',
                overflow: panel.scrollWidth > panel.clientWidth + 1 || dialog.scrollWidth > dialog.clientWidth + 1 || cards.some(card => card.scrollWidth > card.clientWidth + 1),
                footerVisible: footer.bottom <= innerHeight && footer.top >= 0,
                imageCards: panel.querySelectorAll('.wr-native-image-card').length};
            })()`)) as { overflow: boolean; footerVisible: boolean; imageCards: number };
            if (layout.overflow || !layout.footerVisible || layout.imageCards !== 2)
              throw new Error('Native settings layout failed: ' + JSON.stringify(layout));
            layouts.push(layout);
            await fs.writeFile(
              path.join(output, selectedTheme + '-' + String(width) + '-' + section + '.png'),
              (await capturePresentedPage()).toPNG(),
            );
          }
        }
      }
      await fs.writeFile(path.join(output, 'layout.json'), JSON.stringify(layouts, null, 2) + '\n');
      log('renderer Native Application visual layout passed: ' + JSON.stringify(layouts));
    } finally {
      await clickButton('Cancel', '.wr-project-settings-dialog');
      const current: unknown = await window.webContents.executeJavaScript(
        'document.documentElement.dataset.theme',
      );
      if (current !== theme) {
        window.webContents.send('webrad:menu-command', 'view.toggleTheme');
        await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`);
      }
      window.setMinimumSize(minimum[0] ?? 1000, minimum[1] ?? 680);
      window.setBounds(bounds);
      await click('button[aria-label="Project Settings"]');
      await click('#project-settings-tab-native');
    }
  }

  await setField(nativeScope, 'Application Identifier', 'com.webrad.smokeapplication');
  await setField(nativeScope, 'Initial Width', '1100');
  for (const target of matrix) {
    await setField(nativeScope, 'Target Platform', target.platform);
    const formats: unknown = await window.webContents.executeJavaScript(
      `[...(${fieldExpression(nativeScope, 'Bundle Format')}).options].map(option => option.value)`,
    );
    if (JSON.stringify(formats) !== JSON.stringify(target.formats))
      throw new Error('Project Settings bundle formats mismatch for ' + target.platform);
  }
  await setField(nativeScope, 'Target Platform', 'windows');
  await setField(nativeScope, 'Target Architecture', 'x64');
  await setField(nativeScope, 'Bundle Format', 'exe');
  const destination = path.join(path.dirname(projectPath), 'native-smoke-output');
  await fs.mkdir(destination);
  const originalPicker = dialog.showOpenDialog;
  try {
    const previousDirectory: unknown = await window.webContents.executeJavaScript(
      `${fieldExpression(nativeScope, 'Output Directory')}?.value`,
    );
    dialog.showOpenDialog = (async () => ({
      canceled: true,
      filePaths: [],
    })) as typeof dialog.showOpenDialog;
    await click(`${nativeScope} .wr-project-settings-directory button`);
    await waitFor(
      `document.querySelector('${nativeScope} .wr-project-settings-directory button')?.disabled === false`,
    );
    const afterCancellation: unknown = await window.webContents.executeJavaScript(
      `${fieldExpression(nativeScope, 'Output Directory')}?.value`,
    );
    if (previousDirectory !== afterCancellation)
      throw new Error('Cancelling the Native Build folder picker changed its destination.');
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [destination],
    })) as typeof dialog.showOpenDialog;
    await click(`${nativeScope} .wr-project-settings-directory button`);
    await waitFor(
      `${fieldExpression(nativeScope, 'Output Directory')}?.value === ${JSON.stringify(destination)}`,
    );
  } finally {
    dialog.showOpenDialog = originalPicker;
  }
  // Exercise the native compiler target with a project that also has PWA enabled.
  await click('#project-settings-tab-pwa');
  if (!original.project.settings.pwa.enabled) {
    await click('#project-settings-panel-pwa input[type=checkbox]');
  }
  await click('.wr-project-settings-actions button.primary');
  await waitFor("document.querySelector('.wr-project-settings-dialog') === null");
  window.webContents.send('webrad:menu-command', 'file.save');
  await waitFor("document.querySelector('.wr-toolbar-save-state')?.textContent.trim() === 'Saved'");
  const saved = await loadProjectFiles(projectPath);
  if (
    saved.project.settings.nativeApplication.identifier !== 'com.webrad.smokeapplication' ||
    saved.project.settings.nativeApplication.desktop.width !== 1100 ||
    !saved.project.settings.pwa.enabled
  )
    throw new Error('Native Application settings did not persist through the real Save command.');
  log('renderer Native Application settings passed');

  const projectMenu = Menu.getApplicationMenu()?.items.find(
    (item) => item.label === 'Project',
  )?.submenu;
  if (!projectMenu?.items.some((item) => item.label === 'Build Application\u2026')) {
    throw new Error('Missing Project / Build Application menu item.');
  }
  if (projectMenu.items.some((item) => item.label === 'Build' || item.label === 'Deploy')) {
    throw new Error('Project menu still exposes redundant Build or Deploy items.');
  }
  log('renderer Project build menu contract passed');
  projectMenu.items.find((item) => item.label === 'Build Application\u2026')?.click();
  const buildScope = '.wr-build-application-dialog';
  await waitFor(`document.querySelector('${buildScope} h2')?.textContent === 'Build Application'`);
  await waitFor(
    `document.querySelectorAll('${buildScope} input').length === 0 && document.querySelectorAll('${buildScope} select').length === 1`,
  );
  log('renderer Native Build settings separation passed');
  const requirementsScope = `${buildScope} [aria-label="Build Requirements"]`;
  await setField(buildScope, 'Target Platform', 'web');
  await waitFor(`(() => {
    const rows = [...document.querySelectorAll('${requirementsScope} [data-status]')];
    return rows.length > 0 && rows.every((row) => row.dataset.status === 'available')
      && rows.some((row) => row.textContent.includes('WebRAD'));
  })()`);

  for (const target of matrix) {
    await setField(buildScope, 'Target Platform', target.platform);
    const evidence = (await window.webContents.executeJavaScript(`(() => {
 const buttons = [...document.querySelectorAll('${buildScope} .wr-modal-actions button')];
 return { settingsHidden: document.querySelectorAll('${buildScope} input').length === 0 && document.querySelectorAll('${buildScope} select').length === 1,
 buildDisabled: buttons.find(button => button.textContent.trim() === 'Build')?.disabled,
 exportDisabled: buttons.find(button => button.textContent.trim() === 'Export for GitHub Actions')?.disabled };
 })()`)) as { settingsHidden: boolean; buildDisabled: boolean; exportDisabled: boolean };
    if (
      !evidence.settingsHidden ||
      evidence.buildDisabled !== (target.host !== null && target.host !== process.platform) ||
      evidence.exportDisabled !== (target.platform === 'web')
    )
      throw new Error(
        `Native Build host/options mismatch for ${target.platform}: ${JSON.stringify(evidence)}`,
      );
  }
  log(
    `renderer Native Build platform options passed: ${process.platform}; web, windows, linux, macos, android, ios`,
  );

  // CI generation must work without Rust, Java, Xcode or any native build process.
  await setField(buildScope, 'Target Platform', 'windows');

  await waitFor(`(() => {
    const rows = [...document.querySelectorAll('${requirementsScope} [data-status]')];
    return rows.length > 1 && rows.every((row) => ['available', 'missing', 'unsupported'].includes(row.dataset.status));
  })()`);
  await clickButton('Check again', requirementsScope);
  await waitFor(`(() => {
    const button = [...document.querySelectorAll('${requirementsScope} button')]
      .find((element) => element.textContent.trim() === 'Check again');
    return button instanceof HTMLButtonElement && !button.disabled
      && document.querySelectorAll('${requirementsScope} [data-status]').length > 1;
  })()`);
  const requirementEvidence: unknown = await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('${requirementsScope} [data-status]')]
      .map((row) => ({ status: row.dataset.status, text: row.textContent.trim() }))`);
  log(
    `renderer Native Build requirements checklist passed: ${JSON.stringify(requirementEvidence)}`,
  );
  if (screenshotPath !== undefined) {
    if (!path.isAbsolute(screenshotPath))
      throw new Error('Native Build screenshots require an absolute output path.');
    const originalBounds = window.getBounds();
    const originalMinimum = window.getMinimumSize();
    const outputDirectory = path.dirname(screenshotPath);
    await fs.mkdir(outputDirectory, { recursive: true });
    const layouts: unknown[] = [];

    async function selectScreenshotTheme(theme: string): Promise<void> {
      const currentTheme: unknown = await window.webContents.executeJavaScript(
        'document.documentElement.dataset.theme',
      );
      if (currentTheme === theme) return;
      // Theme menu commands are intentionally guarded while this modal is open.
      await clickButton('Close');
      await waitFor(`document.querySelector('${buildScope}') === null`);
      window.webContents.send('webrad:menu-command', 'view.toggleTheme');
      await waitFor(`document.documentElement.dataset.theme === '${theme}'`);
      await click('button[aria-label="Build Application"]');
      await setField(buildScope, 'Target Platform', 'windows');

      await waitFor(`(() => {
        const button = [...document.querySelectorAll('${requirementsScope} button')]
          .find((element) => element.textContent.trim() === 'Check again');
        return button instanceof HTMLButtonElement && !button.disabled
          && document.querySelectorAll('${requirementsScope} [data-status]').length > 1;
      })()`);
    }
    try {
      // Exercise wrapping below the IDE's ordinary minimum without changing the product window.
      window.setMinimumSize(600, 600);
      for (const width of [1000, 740]) {
        window.setContentSize(width, 760);
        for (const theme of ['dark', 'light']) {
          await selectScreenshotTheme(theme);
          await waitFor(
            `document.documentElement.dataset.theme === '${theme}' && window.innerWidth === ${String(width)}`,
          );
          await window.webContents.executeJavaScript(
            `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
          );
          const layout = (await window.webContents.executeJavaScript(`(() => {
            const dialog = document.querySelector('${buildScope}');
            const content = dialog.querySelector('.wr-build-application-content');
            const footer = dialog.querySelector('.wr-modal-actions');
            const bounds = dialog.getBoundingClientRect();
            const footerBounds = footer.getBoundingClientRect();
            return { width: innerWidth, height: innerHeight, theme: document.documentElement.dataset.theme,
              dialogWidth: bounds.width, dialogHeight: bounds.height,
              horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1 || content.scrollWidth > content.clientWidth + 1,
              footerVisible: footerBounds.bottom <= innerHeight && footerBounds.top >= 0,
              requirements: document.querySelectorAll('${requirementsScope} [data-status]').length };
          })()`)) as { horizontalOverflow: boolean; footerVisible: boolean };
          if (layout.horizontalOverflow || !layout.footerVisible)
            throw new Error(`Native Build responsive layout failed: ${JSON.stringify(layout)}`);
          layouts.push(layout);
          const capture = await capturePresentedPage();
          await fs.writeFile(
            path.join(outputDirectory, `${theme}-${String(width)}.png`),
            capture.toPNG(),
          );
          await window.webContents.executeJavaScript(
            `document.querySelector('${buildScope} .wr-build-application-content').scrollTop = 100000`,
          );
          await window.webContents.executeJavaScript(
            `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
          );
          const lowerCapture = await capturePresentedPage();
          await fs.writeFile(
            path.join(outputDirectory, `${theme}-${String(width)}-status.png`),
            lowerCapture.toPNG(),
          );
          await window.webContents.executeJavaScript(
            `document.querySelector('${buildScope} .wr-build-application-content').scrollTop = 0`,
          );
        }
      }
      await selectScreenshotTheme('dark');
      window.setContentSize(1000, 760);
      const incompatibleTarget = process.platform === 'win32' ? 'linux' : 'windows';
      await setField(buildScope, 'Target Platform', incompatibleTarget);
      await waitFor(`(() => {
        const requirements = document.querySelector('${requirementsScope}');
        return innerWidth === 1000 && requirements?.getAttribute('aria-busy') === 'false'
          && requirements.querySelector('[data-status=unsupported] details') !== null;
      })()`);
      await click(`${requirementsScope} [data-status=unsupported] details summary`);
      await waitFor(
        `document.querySelector('${requirementsScope} [data-status=unsupported] details')?.open === true`,
      );
      const incompatibleCapture = await capturePresentedPage();
      await fs.writeFile(
        path.join(outputDirectory, 'dark-incompatible-host.png'),
        incompatibleCapture.toPNG(),
      );
      log(`renderer Native Build incompatible host screenshot passed: ${incompatibleTarget}`);
      await setField(buildScope, 'Target Platform', 'windows');

      await fs.writeFile(
        path.join(outputDirectory, 'layout.json'),
        `${JSON.stringify(layouts, null, 2)}\n`,
      );
      log(`renderer Native Build responsive screenshots passed: ${JSON.stringify(layouts)}`);
    } finally {
      await selectScreenshotTheme('dark');
      window.setMinimumSize(originalMinimum[0] ?? 1000, originalMinimum[1] ?? 680);
      window.setBounds(originalBounds);
    }
  }

  await clickButton('Export for GitHub Actions');
  await waitFor(
    `document.querySelector('${buildScope} [role=status]')?.textContent === 'CI project exported'`,
  );
  const artifactPath: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('${buildScope} .wr-build-application-artifacts code')?.textContent`,
  );
  if (typeof artifactPath !== 'string' || !artifactPath.startsWith(`${destination}${path.sep}`)) {
    throw new Error(`CI export did not expose its real isolated output: ${String(artifactPath)}`);
  }
  await setField(buildScope, 'Target Platform', 'linux');
  await waitFor(`(() => {
    const status = document.querySelector('${buildScope} [aria-label="Build Status"]');
    return status?.dataset.buildPlatform === 'windows' && status.dataset.buildResultCurrent === 'false'
      && status.querySelector('h3')?.textContent === 'Previous Build Result'
      && status.querySelector('.wr-build-result-target')?.textContent.includes('Windows')
      && document.querySelector('${buildScope} .wr-build-footer-target')?.textContent.includes('Linux')
      && document.querySelector('${buildScope} .wr-build-application-artifacts code')?.textContent === ${JSON.stringify(artifactPath)};
  })()`);
  await setField(buildScope, 'Target Platform', 'windows');
  await waitFor(`document.querySelector('${buildScope} [aria-label="Build Status"]')?.dataset.buildResultCurrent === 'true'`);
  log('renderer Native Build result target attribution passed');
  const html = await fs.readFile(path.join(artifactPath, 'frontend', 'index.html'), 'utf8');
  const script = await fs.readFile(path.join(artifactPath, 'frontend', 'assets', 'app.js'), 'utf8');
  const config = JSON.parse(
    await fs.readFile(path.join(artifactPath, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  ) as {
    identifier?: string;
    build?: { frontendDist?: string };
    app?: { withGlobalTauri?: boolean; security?: { csp?: string } };
  };
  const capability = JSON.parse(
    await fs.readFile(
      path.join(artifactPath, 'src-tauri', 'capabilities', 'main-window.json'),
      'utf8',
    ),
  ) as { permissions?: unknown[] };
  const workflow = await fs.readFile(
    path.join(artifactPath, '.github', 'workflows', 'native-application.yml'),
    'utf8',
  );
  if (
    !html.includes('./assets/app.js') ||
    script.length < 1000 ||
    config.identifier !== 'com.webrad.smokeapplication' ||
    config.build?.frontendDist !== '../frontend' ||
    config.app?.withGlobalTauri !== false ||
    !config.app.security?.csp?.includes("default-src 'self'") ||
    !Array.isArray(capability.permissions) ||
    capability.permissions.length !== 0 ||
    html.includes('pwa-register.js') ||
    html.includes('manifest.webmanifest') ||
    workflow.includes('Atentor/WebRad') ||
    workflow.includes('contents: write') ||
    !workflow.includes('actions/upload-artifact@') ||
    !workflow.includes('if-no-files-found: error')
  )
    throw new Error(
      'CI export did not retain the real compiler frontend and minimum-permission Tauri project.',
    );
  for (const filename of ['service-worker.js', 'manifest.webmanifest', 'assets/pwa-register.js']) {
    if (
      await fs.stat(path.join(artifactPath, 'frontend', filename)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return false;
        },
      )
    )
      throw new Error(`Native frontend retained the PWA-only file ${filename}.`);
  }
  await fs.stat(path.join(artifactPath, 'src-tauri', 'Cargo.toml'));
  await fs.stat(path.join(artifactPath, 'app-icon.png'));
  log(`renderer Native Build CI export passed: ${artifactPath}`);
  await clickButton('Close');
  await waitFor(`document.querySelector('${buildScope}') === null`);
  // Preserve the isolated export, then restore the fixture's portable build preferences.
  // Later credential checks must not mistake a temporary output path for a session token.
  await click('button[aria-label="Project Settings"]');
  await click('#project-settings-tab-native');
  await setField(
    nativeScope,
    'Target Platform',
    original.project.settings.nativeApplication.build.platform,
  );
  await setField(
    nativeScope,
    'Target Architecture',
    original.project.settings.nativeApplication.build.architecture,
  );
  await setField(
    nativeScope,
    'Bundle Format',
    original.project.settings.nativeApplication.build.bundleFormat,
  );
  await setField(
    nativeScope,
    'Output Directory',
    original.project.settings.nativeApplication.build.outputDirectory,
  );
  if (!original.project.settings.pwa.enabled) {
    await click('#project-settings-tab-pwa');
    await click('#project-settings-panel-pwa input[type=checkbox]');
  }
  await click('.wr-project-settings-actions button.primary');
  await waitFor("document.querySelector('.wr-project-settings-dialog') === null");
  window.webContents.send('webrad:menu-command', 'file.save');
  await waitFor("document.querySelector('.wr-toolbar-save-state')?.textContent.trim() === 'Saved'");
}
