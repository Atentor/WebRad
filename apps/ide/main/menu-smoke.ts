import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { parseWebMenuConfiguration } from '@webrad/runtime/menu-model';
import { loadProjectFiles } from './project-files';
/** Registry palette -> transactional editor -> saved model -> desktop and mobile compiled F9. */
export async function runMenuSmoke(
  window: BrowserWindow,
  options: {
    readonly projectPath: string;
    readonly log: (message: string) => void;
  },
): Promise<void> {
  const evaluate = (source: string): Promise<unknown> =>
    window.webContents.executeJavaScript(source, true);
  const ready = async (source: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if ((await evaluate(source)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Menu smoke timed out: ${source}`);
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const field = (label: string): string =>
    `([...document.querySelectorAll('.wr-menu-configuration-dialog label')].find(e => e.firstElementChild?.textContent === ${JSON.stringify(label)})?.querySelector('input,select'))`;
  const input = async (label: string, value: string): Promise<void> => {
    await evaluate(
      `(() => { const input = ${field(label)}; if (!(input instanceof HTMLInputElement)) throw new Error('Missing Menu field: ' + ${JSON.stringify(label)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await ready(`${field(label)}?.value === ${JSON.stringify(value)}`);
  };
  const original = await loadProjectFiles(options.projectPath);
  const page = original.project.pages.find((candidate) => candidate.name === 'index');
  if (!page) throw new Error('Menu smoke has no index.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  await click('button[aria-label="Design"]');
  await click(root);
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(
    `[...document.querySelectorAll('.wr-palette-item')].some(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Menu')`,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-palette-item')].find(e => e.querySelector('.wr-palette-item-caption')?.textContent?.trim() === 'Menu').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(
    `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Menu') === true`,
  );
  const id = await evaluate(
    `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
  );
  if (typeof id !== 'string') throw new Error('Menu palette did not create a stable ID.');
  await click('button[aria-label="Configure Menu"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog') !== null`);
  await input('Label', 'Menu smoke home');
  const editorGeometry: unknown = await evaluate(
    "(() => {\nconst dialog = document.querySelector('.wr-menu-configuration-dialog');\nconst body = dialog.querySelector('.wr-menu-editor-body');\nconst main = dialog.querySelector('.wr-menu-editor-main');\nconst tree = dialog.querySelector('.wr-menu-editor-tree-panel').getBoundingClientRect();\nconst fields = dialog.querySelector('.wr-menu-editor-fields').getBoundingClientRect();\nconst footer = dialog.querySelector('.wr-modal-actions').getBoundingClientRect();\nconst bounds = dialog.getBoundingClientRect();\nconst tabs = [...dialog.querySelectorAll('.wr-menu-editor-tabs > button')];\nreturn { width: bounds.width, available: innerWidth, mainWidth: main.clientWidth,\n fieldsWidth: fields.width, noOverlap: fields.top >= tree.bottom - 1 || fields.left >= tree.right - 1,\n noHorizontalOverflow: body.scrollWidth <= body.clientWidth + 2,\n readableTabs: tabs.every(tab => tab.getBoundingClientRect().width >= 76 && tab.scrollWidth <= tab.clientWidth + 1),\n visibleFooter: footer.bottom <= bounds.bottom + 1 && footer.top >= bounds.top,\n styledSelect: dialog.querySelector('.wr-menu-editor-field select').getBoundingClientRect().height >= 36 };\n})()",
  );
  if (
    !editorGeometry ||
    typeof editorGeometry !== 'object' ||
    !('width' in editorGeometry) ||
    typeof editorGeometry.width !== 'number' ||
    !('available' in editorGeometry) ||
    typeof editorGeometry.available !== 'number' ||
    editorGeometry.width < Math.min(1000, editorGeometry.available - 50) ||
    !('mainWidth' in editorGeometry) ||
    typeof editorGeometry.mainWidth !== 'number' ||
    editorGeometry.mainWidth < Math.min(560, editorGeometry.width - 2) ||
    !('fieldsWidth' in editorGeometry) ||
    typeof editorGeometry.fieldsWidth !== 'number' ||
    editorGeometry.fieldsWidth < Math.min(260, editorGeometry.width - 40) ||
    !('noOverlap' in editorGeometry) ||
    editorGeometry.noOverlap !== true ||
    !('noHorizontalOverflow' in editorGeometry) ||
    editorGeometry.noHorizontalOverflow !== true ||
    !('readableTabs' in editorGeometry) ||
    editorGeometry.readableTabs !== true ||
    !('visibleFooter' in editorGeometry) ||
    editorGeometry.visibleFooter !== true ||
    !('styledSelect' in editorGeometry) ||
    editorGeometry.styledSelect !== true
  )
    throw new Error(
      'Menu configurator layout is compressed or clipped: ' + JSON.stringify(editorGeometry),
    );
  const editorScreenshot = path.resolve('node_modules', '.cache', 'webrad-menu-configurator.png');
  await fs.mkdir(path.dirname(editorScreenshot), { recursive: true });
  window.webContents.invalidate();
  const editorCapture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (editorCapture.isEmpty()) throw new Error('Menu configurator screenshot is empty.');
  await fs.writeFile(editorScreenshot, editorCapture.toPNG());
  options.log(
    'renderer Menu configurator layout passed: ' +
      JSON.stringify(editorGeometry) +
      '; screenshot ' +
      editorScreenshot,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(e=>e.textContent==='Behavior & layout').click()`,
  );
  if (
    await evaluate(
      `Boolean(${field('Mobile breakpoint (px)')} || ${field('Drawer width (px)')} || ${field('Drawer side')})`,
    )
  )
    throw new Error('Menu still exposes manual mobile sizing controls.');
  await evaluate(
    `(() => {const label=[...document.querySelectorAll('.wr-menu-editor-fields label')].find(e=>e.textContent.trim()==='Show menu search');label.querySelector('input').click();})()`,
  );
  await evaluate(
    `(() => {const select=${field('Search behavior')};if(!(select instanceof HTMLSelectElement)||select.disabled)throw new Error('Missing Menu search behavior');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'event');select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await click('.wr-menu-configuration-dialog button[type="submit"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog') === null`);
  for (const [label, value] of [
    ['Margin top', 12],
    ['Margin right', 16],
    ['Margin bottom', 20],
    ['Margin left', 24],
  ] as const) {
    await evaluate(
      `(() => {const label=[...document.querySelectorAll('.wr-object-inspector label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});const input=label?.control;if(!(input instanceof HTMLInputElement))throw new Error('Missing Menu margin side');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));input.blur();})()`,
    );
  }
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(options.projectPath);
  const node = saved.project.pages
    .find((candidate) => candidate.id === page.id)
    ?.components.find((candidate) => candidate.id === id);
  const config = parseWebMenuConfiguration(node?.props.configuration);
  const matchesProjectScrollbar = `(navigation) => {
    if (!navigation) return false;
    const style = getComputedStyle(navigation);
    const scrollbar = getComputedStyle(navigation, '::-webkit-scrollbar');
    return style.scrollbarWidth === 'auto'
      && scrollbar.width === ${JSON.stringify(`${saved.project.settings.scrollbar.width}px`)}
      && scrollbar.height === ${JSON.stringify(`${saved.project.settings.scrollbar.height}px`)};
  }`;
  if (
    node?.type !== 'WebMenu' ||
    config.items[0]?.label !== 'Menu smoke home' ||
    config.mobileBreakpoint !== 768 ||
    !config.searchable ||
    config.searchMode !== 'event' ||
    node.props.marginTop !== 12 ||
    node.props.marginRight !== 16 ||
    node.props.marginBottom !== 20 ||
    node.props.marginLeft !== 24 ||
    config.items[1]?.children?.length !== 2
  )
    throw new Error('Menu editor and saved model disagree.');
  const menuCanvasGeometry = (mobile: boolean): string => `(() => {
 const wrapper=document.querySelector('[data-designer-node-id="${id}"]');
 const menu=wrapper?.querySelector('.wr-webmenu');
 const hit=document.querySelector('.wr-design-hit[data-component-id="${id}"]');
 if (!wrapper || !menu || !hit || menu.dataset.menuMobile !== '${String(mobile)}') return false;
 const bounds=wrapper.getBoundingClientRect();
 const visual=menu.getBoundingClientRect();
 const selection=hit.getBoundingClientRect();
 const same=rect => ['left','top','width','height'].every(key=>Math.abs(rect[key]-bounds[key])<=1);
 const surface=wrapper.closest('[data-viewport]');
 const scale=surface.getBoundingClientRect().width / surface.clientWidth;
 return bounds.width>0 && same(visual) && same(selection) && (!${String(mobile)} || Math.abs(bounds.height / scale - 48)<=1);
 })()`;
  await ready(menuCanvasGeometry(false));
  await click('button[role="tab"][aria-label="Responsive"]');
  await click('.wr-viewport-presets button[aria-label="Mobile"]');
  await ready(menuCanvasGeometry(true));
  await click('.wr-viewport-presets button[aria-label="Default"]');
  await ready(menuCanvasGeometry(false));
  await click('button[aria-label="Design"]');
  options.log(
    'renderer Menu canvas geometry passed: desktop/mobile/restored viewport, visual bounds and selection hitboxes',
  );
  const screenshot = path.resolve('node_modules', '.cache', 'webrad-menu-designer.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  window.webContents.invalidate();
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('Menu Designer screenshot is empty.');
  await fs.writeFile(screenshot, capture.toPNG());
  const previous = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
  );
  await ready(
    `document.querySelector('button[aria-label="Save (Ctrl+S)"]')?.disabled !== undefined && document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`,
  );
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))`,
  );
  await ready(
    `(() => { const src = document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'); return Boolean(src && src !== ${JSON.stringify(previous)}); })()`,
  );
  const url = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
  );
  const findFrame = (frame: WebFrameMain): WebFrameMain | undefined =>
    frame.url.startsWith(new URL('./', String(url)).href)
      ? frame
      : frame.frames.map(findFrame).find((candidate) => candidate !== undefined);
  let frame: WebFrameMain | undefined;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame);
    if (
      frame &&
      (await frame.executeJavaScript(
        `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); return menu?.dataset.menuMobile === 'false' && menu.dataset.menuOrientation === 'vertical' && menu.querySelector('.wr-menu-search-input') !== null && menu.querySelector('.wr-menu-item') !== null; })()`,
        true,
      )) === true
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!frame) throw new Error('Compiled Menu Preview frame is missing.');
  const desktop = await frame.executeJavaScript(
    `(() => {
    const menu = document.querySelector('[data-webrad-id="${id}"]');
    if (!menu || menu.dataset.menuMobile !== 'false') return {error:'Missing desktop Menu',mobile:menu?.dataset.menuMobile};
    if (!(${matchesProjectScrollbar})(menu.querySelector('.wr-menu-navigation'))) return {error:'Desktop navigation scrollbar'};
    const received=[];
    const onSearch=event=>received.push(event.detail.text);
    menu.addEventListener('search',onSearch);
    const search=menu.querySelector('.wr-menu-search-input');
    if(!search)return {error:'Missing search'};
    const count=menu.querySelectorAll('.wr-menu-item').length;
    search.value='external search';search.dispatchEvent(new Event('input',{bubbles:true}));
    if(received.length!==1||received[0]!=='external search'||menu.querySelectorAll('.wr-menu-item').length!==count)return {error:'Search event-only contract',received,count,actual:menu.querySelectorAll('.wr-menu-item').length};
    search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
    menu.removeEventListener('search',onSearch);
    if(received.length!==2||received[1]!=='')return {error:'Cleared search event',received};

    const toggle = () => menu.querySelector('[data-menu-action="collapse"]');
    const width = menu.getBoundingClientRect().width;
    toggle().click();
    if (menu.dataset.menuCollapsed !== 'true' || Math.abs(menu.getBoundingClientRect().width - 72) > 1) return {error:'Collapse',collapsed:menu.dataset.menuCollapsed,width:menu.getBoundingClientRect().width,style:menu.getAttribute('style')};
    toggle().click();
    if (Math.abs(menu.getBoundingClientRect().width - width) > 1) return {error:'Expanded width restoration',before:width,after:menu.getBoundingClientRect().width,style:menu.getAttribute('style')};
    menu.querySelector('[data-menu-item="home"]').click();
    return {selected:menu.querySelector('[data-menu-item="home"]').getAttribute('aria-current'),children:menu.querySelector('.wr-menu-submenu').children.length};
  })()`,
    true,
  );
  if (
    typeof desktop !== 'object' ||
    desktop === null ||
    !('selected' in desktop) ||
    desktop.selected !== 'page' ||
    !('children' in desktop) ||
    desktop.children !== 2
  )
    throw new Error(
      'Menu desktop project scrollbar, collapse, selection or submenu projection failed: ' +
        JSON.stringify(desktop),
    );
  window.webContents.debugger.attach('1.3');
  try {
    window.webContents.focus();
    await evaluate(`document.querySelector('iframe[title="WebRAD application preview"]').focus()`);
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const mobileDeadline = Date.now() + 10000;
    let mobile = false;
    while (Date.now() < mobileDeadline) {
      if (
        (await frame.executeJavaScript(
          `document.querySelector('[data-webrad-id="${id}"]')?.dataset.menuMobile === 'true'`,
          true,
        )) === true
      ) {
        mobile = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!mobile) throw new Error('Menu did not respond to the real mobile viewport.');
    const drawer = await frame.executeJavaScript(
      `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); menu.querySelector('[data-menu-action="open"]').click(); const dialog = menu.querySelector('dialog'); return (${matchesProjectScrollbar})(dialog.querySelector('.wr-menu-navigation')) && Math.abs(menu.getBoundingClientRect().height - 48) <= 1 && dialog.open && dialog.contains(document.activeElement) && document.body.style.overflow === 'hidden' && dialog.getBoundingClientRect().width <= innerWidth; })()`,
      true,
    );
    if (drawer !== true)
      throw new Error(
        'Menu mobile drawer lacks project scrollbar, modal focus, viewport sizing or scroll lock.',
      );
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    const closed = await frame.executeJavaScript(
      `!document.querySelector('[data-webrad-id="${id}"] dialog').open && document.body.style.overflow !== 'hidden'`,
      true,
    );
    if (closed !== true)
      throw new Error('Menu Escape did not close the drawer and restore scrolling.');
  } finally {
    await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    window.webContents.debugger.detach();
  }
  await click('button[aria-label="Design"]');
  const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
  await click(tree);

  await click('button[aria-label="Configure Menu"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog') !== null`);
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(e=>e.textContent==='Behavior & layout').click()`,
  );
  await evaluate(
    `(() => {const e=${field('Desktop orientation')};Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'horizontal');e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await click('.wr-menu-configuration-dialog button[type="submit"]');
  await ready(`document.querySelector('.wr-menu-configuration-dialog')===null`);
  await evaluate(
    `(() => {const label=[...document.querySelectorAll('.wr-object-inspector label')].find(e=>e.textContent.trim()==='Vertical side');const e=label?.control;if(!(e instanceof HTMLSelectElement))throw new Error('Missing automatic Menu placement');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'bottom');e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  if (
    await evaluate(
      `[...document.querySelectorAll('.wr-object-inspector label')].some(e=>['Responsive width','Responsive height','Left inset','Top inset','Placement'].includes(e.textContent.trim()))`,
    )
  )
    throw new Error('Menu still exposes manual responsive placement controls.');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim()==='Saved'`);
  const previousHorizontal = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.src??''`,
  );
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'F9',bubbles:true,cancelable:true}))`,
  );
  await ready(
    `(() => {const frame=document.querySelector('iframe[title="WebRAD application preview"]');return Boolean(frame?.src && frame.src!==${JSON.stringify(previousHorizontal)});})()`,
  );
  const horizontalUrl = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]').src`,
  );
  const horizontalFrame = (root: WebFrameMain): WebFrameMain | undefined =>
    root.url.startsWith(new URL('./', String(horizontalUrl)).href)
      ? root
      : root.frames.map(horizontalFrame).find(Boolean);
  const horizontalSaved = await loadProjectFiles(options.projectPath);
  const horizontalNode = horizontalSaved.project.pages
    .find((candidate) => candidate.id === page.id)
    ?.components.find((candidate) => candidate.id === id);
  if (
    horizontalNode?.props.floatingVerticalAnchor !== 'bottom' ||
    horizontalNode.bounds.height !== 80
  )
    throw new Error(
      'Horizontal Menu saved layout was not normalized: ' + JSON.stringify(horizontalNode),
    );
  const horizontalDeadline = Date.now() + 10000;
  let horizontal: WebFrameMain | undefined;
  let horizontalReady = false;
  while (Date.now() < horizontalDeadline) {
    horizontal = horizontalFrame(window.webContents.mainFrame);
    if (
      horizontal &&
      (await horizontal.executeJavaScript(
        `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); return menu?.dataset.menuOrientation === 'horizontal' && menu.querySelector('[data-menu-item="workspace"]') !== null && Math.abs(menu.getBoundingClientRect().height - 80) <= 1; })()`,
        true,
      )) === true
    ) {
      horizontalReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!horizontal || !horizontalReady)
    throw new Error('Horizontal Menu F9 geometry did not become ready.');
  const flyout = await horizontal.executeJavaScript(
    `(async()=>{
 const menu=document.querySelector('[data-webrad-id="${id}"]');if(!menu || menu.dataset.menuOrientation!=='horizontal')return {error:'Missing horizontal Menu',orientation:menu?.dataset.menuOrientation};
 if(!(${matchesProjectScrollbar})(menu.querySelector('.wr-menu-navigation')))return {error:'Navigation scrollbar'};
 const toggle=menu.querySelector('[data-menu-item="workspace"]');if(toggle.getAttribute('aria-expanded')!=='false')return {error:'Submenu initially expanded'};
 toggle.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const submenu=menu.querySelector('.wr-menu-submenu');const r=submenu.getBoundingClientRect();
 if(!(${matchesProjectScrollbar})(submenu))return {error:'Submenu scrollbar'};
 const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
 const visible=submenu.matches(':popover-open') && submenu.dataset.openDirection==='up' && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight && submenu.contains(hit);
 menu.querySelector('[data-menu-item="workspace"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
 const focused=menu.querySelector('.wr-menu-submenu').contains(document.activeElement);
 document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 const closed=!menu.querySelector(':popover-open') && document.activeElement?.dataset.menuItem==='workspace';
 return { visible, focused, closed, direction:submenu.dataset.openDirection, rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}, viewport:{width:innerWidth,height:innerHeight}, menu:menu.getBoundingClientRect().toJSON(), anchor:toggle.getBoundingClientRect().toJSON(), hit:hit?.outerHTML.slice(0,200) };
 })()`,
    true,
  );
  if (
    typeof flyout !== 'object' ||
    flyout === null ||
    !('visible' in flyout) ||
    flyout.visible !== true ||
    !('focused' in flyout) ||
    flyout.focused !== true ||
    !('closed' in flyout) ||
    flyout.closed !== true
  )
    throw new Error(
      'Horizontal Menu flyout is clipped, outside the viewport or has broken focus: ' +
        JSON.stringify(flyout),
    );
  options.log(
    'renderer Menu horizontal flyouts passed: bottom docking, top-layer geometry, visible hit area, ArrowDown/Escape and focus restoration',
  );
  await click('button[aria-label="Design"]');
  await click(tree);
  for (let index = 0; index < 8; index++) {
    const undoState = await evaluate(
      `(() => { const menu = document.querySelector('[data-component-id="${id}"].wr-component'); return { undoDisabled: document.querySelector('button[aria-label="Undo (Ctrl+Z)"]')?.disabled, menu: menu?.outerHTML.slice(0, 500), inspector: [...document.querySelectorAll('.wr-object-inspector label')].map(label => [label.textContent, label.control?.value]) }; })()`,
    );
    options.log(`renderer Menu undo step ${String(index + 1)}: ${JSON.stringify(undoState)}`);
    await evaluate(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`,
    );
    await evaluate(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    );
  }
  await ready(`document.querySelector(${JSON.stringify(tree)}) === null`);
  await click(root);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    `renderer Menu Inspector and F9 passed: project scrollbar, nested items, persistence, desktop collapse/selection, mobile viewport, modal focus/Escape, undo; screenshot ${screenshot}`,
  );
}
