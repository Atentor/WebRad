import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import ts from 'typescript';

import { BrowserWindow, Menu, type KeyboardInputEvent, type WebFrameMain } from 'electron';
import type { DebugEvaluation, DebugStartResponse, DebugState } from '../shared/debugger-contracts';
import { compileProject } from './compiler-service';
import { getDebugPreviewWindow } from './debugger-ipc';
import { loadProjectFiles } from './project-files';
import { projectExplorerRowExpression } from './project-explorer-smoke';
import { stopPreviewSmoke } from './preview-workspace-smoke';
import { capturePresentedSmokePage } from './smoke-capture';
import { trackSmokeRendererHealth } from './smoke-renderer-health';

const unitSource = `import dayjs from 'dayjs';
export function packageDate(): string {
  const value = dayjs('2024-02-03');
  return value.format('YYYY-MM-DD');
}
`;
const pageSource = `import { indexGenerated } from './index.generated';
import { packageDate } from '../units/PackageDates';
export class index extends indexGenerated {
  public constructor(element: HTMLElement) {
    super(element);
    this.element.dataset.packageDate = packageDate();
  }
  public async BTNMostrarClick(): Promise<void> {
    this.element.dataset.packageClicked = packageDate();
  }
}
`;

function canonicalUnitSource(source: string): string {
  const fileName = 'PackageDates.ts';
  const diagnostics =
    ts.transpileModule(source, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).diagnostics ?? [];
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0)
    throw new Error(
      `The authored package Unit has syntax errors: ${errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n')}`,
    );
  return ts
    .createPrinter({ newLine: ts.NewLineKind.LineFeed })
    .printFile(
      ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS),
    );
}

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const found = findFrame(child, url);
    if (found) return found;
  }
  return undefined;
}

