import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { loadProjectFiles } from './project-files';
import { inspectHtmlSmokeDocument } from './html-smoke-document';
import { stopPreviewSmoke } from './preview-workspace-smoke';

const html = `<style>
body { margin: 0; color: rgb(17, 34, 51); background: rgb(240, 245, 250); }
article { padding: 12px; font: 16px sans-serif; }
.wr-toolbar { display: none !important; }
</style>
<article id="html-smoke"><strong>HTML &amp; CSS</strong>
<pre>&lt;/script&gt; "quotes" &amp; accents: olá</pre></article>`;

// Assert browser projection without depending on an external provider or playback.
const embedSource = 'https://embed.webrad.invalid/player?video=1&mode=embedded';
const embedAllow = 'autoplay; encrypted-media; picture-in-picture';
const embedHtml = `<iframe width="560" height="315" src="${embedSource}"
  allow="${embedAllow}" referrerpolicy="strict-origin-when-cross-origin"
  allowfullscreen loading="lazy"></iframe>`;

function embedProjection(selector: string, designTime: boolean): string {
  return `(() => {
    const frame = document.querySelector(${JSON.stringify(selector)});
    return frame instanceof HTMLIFrameElement && frame.src === ${JSON.stringify(embedSource)}
      && !frame.hasAttribute('srcdoc')
      && frame.getAttribute('sandbox') === 'allow-scripts allow-same-origin allow-presentation'
      && frame.getAttribute('allow') === ${JSON.stringify(embedAllow)}
      && frame.allowFullscreen && frame.loading === 'lazy'
      && frame.referrerPolicy === 'strict-origin-when-cross-origin'
      && frame.inert === ${String(designTime)};
  })()`;
}

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`HTML smoke timed out: ${expression}`);
}

async function click(window: BrowserWindow, selector: string): Promise<void> {
  await ready(window, `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(selector)}).click()`,
    true,
  );
}

function inspectorField(label: string): string {
  return `(() => {
    const label = [...document.querySelectorAll('.wr-object-inspector label')]
      .find(item => item.textContent?.trim() === ${JSON.stringify(label)});
    return label?.control;
  })()`;
}

async function configureAspectRatio(
  window: BrowserWindow,
  id: string,
  ratio: '1:1' | '4:3' | '3:4',
): Promise<void> {
  const selector = `[data-designer-node-id=${JSON.stringify(id)}]`;
  const original: unknown = await window.webContents.executeJavaScript(
    `(() => { const bounds = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [bounds.width, bounds.height]; })()`,
    true,
  );
  await ready(window, `${inspectorField('Aspect ratio')}?.value === 'none'`);
  for (const value of [ratio, 'none', ratio]) {
    await window.webContents.executeJavaScript(
      `(() => {
        const input = ${inspectorField('Aspect ratio')};
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`,
      true,
    );
    const [width = 1, height = 1] = ratio.split(':').map(Number);
    await ready(
      window,
      `(() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        const bounds = node?.getBoundingClientRect();
        const original = ${JSON.stringify(original)};
        const fixed = ${JSON.stringify(value)} !== 'none';
        const handles = [...document.querySelectorAll('[data-resize-handle]')];
        return bounds?.width > 0 && bounds?.height > 0
          && ${inspectorField('Aspect ratio')}?.value === ${JSON.stringify(value)}
          && ${inspectorField('Height')}?.readOnly === fixed
          && (fixed
            ? Math.abs(bounds.width / bounds.height - ${String(width / height)}) < 0.02
              && handles.length > 0 && handles.every(handle => ['e', 'w'].includes(handle.dataset.resizeHandle))
            : Math.abs(bounds.width - original[0]) < 1 && Math.abs(bounds.height - original[1]) < 1);
      })()`,
    );
  }
}

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  if (frame.url === url) return frame;
  for (const child of frame.frames) {
    const result = findFrame(child, url);
    if (result !== undefined) return result;
  }
  return undefined;
}

