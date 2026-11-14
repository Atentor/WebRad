import { confirmInspectorDrafts } from './smoke-inspector-drafts';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { stopPreviewSmoke } from './preview-workspace-smoke';

import { loadProjectFiles } from './project-files';
import { projectExplorerRowExpression } from './project-explorer-smoke';

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
  await confirmInspectorDrafts(window);
  await ready(window, `${browserTitleField}?.value === ${JSON.stringify(value)}`);
}

async function setParameterField(
  window: BrowserWindow,
  label: string,
  value: string,
): Promise<void> {
  const selector = `.wr-page-parameters-dialog [aria-label=${JSON.stringify(label)}]`;
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) !== null`);
  await window.webContents.executeJavaScript(
    `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  })()`,
    true,
  );
  await ready(
    window,
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
  );
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
              const root = document.querySelector('[data-webrad-route-path="/index"]');
              const changes = [];
              root.addEventListener('webrad:parameters-changed', event => changes.push(event.detail));
              Navigate('index', { params: { smokeParameterId: 123 } });
              const first = changes[0];
              const preservedRoot = root === document.querySelector('[data-webrad-route-path="/index"]');
              Navigate('/index?smokeParameterId=456', { replace: true });
              const second = changes[1];
              let invalidRejected = false;
              try { Navigate('index', { params: { smokeParameterId: 'invalid' } }); }
              catch (error) { invalidRejected = error.name === 'PageParameterError'; }
              const parameters = first?.previous.smokeParameterId === 7 && first?.params.smokeParameterId === 123
                && second?.params.smokeParameterId === 456 && preservedRoot && invalidRejected
                && new URL(location.href).searchParams.get('smokeParameterId') === '456';
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
              Navigate('index', { replace: true, params: { smokeParameterId: 7 } });
              return { hash: location.hash, path: location.pathname, parameters, notFound, internalNotFound, directFallback };
            })()`,
            true,
          );
          if (
            typeof routeEvidence !== 'object' ||
            routeEvidence === null ||
            Reflect.get(routeEvidence, 'parameters') !== true ||
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
    if (
      saved.project.pages.some((candidate) =>
        candidate.components.some(
          (node) => node.id === candidate.rootComponentId && 'routePath' in node.props,
        ),
      )
    )
      throw new Error('Page roots still contain obsolete custom route configuration.');
  }

  const customTitle = 'WebRAD browser title <Smoke> & "preview"';
  await openPageInspector();
  await ready(
    window,
    `(() => {
    const labels = [...document.querySelectorAll('.wr-object-inspector label')];
    const name = labels.find((label) => label.textContent?.trim() === 'Name')?.control;
    return !labels.some((label) => label.textContent?.trim() === 'Route path')
      && name instanceof HTMLInputElement && name.value === 'index' && name.readOnly;
  })()`,
  );
  await click(window, 'button[aria-label="Show pages"]');
  await ready(
    window,
    'document.querySelector(\'button[aria-label="Delete selected project item"]\')?.disabled === true',
  );
  await openPageInspector();
  log('renderer mandatory index page passed: fixed name, Route path removed, deletion disabled');
  if (page.parameters?.some((parameter) => parameter.name === 'smokeParameterId'))
    throw new Error('The routing smoke parameter is already present in the fixture.');
  const parameterNumber = (page.parameters?.length ?? 0) + 1;
  const parameterLabel = `Parameter ${String(parameterNumber)}`;
  await click(window, 'button[aria-label="Configure Parameters"]');
  await click(window, 'button[aria-label="Add parameter"]');
  await setParameterField(window, `${parameterLabel} name`, 'smokeParameterId');
  await setParameterField(window, `${parameterLabel} type`, 'number');
  await click(window, `.wr-page-parameters-dialog [aria-label="${parameterLabel} required"]`);
  await click(window, `.wr-page-parameters-dialog [aria-label="${parameterLabel} use default"]`);
  await setParameterField(window, `${parameterLabel} default value`, '7');
  await click(window, '.wr-page-parameters-dialog button[type="submit"]');
  await ready(window, 'document.querySelector(".wr-page-parameters-dialog") === null');
  await click(window, 'button[aria-label="Undo (Ctrl+Z)"]');
  await click(window, 'button[aria-label="Configure Parameters"]');
  await ready(
    window,
    `document.querySelectorAll('.wr-page-parameters-table tbody tr').length === ${String(parameterNumber - 1)}`,
  );
  await click(window, 'button[aria-label="Close page parameters"]');
  await click(window, 'button[aria-label="Redo (Ctrl+Y)"]');
  await click(window, 'button[aria-label="Configure Parameters"]');
  await ready(
    window,
    `document.querySelectorAll('.wr-page-parameters-table tbody tr').length === ${String(parameterNumber)}`,
  );
  await click(window, 'button[aria-label="Add parameter"]');
  await click(window, 'button[aria-label="Close page parameters"]');
  await click(window, 'button[aria-label="Configure Parameters"]');
  await ready(
    window,
    `document.querySelectorAll('.wr-page-parameters-table tbody tr').length === ${String(parameterNumber)}`,
  );
  await click(window, 'button[aria-label="Close page parameters"]');
  await ready(window, `${browserTitleField}?.value === ''`);
  // The root has a tree row but no child hit overlay. Use the tree's normal
  // selection toggle to exercise the Inspector's implicit Page target.
  await openPageInspector();
  await ready(
    window,
    `document.querySelector(${JSON.stringify(rootSelector)})?.getAttribute('aria-selected') === 'true'`,
  );
  await window.webContents.executeJavaScript(
    `(() => {
      const root = document.querySelector(${JSON.stringify(rootSelector)});
      if (!(root instanceof HTMLElement)) throw new Error('Page root is not selected.');
      root.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ctrlKey: true }));
    })()`,
    true,
  );
  await ready(
    window,
    `document.querySelectorAll('[role="treeitem"][data-component-id][aria-selected="true"], .wr-design-hit.selected').length === 0`,
  );
  await setBrowserTitle(window, customTitle);
  await assertSavedTitle(customTitle);
  const configured = (await loadProjectFiles(projectPath)).project.pages
    .find((candidate) => candidate.id === pageId)
    ?.parameters?.find((parameter) => parameter.name === 'smokeParameterId');
  if (
    configured?.type !== 'number' ||
    configured.required !== true ||
    configured.defaultValue !== 7
  )
    throw new Error('The page parameter schema was not persisted by the Inspector.');
  await assertPreviewTitle(window, customTitle, page.rootComponentId);
  await stopPreviewSmoke(window);

  await openPageInspector();
  await ready(window, `${browserTitleField}?.value === ${JSON.stringify(customTitle)}`);
  await setBrowserTitle(window, '');
  await assertSavedTitle('');
  await assertPreviewTitle(window, original.project.settings.applicationName, page.rootComponentId);
  await stopPreviewSmoke(window);
  await openPageInspector();
  const notFoundPage = original.project.pages.find((candidate) => candidate.name === '404');
  if (notFoundPage === undefined) throw new Error('The project has no mandatory 404 page.');
  await click(window, 'button[aria-label="Show pages"]');
  const notFoundRow = projectExplorerRowExpression({ id: notFoundPage.id });
  await ready(window, `${notFoundRow} instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `(() => {
    const row = ${notFoundRow};
    if (!(row instanceof HTMLElement)) throw new Error('404 is missing from Project Explorer.');
    row.click();
  })()`,
    true,
  );
  await ready(window, `${notFoundRow}?.getAttribute('aria-selected') === 'true'`);
  await ready(
    window,
    'document.querySelector(\'button[aria-label="Delete selected project item"]\')?.disabled === true',
  );
  await click(window, 'button[aria-label="Design"]');
  await click(
    window,
    `[role="treeitem"][data-component-id=${JSON.stringify(notFoundPage.rootComponentId)}]`,
  );
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  await ready(
    window,
    `(() => {
    const labels = [...document.querySelectorAll('.wr-object-inspector label')];
    const name = labels.find((label) => label.textContent?.trim() === 'Name')?.control;
    return !labels.some((label) => label.textContent?.trim() === 'Route path')
      && name instanceof HTMLInputElement && name.value === '404' && name.readOnly;
  })()`,
  );
  await click(window, 'button[aria-label="Show pages"]');
  const indexRow = projectExplorerRowExpression({ id: page.id });
  await ready(window, `${indexRow} instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `(() => {
    const row = ${indexRow};
    if (!(row instanceof HTMLElement)) throw new Error('index is missing from Project Explorer.');
    row.click();
  })()`,
    true,
  );
  await ready(window, `${indexRow}?.getAttribute('aria-selected') === 'true'`);
  await openPageInspector();
  await click(window, 'button[aria-label="Configure Parameters"]');
  await click(window, `button[aria-label="Remove parameter ${String(parameterNumber)}"]`);
  await click(window, '.wr-page-parameters-dialog button[type="submit"]');
  await assertSavedTitle('');
  const restored = (await loadProjectFiles(projectPath)).project.pages.find(
    (candidate) => candidate.id === pageId,
  );
  if (JSON.stringify(restored?.parameters ?? []) !== JSON.stringify(page.parameters ?? []))
    throw new Error('The page parameter smoke did not restore the original declaration.');
  log(
    'renderer Page parameters Inspector and F9 passed: typed defaults, save/cancel, undo/redo, destination URL, same-page change and invalid required value',
  );
  log(
    'renderer mandatory 404 page passed: protected identity, direct URL fallback, unknown history and Navigate redirected to /404',
  );
  if (typeof originalSelection === 'string') await click(window, 'button[aria-label="Design"]');
  if (typeof originalSelection === 'string')
    await click(
      window,
      `[role="treeitem"][data-component-id=${JSON.stringify(originalSelection)}]`,
    );
  log('renderer History routing F9 passed: clean page URL without hash');
  log(
    'renderer Page automatic routes passed: Route path absent, normalized model has no custom paths',
  );
  log(
    `renderer Page browser title Inspector and F9 passed: custom title saved and rendered; cleared title restored ${JSON.stringify(original.project.settings.applicationName)}`,
  );
}