/** Installs real registry packages through the UI and exercises the complete compiled frontend. */
export async function runPackagesSmoke(
  window: BrowserWindow,
  projectPath: string,
  log: (message: string) => void,
): Promise<void> {
  const debuggerWasAttached = window.webContents.debugger.isAttached();
  if (!debuggerWasAttached) window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
    enabled: true,
  });
  try {
    const evaluate = <T = unknown>(source: string): Promise<T> =>
      window.webContents.executeJavaScript(source, true) as Promise<T>;
    const capturePresentedPage = (label: string) =>
      capturePresentedSmokePage(window, Date.now() + 10_000, `Packages ${label}`);
    const ready = async (
      expression: string,
      description: string,
      milliseconds = 20_000,
    ): Promise<void> => {
      const deadline = Date.now() + milliseconds;
      for (;;) {
        if ((await evaluate(expression)) === true) return;
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const evidence = await evaluate(
        `(() => {
        const roots = [document];
        for (let index = 0; index < roots.length; index += 1) {
          for (const node of roots[index].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
        }
        let focus = document.activeElement;
        while (focus?.shadowRoot?.activeElement) focus = focus.shadowRoot.activeElement;
        return { dialogs: [...document.querySelectorAll('[role=dialog]')].map(node => node.textContent), problems: document.querySelector('.wr-bottom-panel')?.textContent, editor: document.querySelector('.monaco-editor')?.textContent, preview: document.querySelector('.wr-preview-state')?.textContent, menus: roots.flatMap(root => [...root.querySelectorAll('.monaco-menu, [role=menu]')].map(node => ({text:node.textContent,html:node.outerHTML}))), focus:focus?.outerHTML, cursor:document.querySelector('.monaco-editor')?.getAttribute('data-cursor-position'), focused:document.hasFocus() };
      })()`,
      );
      const screenshot = path.resolve(
        'artifacts',
        'smoke',
        'packages',
        String(process.pid),
        `timeout-${Date.now()}.png`,
      );
      try {
        await fs.mkdir(path.dirname(screenshot), { recursive: true });
        const capture = await capturePresentedPage('timeout');
        await fs.writeFile(screenshot, capture.toPNG());
        log(`renderer Packages timeout screenshot saved: ${screenshot}`);
      } catch (error) {
        log(
          `renderer Packages timeout screenshot unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      throw new Error(`Packages smoke timed out: ${description}; ${JSON.stringify(evidence)}`);
    };
    const click = async (selector: string): Promise<void> => {
      await ready(
        `(() => { const control = document.querySelector(${JSON.stringify(selector)}); return control instanceof HTMLElement && !control.matches(':disabled'); })()`,
        selector,
      );
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    };
    const field = async (selector: string, value: string): Promise<void> => {
      await ready(
        `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLInputElement`,
        selector,
      );
      await evaluate(
        `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); })()`,
      );
      await ready(
        `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
        `value for ${selector}`,
      );
    };
    const sendKey = (
      keyCode: string,
      modifiers: NonNullable<KeyboardInputEvent['modifiers']> = [],
    ): void => {
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    };
    const replaceEditor = async (source: string): Promise<void> => {
      const selector = '.monaco-editor .native-edit-context, .monaco-editor textarea.inputarea';
      await ready(
        `document.querySelector(${JSON.stringify(selector)}) !== null`,
        'the native Monaco input',
      );
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      window.webContents.focus();
      await ready(
        `document.hasFocus() && document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
        'real focused Monaco native input',
      );
      sendKey('A', [process.platform === 'darwin' ? 'meta' : 'control']);
      await ready(
        `Number(document.querySelector('.monaco-editor')?.dataset.selectionLength) > 0`,
        'native Monaco Select All',
      );
      await window.webContents.insertText(source);
      await ready(
        `document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160),' ').includes(${JSON.stringify(source.split('\n').find((line) => line.includes('export ')) ?? source)}) === true`,
        'authored Monaco source',
      );
    };
    const save = async (): Promise<void> => {
      window.webContents.send('webrad:menu-command', 'file.save');
      await ready(
        `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
        'Save completion',
      );
    };
    const openPackages = async (): Promise<void> => {
      window.webContents.send('webrad:menu-command', 'project.packages');
      await ready(
        `document.querySelector('[data-packages-dialog]') !== null`,
        'Project > Packages',
      );
    };
    const operationCompleted = async (): Promise<void> => {
      await ready(
        `document.querySelector('[data-packages-dialog] .wr-packages-operation')?.textContent === 'Package operation completed.' && document.querySelector('[data-packages-dialog] progress') === null`,
        'the real NPM process result',
        40_000,
      );
    };
    const install = async (name: string, version: string): Promise<void> => {
      await field('input[aria-label="Package name"]', name);
      await field('input[aria-label="Package version"]', version);
      await click('[data-packages-dialog] .wr-packages-install button[type="submit"]');
      await operationCompleted();
      await ready(
        `document.querySelector(${JSON.stringify(`[data-package-name="${name}"]`)})?.textContent?.includes(${JSON.stringify(`Installed: ${version}`)}) === true`,
        `installed ${name}@${version}`,
      );
    };

    const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === 'Project')?.submenu;
    if (!menu?.items.some((item) => item.label.replace(/\u2026$/, '') === 'Packages'))
      throw new Error('Missing Project > Packages native menu.');
    await click('button[aria-label="Open project (Ctrl+O)"]');
    await ready(`document.querySelector('.wr-page-surface') !== null`, 'the opened project');
    await openPackages();
    await ready(
      `(() => {
        const dialog = document.querySelector('[data-packages-dialog]');
        const sections = [...dialog.querySelectorAll('.wr-packages-columns > .wr-packages-section')];
        const manual = dialog.querySelector('.wr-packages-manual');
        const empty = dialog.querySelector('[aria-label="Installed packages"] .wr-packages-empty');
        const registry = dialog.querySelector('[aria-label="Search NPM registry"] .wr-packages-empty');
        return sections.length === 2 && manual?.textContent.includes('Install by name')
          && empty?.textContent.includes('No packages installed')
          && registry?.textContent.includes('Find a library')
          && sections.every(section => getComputedStyle(section).borderTopStyle === 'solid'
            && section.getBoundingClientRect().height >= 180);
      })()`,
      'the package manager panels and meaningful empty states',
    );
    log(
      'renderer Packages empty layout passed: framed panels, manual installation and registry guidance',
    );
    await evaluate(
      `window.__webradPackagesProgress = false; window.__webradPackagesObserver = new MutationObserver(() => { if (document.querySelector('[data-packages-dialog] progress')) window.__webradPackagesProgress = true; }); window.__webradPackagesObserver.observe(document.body, {subtree:true,childList:true});`,
    );
    try {
      await field('input[aria-label="Search NPM packages"]', 'dayjs');
      await click('.wr-packages-search button[type="submit"]');
      await ready(
        `document.querySelector('[data-registry-package="dayjs"]') !== null`,
        'official registry search',
      );
      log('renderer Packages registry search passed: official dayjs metadata');
      await install('dayjs', '1.11.13');
      log('renderer Packages dayjs installation passed: real NPM process and installed version');
      if (!(await evaluate<boolean>('window.__webradPackagesProgress')))
        throw new Error('The Packages dialog never rendered operation progress.');
      if (
        !(await evaluate<boolean>(
          `/added|up to date/.test(document.querySelector('[aria-label="Package operation log"]')?.textContent ?? '')`,
        ))
      )
        throw new Error('The real NPM operation stdout was not displayed.');
      await install('@types/estree', '1.0.8');
      log('renderer Packages scoped installation passed: @types/estree@1.0.8');
      const screenshotDirectory = path.resolve(
        'artifacts',
        'smoke',
        'packages',
        String(process.pid),
      );
      await fs.mkdir(screenshotDirectory, { recursive: true });
      const geometry = `(() => {const dialog = document.querySelector('[data-packages-dialog]'); const rect = dialog.getBoundingClientRect(); const body = dialog.querySelector('.wr-packages-content'); return rect.left >= 0 && rect.top >= 0 && rect.width <= 941 && rect.height <= 601 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && body.scrollWidth <= body.clientWidth + 1;})()`;
      await ready(geometry, 'desktop package modal geometry');
      await ready(
        `(() => {
      const content = document.querySelector('.wr-packages-content').getBoundingClientRect();
      const form = document.querySelector('.wr-packages-install').getBoundingClientRect();
      const name = document.querySelector('input[aria-label="Package name"]').getBoundingClientRect();
      const version = document.querySelector('input[aria-label="Package version"]').getBoundingClientRect();
      const submit = document.querySelector('.wr-packages-install button[type="submit"]').getBoundingClientRect();
      const search = document.querySelector('.wr-packages-search input').getBoundingClientRect();
      const searchSubmit = document.querySelector('.wr-packages-search button[type="submit"]').getBoundingClientRect();
      return form.height <= 70 && name.width >= 300 && version.width >= 140
        && name.left >= content.left && Math.abs(name.left-form.left) <= 1
        && Math.abs(name.bottom-version.bottom) <= 2 && Math.abs(name.bottom-submit.bottom) <= 2
        && search.width >= 200 && Math.abs(search.y+search.height/2-searchSubmit.y-searchSubmit.height/2) <= 2;
    })()`,
        'aligned desktop install and search controls',
      );
      await fs.writeFile(
        path.join(screenshotDirectory, 'desktop.png'),
        (await capturePresentedPage('desktop')).toPNG(),
      );
      const bounds = window.getBounds();
      const contentBounds = window.getContentBounds();
      const minimumSize = window.getMinimumSize();
      const wasMaximized = window.isMaximized();
      try {
        if (wasMaximized) window.unmaximize();
        window.setMinimumSize(1, 1);
        for (const [width, height] of [
          [1366, 768],
          [1280, 720],
        ] as const) {
          window.setContentSize(width, height);
          await ready(
            `innerWidth === ${width} && innerHeight === ${height}`,
            `the ${width} by ${height} notebook viewport`,
          );
          await ready(geometry, 'compact notebook package modal geometry');
          await ready(
            `(() => {
              const dialog = document.querySelector('[data-packages-dialog]');
              const header = dialog.querySelector('.wr-modal-header').getBoundingClientRect();
              const footer = dialog.querySelector('.wr-modal-actions').getBoundingClientRect();
              const manual = dialog.querySelector('.wr-packages-manual').getBoundingClientRect();
              const sections = [...dialog.querySelectorAll('.wr-packages-columns > .wr-packages-section')];
              const lists = [...dialog.querySelectorAll('.wr-packages-list')];
              const registry = dialog.querySelector('[aria-label="Search NPM registry"] .wr-packages-list');
              return header.top >= 0 && footer.bottom <= innerHeight + 1
                && manual.top >= header.bottom && manual.bottom < footer.top
                && sections.length === 2
                && Math.abs(sections[0].getBoundingClientRect().top - sections[1].getBoundingClientRect().top) <= 1
                && lists.every(list => list.clientHeight > 0 && getComputedStyle(list).overflowY === 'auto')
                && registry.scrollHeight > registry.clientHeight;
            })()`,
            'reachable notebook controls and independently scrolling package lists',
          );
          await fs.writeFile(
            path.join(screenshotDirectory, `notebook-${width}-${height}.png`),
            (await capturePresentedPage(`notebook ${width}x${height}`)).toPNG(),
          );
        }
        log(
          'renderer Packages notebook layout passed: 1366x768 and 1280x720; bounded dialog, visible actions and list scrolling',
        );
        window.setContentSize(720, 900);
        await ready(
          'innerWidth === 720 && innerHeight === 900',
          'the painted narrow window viewport',
        );
        await ready(geometry, 'narrow package modal geometry');
        await ready(
          `(() => {
            const sections = [...document.querySelectorAll('.wr-packages-columns > .wr-packages-section')];
            const footer = document.querySelector('[data-packages-dialog] > .wr-modal-actions').getBoundingClientRect();
            return sections.length === 2 && sections[1].getBoundingClientRect().top >= sections[0].getBoundingClientRect().bottom
              && footer.bottom <= innerHeight + 1;
          })()`,
          'stacked package panels and reachable narrow-screen footer',
        );
        await fs.writeFile(
          path.join(screenshotDirectory, 'narrow.png'),
          (await capturePresentedPage('narrow')).toPNG(),
        );
      } finally {
        window.setBounds(bounds);
        window.setMinimumSize(minimumSize[0] ?? 1, minimumSize[1] ?? 1);
        if (wasMaximized) window.maximize();
        await ready(
          `innerWidth === ${contentBounds.width} && innerHeight === ${contentBounds.height}`,
          'the restored desktop viewport',
        );
        await evaluate(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
      }
      log(
        `renderer Packages dialog passed: desktop and 720px geometry; screenshots ${screenshotDirectory}`,
      );
    } finally {
      await evaluate(
        'window.__webradPackagesObserver?.disconnect(); delete window.__webradPackagesObserver; delete window.__webradPackagesProgress;',
      );
    }
    await click('button[aria-label="Close packages"]');
    await click('button[aria-label="Project Explorer"]');
    await ready(
      `document.querySelector('[data-project-package="dayjs"]')?.textContent?.includes('1.11.13') === true && document.querySelector('[data-project-package="@types/estree"]') !== null`,
      'direct package versions in Explorer',
    );
    log(
      'renderer Packages install and Explorer passed: official search, dayjs@1.11.13, scoped package, progress and logs',
    );

    window.webContents.send('webrad:menu-command', 'project.addUnit');
    await field('[role="dialog"] input', 'PackageDates');
    await click('[role="dialog"] button[type="submit"]');
    await ready(
      `document.querySelector('.wr-document-tabs [role=tab][aria-selected=true]')?.textContent?.includes('PackageDates.ts') === true`,
      'the new Unit',
    );
    await replaceEditor(unitSource);
    await save();
    const token = await evaluate<{ x: number; y: number }>(
      `(() => { const walker = document.createTreeWalker(document.querySelector('.monaco-editor .view-lines'), NodeFilter.SHOW_TEXT); let node; while (node = walker.nextNode()) { const index = node.textContent.indexOf('format'); if (index < 0) continue; const range = document.createRange(); range.setStart(node,index); range.setEnd(node,index+6); const rect = range.getBoundingClientRect(); if (rect.width > 0) return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}; } throw new Error('Missing visible dayjs.format token'); })()`,
    );
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.webContents.sendInputEvent({ type: 'mouseMove', ...token });
    await ready(
      `[...document.querySelectorAll('.monaco-hover')].some(node => node.getBoundingClientRect().width > 0 && node.textContent?.includes('format') && node.textContent?.includes('string'))`,
      'dayjs signature hover',
    );
    log('renderer Packages Monaco hover passed: actual dayjs format signature and documentation');
    // Put the caret on the actual method before using the editor's native
    // keyboard context menu. A right click while a hover owns the pointer may
    // target its overlay instead of the authored token in a hidden window.
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    await ready(
      `![...document.querySelectorAll('.monaco-hover')].some(node => node.getBoundingClientRect().width > 0 && getComputedStyle(node).visibility !== 'hidden')`,
      'dismissed Monaco mouse hover',
    );
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: 'mouseMove', ...token });
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      button: 'left',
      clickCount: 1,
      ...token,
    });
    window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...token });
    await ready(
      `document.activeElement?.closest('.monaco-editor') !== null && document.querySelector('.monaco-editor')?.getAttribute('data-cursor-position')?.startsWith('Line 4,') === true`,
      'the native caret on dayjs.format',
    );
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    sendKey('Escape');
    sendKey('F10', ['shift']);
    const definitionAction = `(() => {
    const roots = [document];
    for (let index = 0; index < roots.length; index += 1) {
      const action = [...roots[index].querySelectorAll('.monaco-menu [role="menuitem"]')].find(node => node.textContent?.includes('Go to Definition'));
      if (action) return action;
      for (const node of roots[index].querySelectorAll('*')) if (node.shadowRoot) roots.push(node.shadowRoot);
    }
    return null;
  })()`;
    await ready(
      `${definitionAction} instanceof HTMLElement`,
      'native Monaco Go to Definition context menu',
    );
    await ready(
      `(() => {
    const action = ${definitionAction};
    const menu = action?.closest('.monaco-menu');
    const surface = menu?.closest('.monaco-scrollable-element');
    if (!surface) return false;
    const parse = value => (value.match(/[\\d.]+/g) ?? []).map(Number);
    const background = parse(getComputedStyle(surface).backgroundColor);
    const foreground = parse(getComputedStyle(action.querySelector('.action-label') ?? action).color);
    const luminance = color => color.slice(0,3).map(channel => { const value = channel/255; return value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4; }).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
    const light = luminance(foreground), dark = luminance(background);
    const contrast = (Math.max(light,dark)+.05)/(Math.min(light,dark)+.05);
    return background.length >= 3 && (background[3] ?? 1) > 0 && foreground.length >= 3 && (foreground[3] ?? 1) > 0 && contrast >= 4.5;
  })()`,
      'opaque native menu surface and readable Go to Definition action',
    );
    const nativeMenuScreenshot = path.resolve(
      'artifacts',
      'smoke',
      'packages',
      String(process.pid),
      'native-menu.png',
    );
    await fs.writeFile(
      nativeMenuScreenshot,
      (await capturePresentedPage('native Monaco menu')).toPNG(),
    );
    log(
      `renderer Packages native menu passed: themed opaque surface and action contrast >= 4.5; screenshot ${nativeMenuScreenshot}`,
    );
    log(
      'renderer Packages presented screenshots passed: desktop, 1366x768 and 1280x720 notebooks, 720px narrow layout and native Monaco menu; marker-free frames',
    );
    const definitionPoint = await evaluate<{ x: number; y: number }>(`(() => {
      const rect = (${definitionAction}).getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) throw new Error('Go to Definition is not rendered');
      return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};
    })()`);
    // Monaco deliberately arms native menu mouse-up handlers after 100 ms.
    // Preserve that real event-loop guard before issuing a single user click.
    await new Promise((resolve) => setTimeout(resolve, 100));
    window.webContents.sendInputEvent({ type: 'mouseMove', ...definitionPoint });
    window.webContents.sendInputEvent({
      type: 'mouseDown',
      button: 'left',
      clickCount: 1,
      ...definitionPoint,
    });
    window.webContents.sendInputEvent({
      type: 'mouseUp',
      button: 'left',
      clickCount: 1,
      ...definitionPoint,
    });
    await ready(
      `(() => {
    const viewer = document.querySelector('[data-package-definition-dialog]');
    return viewer?.textContent?.includes('Read-only declaration') === true
      && viewer.textContent.includes('dayjs/index.d.ts') && viewer.querySelector('.monaco-editor') !== null;
  })()`,
      'the actual package declaration opened by the TypeScript definition provider',
    );
    await click('button[aria-label="Close package declaration"]');
    await ready(
      `document.querySelector('[data-package-definition-dialog]') === null && document.querySelector('.monaco-editor')?.textContent?.includes('packageDate') === true && document.activeElement?.closest('.monaco-editor') !== null`,
      'return to the authored Unit and its native editor focus',
    );
    await replaceEditor(`import dayjs from 'dayjs';\nexport const npmCompletionProbe = dayjs().`);
    sendKey('Space', ['control']);
    await ready(
      `(() => { const suggest = document.querySelector('.suggest-widget.visible'); return suggest?.textContent?.includes('add') === true && suggest?.textContent?.includes('clone') === true; })()`,
      'native dayjs member completion',
    );
    sendKey('Escape');
    await replaceEditor(`${unitSource}\nexport const invalidPackageDate = dayjs().format(123);`);
    if (!(await evaluate<boolean>(`document.querySelector('#wr-bottom-tab-problems') !== null`)))
      window.webContents.send('webrad:menu-command', 'view.output');
    await click('#wr-bottom-tab-problems');
    await ready(
      `document.querySelector('.wr-problem-list')?.textContent?.includes('2345') === true && document.querySelector('.wr-problem-list')?.textContent?.includes('number') === true`,
      'package TypeScript argument diagnostics',
    );
    await replaceEditor(unitSource);
    await save();
    await ready(
      `!document.querySelector('.wr-problem-list')?.textContent?.includes('2345')`,
      'cleared package argument diagnostic',
    );
    log(
      'renderer Packages Monaco passed: native member completion, signature hover, read-only declaration navigation and strict invalid-argument diagnostics',
    );

    await click('button[aria-label="Project Explorer"]');
    await ready(
      `${projectExplorerRowExpression({ name: 'index' })} instanceof HTMLElement`,
      'index Page in Explorer',
    );
    await evaluate(`${projectExplorerRowExpression({ name: 'index' })}.click()`);
    await click('button[aria-label="Code"]');
    await replaceEditor(pageSource);
    await save();
    const saved = await loadProjectFiles(projectPath);
    const actualUnitSource = saved.userSources['units/PackageDates.ts'] ?? '';
    const canonicalActualUnit = canonicalUnitSource(actualUnitSource);
    const canonicalExpectedUnit = canonicalUnitSource(unitSource);
    const requestedDayjsVersion = saved.project.packages?.dependencies.dayjs;
    if (canonicalActualUnit !== canonicalExpectedUnit || requestedDayjsVersion !== '1.11.13')
      throw new Error(
        `The package manifest and authored Unit were not saved: ${JSON.stringify({ requestedDayjsVersion, expectedDayjsVersion: '1.11.13', canonicalActualUnit, canonicalExpectedUnit, actualUnitSource })}`,
      );
    await click('button[aria-label="Build and run (F9)"]');
    await ready(
      `document.querySelector('iframe[title="WebRAD application preview"]')?.src?.startsWith('http') === true`,
      'F9 Preview',
    );
    const previewUrl = await evaluate<string>(
      `document.querySelector('iframe[title="WebRAD application preview"]').src`,
    );
    const deadline = Date.now() + 20_000;
    let previewPassed = false;
    while (Date.now() < deadline) {
      const frame = findFrame(window.webContents.mainFrame, previewUrl);
      if (
        frame &&
        (await frame.executeJavaScript(
          `document.querySelector('[data-package-date]')?.getAttribute('data-package-date') === '2024-02-03' && typeof require === 'undefined' && typeof process === 'undefined'`,
        )) === true
      ) {
        previewPassed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!previewPassed)
      throw new Error('F9 did not execute the dayjs Unit in the browser runtime.');
    await stopPreviewSmoke(window);
    log(
      'renderer Packages Preview passed: installed package imported by Unit and Page, browser result 2024-02-03',
    );

    const ideWasVisibleBeforeDebug = window.isVisible();
    const started = await evaluate<DebugStartResponse>(
      `window.webrad.debugger.start(${JSON.stringify({ rootPath: saved.rootPath, project: saved.project, userSources: saved.userSources, breakpoints: [{ path: 'units/PackageDates.ts', line: 4, enabled: true, condition: "document.body.dataset.npmDebugTrigger === 'yes'" }], pauseOnExceptions: 'uncaught' })})`,
    );
    if (!started.build.success)
      throw new Error(`Package Debug build failed: ${JSON.stringify(started.build.diagnostics)}`);
    try {
      const preview = getDebugPreviewWindow(window.webContents.id);
      if (!preview) throw new Error('Package Debug Preview window missing.');
      const button = saved.project.pages
        .flatMap((page) => page.components)
        .find((component) => component.name === 'BTNMostrar');
      if (!button) throw new Error('Package Debug fixture button missing.');
      const debugReady = Date.now() + 20_000;
      while (
        Date.now() < debugReady &&
        !(await preview.webContents.executeJavaScript(
          `document.querySelector('[data-package-date]')?.getAttribute('data-package-date') === '2024-02-03'`,
        ))
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      await preview.webContents.executeJavaScript(
        `document.body.dataset.npmDebugTrigger = 'yes'; setTimeout(() => document.querySelector(${JSON.stringify(`[data-webrad-id="${button.id}"]`)}).click(),0); true`,
      );
      const debugDeadline = Date.now() + 20_000;
      let state: DebugState = started.state;
      while (Date.now() < debugDeadline) {
        state = await evaluate<DebugState>('window.webrad.debugger.getState()');
        if (state.status === 'paused' || state.status === 'error') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const frame = state.frames[0];
      if (
        state.status !== 'paused' ||
        !frame ||
        frame.location?.path !== 'units/PackageDates.ts' ||
        frame.location.line !== 4 ||
        !state.breakpoints[0]?.verified
      )
        throw new Error(`Package Unit breakpoint was not preserved: ${JSON.stringify(state)}`);
      const inspected = await evaluate<DebugEvaluation>(
        `window.webrad.debugger.evaluate(${JSON.stringify({ sessionId: state.sessionId, frameId: frame.id, expression: "value.format('YYYY-MM-DD') === '2024-02-03'" })})`,
      );
      if (
        inspected.error ||
        inspected.value.type !== 'boolean' ||
        inspected.value.description !== 'true'
      )
        throw new Error(`Package Debug value incorrect: ${JSON.stringify(inspected)}`);
      await evaluate(`window.webrad.debugger.command('resume')`);
    } finally {
      try {
        await evaluate(`window.webrad.debugger.command('stop')`);
      } finally {
        // The real debugger presents the IDE on a pause. Restore the hidden
        // smoke window afterwards before testing the normal Preview lifecycle.
        if (!ideWasVisibleBeforeDebug && !window.isDestroyed()) {
          window.hide();
          log('renderer Packages Debug presentation restored: originally hidden IDE');
        }
      }
    }
    log(
      'renderer Packages Debug passed: authored Unit breakpoint, source map and dayjs value inspection',
    );

    const deployed = await compileProject(
      {
        ...saved.project,
        settings: {
          ...saved.project.settings,
          pwa: { ...saved.project.settings.pwa, enabled: true },
        },
      },
      {
        packageRoot: saved.rootPath,
        userSources: saved.userSources,
        outputDirectory: path.join(saved.rootPath, 'npm-smoke-export'),
        target: 'deploy',
        write: false,
      },
    );
    if (!deployed.success || !deployed.files['manifest.webmanifest'])
      throw new Error(
        `Package Web/PWA compilation failed: ${JSON.stringify(deployed.diagnostics)}`,
      );
    const server = createServer((request, response) => {
      const name =
        new URL(request.url ?? '/', 'http://localhost').pathname.slice(1) || 'index.html';
      const content = deployed.files[name] ?? deployed.binaryFiles?.[name];
      if (content === undefined) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'application/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : name.endsWith('.html')
              ? 'text/html'
              : 'application/octet-stream',
      );
      response.end(content);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const browser = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        offscreen: true,
        backgroundThrottling: false,
      },
    });
    const assertBrowserHealthy = trackSmokeRendererHealth(browser.webContents);
    try {
      const address = server.address();
      if (address === null || typeof address === 'string')
        throw new Error('Package Web/PWA static server address missing.');
      await browser.loadURL(`http://127.0.0.1:${address.port}/`);
      const browserResult: unknown = await browser.webContents.executeJavaScript(
        `({value:document.querySelector('[data-package-date]')?.getAttribute('data-package-date'),node:typeof require !== 'undefined' || typeof process !== 'undefined'})`,
      );
      assertBrowserHealthy();
      if (
        typeof browserResult !== 'object' ||
        browserResult === null ||
        Reflect.get(browserResult, 'value') !== '2024-02-03' ||
        Reflect.get(browserResult, 'node') !== false
      )
        throw new Error(
          `Static browser package execution failed: ${JSON.stringify(browserResult)}`,
        );
      if ((await fetch(`http://127.0.0.1:${address.port}/node_modules/dayjs`)).status !== 404)
        throw new Error('Web/PWA hosting unexpectedly exposed node_modules.');
    } finally {
      browser.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    log(
      'renderer Packages Web PWA passed: compiled static frontend executed with no Node APIs or hosted node_modules',
    );

    await save();
    await new Promise<void>((resolve) => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.reload();
    });
    await ready(`document.querySelector('.wr-page-surface') !== null`, 'reopened project');
    const reopened = await loadProjectFiles(projectPath);
    if (
      reopened.project.packages?.lockfile !== saved.project.packages?.lockfile ||
      reopened.project.packages?.dependencies.dayjs !== '1.11.13'
    )
      throw new Error('Package state did not survive closing and reopening.');
    const modulesPath = path.join(reopened.rootPath, 'node_modules');
    if (path.resolve(reopened.rootPath) !== path.resolve(path.dirname(projectPath)))
      throw new Error('Refusing to remove node_modules outside the isolated smoke project.');
    await fs.rm(modulesPath, { recursive: true, force: true });
    await openPackages();
    await ready(
      `document.querySelector('[data-package-name="dayjs"]')?.textContent?.includes('Missing') === true`,
      'missing dependency state',
    );
    await evaluate(
      `[...document.querySelectorAll('[data-packages-dialog] button')].find(button => button.textContent === 'Restore dependencies').click()`,
    );
    await operationCompleted();
    if (
      JSON.parse(await fs.readFile(path.join(modulesPath, 'dayjs/package.json'), 'utf8'))
        .version !== '1.11.13'
    )
      throw new Error('npm ci did not restore the locked package version.');
    await click('button[aria-label="Update dayjs"]');
    await operationCompleted();
    const updated = await loadProjectFiles(projectPath);
    const actualVersion = (
      JSON.parse(await fs.readFile(path.join(modulesPath, 'dayjs/package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
    if (updated.project.packages?.dependencies.dayjs !== actualVersion)
      throw new Error('Package update did not persist its actual installed version.');
    await click('button[aria-label="Remove @types/estree"]');
    await operationCompleted();
    await click('button[aria-label="Remove dayjs"]');
    await operationCompleted();
    await click('button[aria-label="Close packages"]');
    await click('button[aria-label="Build and run (F9)"]');
    await ready(
      `document.querySelector('.wr-preview-state')?.textContent?.includes('Preview build failed') === true && document.querySelector('.wr-preview-diagnostics')?.textContent?.includes('dayjs') === true`,
      'clear unresolved package import after removal',
    );
    await stopPreviewSmoke(window);
    log(
      'renderer Packages lifecycle passed: save reopen, missing dependency detection, locked restore, actual update and removal diagnostics',
    );
  } finally {
    if (
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      window.webContents.debugger.isAttached()
    ) {
      try {
        await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
          enabled: false,
        });
      } finally {
        if (!debuggerWasAttached) window.webContents.debugger.detach();
      }
    }
  }
}
