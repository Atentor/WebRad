import type { BrowserWindow, WebFrameMain } from 'electron';

import { loadProjectFiles } from './project-files';

interface PageTitleSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
}

const browserTitleField = `(() => {
  const label = [...document.querySelectorAll('.wr-object-inspector label')]
    .find((candidate) => candidate.textContent?.trim() === 'Browser title');
  return label instanceof HTMLLabelElement ? label.control : null;
})()`;

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastResult: unknown;
  // An executeJavaScript round trip can span synchronous main-process compilation.
  // Always sample the renderer after that work, even when the timer expired while
  // the event loop was blocked, instead of reporting the pre-build false result.
  for (;;) {
    lastResult = await window.webContents.executeJavaScript(expression, true);
    if (lastResult === true) return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const evidence: unknown = await window.webContents.executeJavaScript(`({
    preview: document.querySelector('.wr-preview-state')?.textContent,
    runDisabled: document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled,
    saveState: document.querySelector('.wr-toolbar-save-state')?.textContent,
    output: document.querySelector('.wr-bottom-panel')?.textContent,
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.textContent),
  })`);
  throw new Error(
    `Page browser title smoke timed out: ${expression}; last result: ${JSON.stringify(lastResult)}; evidence: ${JSON.stringify(evidence)}`,
  );
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(
    window,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      return control instanceof HTMLElement && !control.matches(':disabled');
    })()`,
  );
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    true,
  );
}

async function setBrowserTitle(window: BrowserWindow, value: string): Promise<void> {
  await ready(window, `${browserTitleField} instanceof HTMLInputElement`);
  await window.webContents.executeJavaScript(
    `(() => {
      const input = ${browserTitleField};
      if (!(input instanceof HTMLInputElement) || input.readOnly || input.disabled)
        throw new Error('The Page Browser title Inspector field is not editable.');
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    true,
  );
  await ready(window, `${browserTitleField}?.value === ${JSON.stringify(value)}`);
}

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const result = findFrame(child, url);
    if (result !== undefined) return result;
  }
  return undefined;
}