async function htmlDocument(
  window: BrowserWindow,
  parent: WebFrameMain,
): Promise<{ executeJavaScript(expression: string, userGesture?: boolean): Promise<unknown> }> {
  let lastInspection: unknown;
  const executeJavaScript = (expression: string): Promise<unknown> =>
    inspectHtmlSmokeDocument(window, parent, expression, (detail) => {
      lastInspection = detail;
    });
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (
      (await executeJavaScript(
        `document.querySelector('#html-smoke strong')?.textContent === 'HTML & CSS'`,
      )) === true
    )
      return { executeJavaScript };
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    'HTML smoke document did not render inside its isolated frame: ' +
      JSON.stringify(lastInspection),
  );
}

async function runDesignerEditingSmoke(
  window: BrowserWindow,
  projectPath: string,
  root: string,
  log: (message: string) => void,
): Promise<void> {
  const insertListBox = async (): Promise<string> => {
    await click(window, root);
    const palette = '[data-palette-component-type="WebListBox"]';
    await ready(
      window,
      `document.querySelector(${JSON.stringify(palette)}) instanceof HTMLButtonElement`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(palette)}).focus()`,
      true,
    );
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    await ready(
      window,
      `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('ListBox') === true`,
    );
    const id: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
      true,
    );
    if (typeof id !== 'string') throw new Error('Keyboard palette insertion has no component ID.');
    return id;
  };
  const firstId = await insertListBox();
  await ready(window, `${inspectorField('Selected Index')}?.getAttribute('role') === 'spinbutton'`);
  const selectedIndex: unknown = await window.webContents.executeJavaScript(
    `${inspectorField('Selected Index')}.value`,
    true,
  );
  await window.webContents.executeJavaScript(
    `(() => {
    const input = ${inspectorField('Selected Index')};
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`,
    true,
  );
  await window.webContents.insertText('-');
  await ready(
    window,
    `${inspectorField('Selected Index')}?.value === '-' && ${inspectorField('Selected Index')}?.dataset.editorDraftPending === 'true'`,
  );
  const invalidDraftBlocked: unknown = await window.webContents.executeJavaScript(
    `(() => {
    const input = ${inspectorField('Selected Index')};
    return !window.dispatchEvent(new Event('webrad:commit-editor-drafts', { cancelable: true }))
      && document.activeElement === input;
  })()`,
    true,
  );
  if (invalidDraftBlocked !== true)
    throw new Error('Invalid numeric draft did not block confirmation while preserving focus.');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await ready(
    window,
    `${inspectorField('Selected Index')}?.value === ${JSON.stringify(selectedIndex)}`,
  );
  await ready(window, `${inspectorField('Items')} instanceof HTMLTextAreaElement`);
  await window.webContents.executeJavaScript(
    `(() => {
    const input = ${inspectorField('Items')}; input.focus(); input.select();
  })()`,
    true,
  );
  await window.webContents.insertText('First');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  // Text insertion requires the native character event as well as key transitions.
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await ready(window, `${inspectorField('Items')}?.value === 'First\\n'`);
  await window.webContents.insertText('Second');
  await ready(window, `${inspectorField('Items')}?.value === 'First\\nSecond'`);
  await window.webContents.executeJavaScript(
    `(() => {
    const input = ${inspectorField('Items')};
    window.dispatchEvent(new Event('webrad:commit-editor-drafts', { cancelable: true }));
    if (document.activeElement !== input) throw new Error('Draft commit stole the Inspector focus.');
  })()`,
    true,
  );
  const secondId = await insertListBox();
  const firstRow = `[role="treeitem"][data-component-id=${JSON.stringify(firstId)}]`;
  const secondRow = `[role="treeitem"][data-component-id=${JSON.stringify(secondId)}]`;
  await click(window, firstRow);
  await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(secondRow)}).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent === '2 components'`,
  );
  await click(window, 'button[role="tab"][aria-label="Events"]');
  await ready(window, `${inspectorField('OnChange')} instanceof HTMLInputElement`);
  await window.webContents.executeJavaScript(
    `(() => {
    const input = ${inspectorField('OnChange')};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'UxSharedChange');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`,
    true,
  );
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const saved = await loadProjectFiles(projectPath);
  const nodes = saved.project.pages.flatMap((page) => page.components);
  const first = nodes.find((node) => node.id === firstId);
  const second = nodes.find((node) => node.id === secondId);
  if (
    JSON.stringify(first?.props.items) !== JSON.stringify(['First', 'Second']) ||
    first?.events.OnChange !== 'UxSharedChange' ||
    second?.events.OnChange !== 'UxSharedChange'
  ) {
    throw new Error(
      'ListBox draft or selected-component event binding was not saved for both IDs.',
    );
  }
  const undo = async (): Promise<void> => {
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(root)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
      true,
    );
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
  };
  await click(window, root);
  await undo();
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const undone = await loadProjectFiles(projectPath);
  if (
    undone.project.pages
      .flatMap((page) => page.components)
      .some((node) => [firstId, secondId].includes(node.id) && node.events.OnChange != null)
  ) {
    throw new Error('Selected-component event binding did not undo atomically.');
  }
  for (let index = 0; index < 3; index++) await undo();
  await ready(
    window,
    `document.querySelector(${JSON.stringify(firstRow)}) === null && document.querySelector(${JSON.stringify(secondRow)}) === null`,
  );
  await click(window, root);
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  log(
    'renderer UX Designer editing passed: native Enter palette insertion, multiline ListBox draft persisted, incomplete numeric draft canceled, multi-selection events saved for both IDs and undone atomically',
  );
}