export async function assertPreviewTitle(
  window: BrowserWindow,
  title: string,
  rootId: string,
): Promise<void> {
  await ready(
    window,
    `(() => {
    const run = document.querySelector('button[aria-label="Build and run (F9)"]');
    return run instanceof HTMLButtonElement && !run.disabled
      && document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'
      && document.querySelector('[role="dialog"]') === null;
  })()`,
  );
  const previousUrl: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
    true,
  );
  const dispatched: unknown = await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  );
  if (dispatched !== false) throw new Error('Page browser title smoke F9 was not handled.');
  await ready(
    window,
    `(() => {
      const url = document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src');
      return typeof url === 'string' && url.length > 0 && url !== ${JSON.stringify(previousUrl)};
    })()`,
  );
  const url: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src')`,
    true,
  );
  if (typeof url !== 'string') throw new Error('Page browser title smoke has no Preview URL.');
  const deadline = Date.now() + 20_000;
  let actualTitle: unknown;
  while (Date.now() < deadline) {
    const frame = findFrame(window.webContents.mainFrame, url);
    if (frame !== undefined) {
      const evidence: unknown = await frame.executeJavaScript(
        `({ title: document.title, mounted: document.querySelector(${JSON.stringify(`[data-webrad-id=${JSON.stringify(rootId)}]`)}) !== null })`,
        true,
      );
      if (typeof evidence === 'object' && evidence !== null) {
        actualTitle = Reflect.get(evidence, 'title');
        if (actualTitle === title && Reflect.get(evidence, 'mounted') === true) {
          const routeEvidence: unknown = await frame.executeJavaScript(
            `(async () => {
              Navigate('index', { replace: true });
              const missing = new URL(location.href);
              missing.pathname = missing.pathname.replace(/index$/, 'missing-smoke-page');
              const directResponse = await fetch(missing, { headers: { Accept: 'text/html' } });
              const directFallback = directResponse.ok &&
                (await directResponse.text()).includes('webrad-route-paths');
              history.pushState(null, '', missing);
              dispatchEvent(new PopStateEvent('popstate'));
              const notFound = location.pathname.endsWith('/404') &&
                document.querySelector('[data-webrad-route-path="/404"]') !== null;
              Navigate(new URL('missing-smoke-page', document.baseURI), { replace: true });
              const internalNotFound = location.pathname.endsWith('/404') &&
                document.querySelector('[data-webrad-route-path="/404"]') !== null;
              Navigate('index', { replace: true });
              return { hash: location.hash, path: location.pathname, notFound, internalNotFound, directFallback };
            })()`,
            true,
          );
          if (
            typeof routeEvidence !== 'object' ||
            routeEvidence === null ||
            Reflect.get(routeEvidence, 'directFallback') !== true ||
            Reflect.get(routeEvidence, 'notFound') !== true ||
            Reflect.get(routeEvidence, 'internalNotFound') !== true ||
            Reflect.get(routeEvidence, 'hash') !== '' ||
            !String(Reflect.get(routeEvidence, 'path')).endsWith('/index')
          )
            throw new Error('F9 History routing did not produce a clean page URL.');
          return;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `Compiled F9 Page title was ${JSON.stringify(actualTitle)}; expected ${JSON.stringify(title)}.`,
  );
}

/** Exercises the actual Page Inspector, Save command and compiled, isolated F9 frame. */
export async function runPageTitleSmoke(
  window: BrowserWindow,
  { projectPath, log }: PageTitleSmokeOptions,
): Promise<void> {
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((candidate) => candidate.name === 'index');
  if (page === undefined) throw new Error('Page title smoke requires the index fixture.');
  const pageId = page.id;
  const rootComponentId = page.rootComponentId;
  const originalSelection: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('[role="treeitem"][data-component-id][aria-selected="true"]')?.getAttribute('data-component-id')`,
    true,
  );
  const rootSelector = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;

  async function openPageInspector(): Promise<void> {
    await click(window, 'button[aria-label="Design"]');
    await click(window, rootSelector);
    await click(window, 'button[role="tab"][aria-label="Properties"]');
    await ready(window, `${browserTitleField} instanceof HTMLInputElement`);
  }

  async function assertSavedTitle(expected: string): Promise<void> {
    await click(window, 'button[aria-label="Save (Ctrl+S)"]');
    await ready(
      window,
      `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
    );
    const saved = await loadProjectFiles(projectPath);
    const root = saved.project.pages
      .find((candidate) => candidate.id === pageId)
      ?.components.find((candidate) => candidate.id === rootComponentId);
    if (root?.props.browserTitle !== expected)
      throw new Error(`Page Browser title ${JSON.stringify(expected)} was not saved.`);
  }

  const customTitle = 'WebRAD browser title <Smoke> & "preview"';
  await openPageInspector();
  await ready(window, `(() => {
    const labels = [...document.querySelectorAll('.wr-object-inspector label')];
    const name = labels.find((label) => label.textContent?.trim() === 'Name')?.control;
    const remove = document.querySelector('button[aria-label="Delete selected project item"]');
    return !labels.some((label) => label.textContent?.trim() === 'Route path')
      && name instanceof HTMLInputElement && name.value === 'index' && name.readOnly
      && remove instanceof HTMLButtonElement && remove.disabled;
  })()`);
  log('renderer mandatory index page passed: fixed name, hidden Route path, deletion disabled');
  await ready(window, `${browserTitleField}?.value === ''`);
  await setBrowserTitle(window, customTitle);
  await assertSavedTitle(customTitle);
  await assertPreviewTitle(window, customTitle, page.rootComponentId);

  await openPageInspector();
  await ready(window, `${browserTitleField}?.value === ${JSON.stringify(customTitle)}`);
  await setBrowserTitle(window, '');
  await assertSavedTitle('');
  await assertPreviewTitle(window, original.project.settings.applicationName, page.rootComponentId);
  await openPageInspector();
  const notFoundPage = original.project.pages.find((candidate) => candidate.name === '404');
  if (notFoundPage === undefined) throw new Error('The project has no mandatory 404 page.');
  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.wr-project-tree .wr-page-row')]
      .find((row) => row.querySelector('span')?.textContent === '404');
    if (!(row instanceof HTMLElement)) throw new Error('404 is missing from Project Explorer.');
    row.click();
  })()`, true);
  await click(window, `[role="treeitem"][data-component-id=${JSON.stringify(notFoundPage.rootComponentId)}]`);
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  await ready(window, `(() => {
    const labels = [...document.querySelectorAll('.wr-object-inspector label')];
    const name = labels.find((label) => label.textContent?.trim() === 'Name')?.control;
    const remove = document.querySelector('button[aria-label="Delete selected project item"]');
    return !labels.some((label) => label.textContent?.trim() === 'Route path')
      && name instanceof HTMLInputElement && name.value === '404' && name.readOnly
      && remove instanceof HTMLButtonElement && remove.disabled;
  })()`);
  await window.webContents.executeJavaScript(`(() => {
    const row = [...document.querySelectorAll('.wr-project-tree .wr-page-row')]
      .find((row) => row.querySelector('span')?.textContent === 'index');
    row?.click();
  })()`, true);
  log('renderer mandatory 404 page passed: protected identity, direct URL fallback, unknown history and Navigate redirected to /404');
  if (typeof originalSelection === 'string')
    await click(
      window,
      `[role="treeitem"][data-component-id=${JSON.stringify(originalSelection)}]`,
    );
  log('renderer History routing F9 passed: clean page URL without hash');
  log(
    `renderer Page browser title Inspector and F9 passed: custom title saved and rendered; cleared title restored ${JSON.stringify(original.project.settings.applicationName)}`,
  );
}