/** Exercise the real palette, multiline Inspector, persistence and compiled Preview. */
export async function runHtmlSmoke(
  window: BrowserWindow,
  { projectPath, log }: { readonly projectPath: string; readonly log: (message: string) => void },
): Promise<void> {
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((item) => item.name === 'index');
  if (page === undefined) throw new Error('HTML smoke requires the index page.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click(window, 'button[aria-label="Design"]');
  await click(window, root);
  await click(window, 'button[role="tab"][aria-label="Properties"]');
  await runDesignerEditingSmoke(window, projectPath, root, log);
  const palette = `Array.from(document.querySelectorAll('.wr-palette-item')).find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'HTML')`;
  await ready(window, `${palette} instanceof HTMLElement`);
  await window.webContents.executeJavaScript(
    `${palette}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Html') === true`,
  );
  const id: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    true,
  );
  if (typeof id !== 'string') throw new Error('HTML insertion has no stable component ID.');
  await ready(
    window,
    `(() => {
    const handle = document.querySelector('.wr-design-hit.selected [data-resize-handle]');
    const surface = document.querySelector('.wr-page-surface');
    if (!(handle instanceof HTMLElement) || !(surface instanceof HTMLElement)) return false;
    const scale = Number(getComputedStyle(surface).getPropertyValue('--wr-designer-scale'));
    const bounds = handle.getBoundingClientRect();
    const marker = getComputedStyle(handle, '::after');
    return scale > 0 && Math.abs(bounds.width - 24) < 1 && Math.abs(bounds.height - 24) < 1
      && Math.abs(parseFloat(marker.width) * scale - 7) < 1;
  })()`,
  );
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  const designer = `[data-component-type="WebHtml"][data-component-id=${JSON.stringify(id)}]`;
  const field = `(() => {
    const label = [...document.querySelectorAll('.wr-object-inspector label')]
      .find(item => item.textContent?.trim() === 'HTML');
    return label?.control;
  })()`;
  await ready(window, `${field} instanceof HTMLTextAreaElement`);
  await window.webContents.executeJavaScript(
    `(() => {
      const input = ${field};
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(html)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    true,
  );
  await ready(
    window,
    `(() => {
      const frame = document.querySelector(${JSON.stringify(designer)});
      return frame instanceof HTMLIFrameElement && frame.srcdoc === ${JSON.stringify(html)}
        && frame.getAttribute('sandbox') === '' && frame.inert && frame.tabIndex === -1
        && getComputedStyle(frame).pointerEvents === 'none'
        && document.querySelector('.wr-toolbar')?.getBoundingClientRect().height > 0;
    })()`,
  );
  const designerFrame = await htmlDocument(window, window.webContents.mainFrame);
  const paint = `(() => {
    const article = document.querySelector('#html-smoke');
    const bounds = article?.getBoundingClientRect();
    return bounds?.width > 0 && bounds?.height > 0
      && getComputedStyle(document.body).color === 'rgb(17, 34, 51)'
      && getComputedStyle(document.body).backgroundColor === 'rgb(240, 245, 250)'
      && getComputedStyle(article).padding === '12px'
      && article.querySelector('pre')?.textContent === '</script> "quotes" & accents: olá';
  })()`;
  if ((await designerFrame.executeJavaScript(paint, true)) !== true)
    throw new Error('HTML Designer content, CSS or geometry differs from the authored markup.');
  const screenshotPath = path.resolve('node_modules', '.cache', 'webrad-html-designer.png');
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  window.webContents.invalidate();
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('HTML Designer screenshot was empty.');
  await fs.writeFile(screenshotPath, capture.toPNG());
  await configureAspectRatio(window, id, '4:3');
  const ratios: { id: string; type: string; ratio: '1:1' | '4:3' | '3:4'; height: number }[] = [
    { id, type: 'WebHtml', ratio: '4:3', height: 180 },
  ];
  for (const [caption, type, ratio] of [
    ['Panel', 'WebPanel', '1:1'],
    ['Group', 'WebGroup', '3:4'],
  ] as const) {
    await click(window, root);
    await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('.wr-palette-item'))
        .find(item => item.querySelector('.wr-palette-item-caption')?.textContent?.trim() === ${JSON.stringify(caption)})
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
      true,
    );
    await ready(
      window,
      `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith(${JSON.stringify(caption)}) === true`,
    );
    const componentId: unknown = await window.webContents.executeJavaScript(
      `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
      true,
    );
    if (typeof componentId !== 'string') throw new Error(`${caption} insertion has no stable ID.`);
    await configureAspectRatio(window, componentId, ratio);
    ratios.push({ id: componentId, type, ratio, height: 160 });
  }
  await click(window, root);
  await window.webContents.executeJavaScript(
    `${palette}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
    true,
  );
  await ready(
    window,
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Html') === true
      && document.querySelector('.wr-inspector-selection')?.getAttribute('title') !== ${JSON.stringify(id)}`,
  );
  const embedId: unknown = await window.webContents.executeJavaScript(
    `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    true,
  );
  if (typeof embedId !== 'string') throw new Error('HTML embed insertion has no stable ID.');
  const embedDesigner = `[data-component-type="WebHtml"][data-component-id=${JSON.stringify(embedId)}]`;
  await ready(window, `${field} instanceof HTMLTextAreaElement`);
  await window.webContents.executeJavaScript(
    `(() => {
      const input = ${field};
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(embedHtml)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`,
    true,
  );
  await ready(window, embedProjection(embedDesigner, true));
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  const saved = await loadProjectFiles(projectPath);
  for (const expected of ratios) {
    const node = saved.project.pages
      .flatMap((item) => item.components)
      .find((item) => item.id === expected.id);
    if (
      node?.type !== expected.type ||
      node.props.aspectRatio !== expected.ratio ||
      node.bounds.height !== expected.height
    )
      throw new Error(`${expected.type} lost its ratio or changed the saved free height.`);
  }
  const component = saved.project.pages
    .flatMap((item) => item.components)
    .find((item) => item.id === id);
  if (component?.type !== 'WebHtml' || component.props.html !== html)
    throw new Error('Saved HTML was altered or lost its component identity.');
  const embedComponent = saved.project.pages
    .flatMap((item) => item.components)
    .find((item) => item.id === embedId);
  if (embedComponent?.type !== 'WebHtml' || embedComponent.props.html !== embedHtml)
    throw new Error('Saved iframe embed markup was altered or lost its identity.');
  await ready(
    window,
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false
      && document.querySelector('[role="dialog"]') === null`,
  );
  await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
    true,
  );
  const previewSelector = 'iframe[title="WebRAD application preview"]';
  await ready(
    window,
    `Boolean(document.querySelector(${JSON.stringify(previewSelector)})?.getAttribute('src'))`,
  );
  const url: unknown = await window.webContents.executeJavaScript(
    `document.querySelector(${JSON.stringify(previewSelector)}).getAttribute('src')`,
    true,
  );
  if (typeof url !== 'string') throw new Error('HTML F9 has no Preview URL.');
  await ready(
    window,
    `(() => {
      const frame = document.querySelector(${JSON.stringify(previewSelector)});
      return frame?.allowFullscreen === true
        && frame.getAttribute('allow') === 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    })()`,
  );
  const deadline = Date.now() + 10_000;
  let preview: WebFrameMain | undefined;
  for (;;) {
    preview = findFrame(window.webContents.mainFrame, url);
    if (preview !== undefined && preview.frames.some((frame) => frame.url === 'about:srcdoc'))
      break;
    if (Date.now() >= deadline) throw new Error('HTML compiled Preview did not mount.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const frame = await htmlDocument(window, preview);
  if ((await frame.executeJavaScript(paint, true)) !== true)
    throw new Error('HTML compiled content or CSS differs from the Designer.');
  const isolated: unknown = await preview.executeJavaScript(
    `(() => {
      const frame = document.querySelector(${JSON.stringify(`[data-webrad-id=${JSON.stringify(id)}]`)});
      const bounds = frame?.getBoundingClientRect();
      return frame instanceof HTMLIFrameElement && frame.srcdoc === ${JSON.stringify(html)}
        && frame.getAttribute('sandbox') === '' && frame.contentDocument === null
        && frame.title === 'HTML content' && !frame.inert
        && bounds?.width > 0 && bounds?.height > 0;
    })()`,
    true,
  );
  if (isolated !== true)
    throw new Error('Compiled HTML lost its isolated origin or saved properties.');
  const embedRuntime = `[data-webrad-id=${JSON.stringify(embedId)}]`;
  if ((await preview.executeJavaScript(embedProjection(embedRuntime, false), true)) !== true)
    throw new Error('Compiled HTTPS embed lost its source, sandbox, permissions or referrer.');
  const ratioGeometry: unknown = await preview.executeJavaScript(
    `(async () => {
      const specifications = ${JSON.stringify(ratios)};
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      for (const specification of specifications) {
        const element = [...document.querySelectorAll('[data-webrad-id]')]
          .find(item => item.dataset.webradId === specification.id);
        if (!(element instanceof HTMLElement)) return false;
        const [width, height] = specification.ratio.split(':').map(Number);
        const proportional = () => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0 && Math.abs(bounds.width / bounds.height - width / height) < 0.02;
        };
        if (!proportional()) return false;
        const original = [element.style.getPropertyValue('width'), element.style.getPropertyPriority('width')];
        try {
          element.style.setProperty('width', '192px', 'important');
          await nextFrame(); await nextFrame();
          if (!proportional() || Math.abs(element.getBoundingClientRect().width - 192) > 1) return false;
        } finally {
          element.style.setProperty('width', original[0], original[1]);
        }
      }
      return true;
    })()`,
    true,
  );
  if (ratioGeometry !== true)
    throw new Error('Panel/Group/HTML lost their ratios after runtime width changes.');
  await stopPreviewSmoke(window);
  await click(window, 'button[aria-label="Design"]');
  await click(window, tree);
  // Four insertions, two textarea edits and three ratio edits for each of three components.
  for (let index = 0; index < 15; index++) {
    await window.webContents.executeJavaScript(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
      true,
    );
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
  }
  await ready(window, `document.querySelector(${JSON.stringify(tree)}) === null`);
  await ready(window, `document.querySelector(${JSON.stringify(embedDesigner)}) === null`);
  await click(window, root);
  await click(window, 'button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  log(
    `renderer HTML Inspector and F9 passed: palette, exact multiline persistence, isolated Designer/CSS, compiled sandbox and geometry; screenshot ${screenshotPath}`,
  );
  log(
    'renderer HTML HTTPS embed projection passed: exact saved markup, direct remote source, scripts/same-origin sandbox, media permissions, strict-origin referrer, inert Designer and compiled F9; provider playback not exercised',
  );
  log(
    'renderer component aspect ratios Inspector and F9 passed: Panel/Group/HTML presets, free restore, saved height preservation, horizontal resize handles, compiled geometry and runtime width changes',
  );
  log(
    'renderer UX resize targets passed: measured 24px interactive area and 7px visual marker with Designer zoom compensation',
  );
}
