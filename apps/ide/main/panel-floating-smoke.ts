import type { BrowserWindow, WebFrameMain } from 'electron';
import { stopPreviewSmoke } from './preview-workspace-smoke';
import { loadProjectFiles } from './project-files';

const field = (label: string) => `(() => {
  const label = [...document.querySelectorAll('.wr-object-inspector label')].find(e => e.textContent.trim() === ${JSON.stringify(label)});
  return label?.control ?? null;
})()`;

async function ready(window: BrowserWindow, expression: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
    if (Date.now() >= deadline) throw new Error(`Panel floating smoke timed out: ${expression}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function findFrame(frame: WebFrameMain, url: string): WebFrameMain | undefined {
  // History routing may already have changed index.html to /index.
  if (frame.url.startsWith(new URL('./', url).href)) return frame;
  for (const child of frame.frames) {
    const found = findFrame(child, url);
    if (found) return found;
  }
  return undefined;
}

export async function runPanelFloatingSmoke(
  window: BrowserWindow,
  projectPath: string,
  log: (message: string) => void,
): Promise<void> {
  const execute = (expression: string) => window.webContents.executeJavaScript(expression, true);
  const click = async (selector: string): Promise<void> => {
    await ready(
      window,
      `document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`,
    );
    await execute(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  await click('button[aria-label="Design"]');
  const before = await loadProjectFiles(projectPath);
  const page = before.project.pages.find((p) => p.name === 'index');
  if (!page) throw new Error('Missing Panel smoke page');
  await click(`[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`);
  const palette = 'button[data-palette-component-type="WebPanel"]';
  await ready(
    window,
    `document.querySelector(${JSON.stringify(palette)}) instanceof HTMLButtonElement`,
  );
  await execute(
    `document.querySelector(${JSON.stringify(palette)}).dispatchEvent(new MouseEvent('dblclick', { bubbles:true }))`,
  );
  await click('button[role="tab"][aria-label="Properties"]');
  await ready(window, `${field('Placement')} instanceof HTMLSelectElement`);
  const id: unknown = await execute(
    `document.querySelector('.wr-design-hit.selected')?.dataset.componentId`,
  );
  if (typeof id !== 'string') throw new Error('Missing inserted Panel ID');
  const setPlacement = async (value: string) => {
    await execute(
      `(() => { const e=${field('Placement')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
    await ready(window, `${field('Placement')}?.value === ${JSON.stringify(value)}`);
  };
  await setPlacement('floating');
  await ready(
    window,
    `document.querySelector('[data-designer-node-id="${id}"]')?.parentElement.classList.contains('wr-designer-floating-layer') === true`,
  );
  for (const alignment of ['top', 'bottom', 'left', 'right', 'client', 'none']) {
    await execute(
      `(() => { const e=${field('Floating alignment')}; if (!(e instanceof HTMLSelectElement) || e.disabled) throw new Error('Missing Panel floating alignment control'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(alignment)}); e.dispatchEvent(new Event('change',{bubbles:true})); })()`,
    );
    await ready(window, `${field('Floating alignment')}?.value === ${JSON.stringify(alignment)}`);
    await ready(
      window,
      `(() => {
      const e=document.querySelector('[data-designer-node-id="${id}"]');
      const page=document.querySelector('.wr-page-surface');
      if (!(e instanceof HTMLElement) || !(page instanceof HTMLElement)) return false;
      const b=e.getBoundingClientRect(), p=page.getBoundingClientRect(), a=${JSON.stringify(alignment)};
      const near=(x,y)=>Math.abs(x-y)<2;
      // The fixture uses fixed responsive sizes; edge alignment must preserve them.
      const fixedSize=near(b.width,240) && near(b.height,160);
      if (a==='top') return near(b.top,p.top) && fixedSize;
      if (a==='bottom') return near(b.bottom,p.bottom) && fixedSize;
      if (a==='left') return near(b.left,p.left) && fixedSize;
      if (a==='right') return near(b.right,p.right) && fixedSize;
      if (a==='client') return near(b.left,p.left) && near(b.top,p.top) && fixedSize;
      return true;
    })()`,
    );
  }
  for (const [label, value] of [
    ['Floating horizontal anchor', 'right'],
    ['Floating vertical anchor', 'bottom'],
    ['Right inset', '24'],
    ['Bottom inset', '32'],
    ['Responsive height', 'stretch'],
    ['Top inset', '16'],
  ] as const) {
    await execute(
      `(() => { const e=${field(label)}; if (!(e instanceof HTMLInputElement || e instanceof HTMLSelectElement) || e.disabled || e.readOnly) throw new Error('Inactive Inspector field: ${label}'); const type=e instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true})); })()`,
    );
    await ready(window, `${field(label)}?.value === ${JSON.stringify(value)}`);
  }
  await ready(
    window,
    `(() => {
 const panel=document.querySelector('[data-designer-node-id="${id}"]');
 const hit=document.querySelector('.wr-design-hit[data-component-id="${id}"]');
 const surface=document.querySelector('.wr-page-surface');
 if (!panel || !hit || !surface) return false;
 const b=panel.getBoundingClientRect(), h=hit.getBoundingClientRect(), p=surface.getBoundingClientRect();
 const scale=p.width/surface.clientWidth, near=(a,b)=>Math.abs(a-b)<2;
 return near(p.right-b.right,24*scale) && near(b.top-p.top,16*scale) && near(p.bottom-b.bottom,32*scale) && ['left','top','width','height'].every(k=>near(b[k],h[k])) && ${field('Left inset')}?.readOnly === true;
 })()`,
  );
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent.trim() === 'Saved'`,
  );
  const saved = await loadProjectFiles(projectPath);
  if (
    saved.project.pages.find((p) => p.id === page.id)?.components.find((c) => c.id === id)?.props
      .placement !== 'floating' ||
    saved.project.pages.find((p) => p.id === page.id)?.components.find((c) => c.id === id)?.bounds
      .x !== 24 ||
    saved.project.pages.find((p) => p.id === page.id)?.components.find((c) => c.id === id)?.bounds
      .y !== 32
  )
    throw new Error('Panel floating placement was not saved');
  const previous: unknown = await execute(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.src ?? ''`,
  );
  await ready(
    window,
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false`,
  );
  await execute(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'F9',bubbles:true,cancelable:true}))`,
  );
  await ready(
    window,
    `(() => { const f=document.querySelector('iframe[title="WebRAD application preview"]'); return f instanceof HTMLIFrameElement && f.src !== ${JSON.stringify(previous)}; })()`,
  );
  const url: unknown = await execute(
    `document.querySelector('iframe[title="WebRAD application preview"]').src`,
  );
  const frameDeadline = Date.now() + 20_000;
  let frame = typeof url === 'string' ? findFrame(window.webContents.mainFrame, url) : undefined;
  while (frame === undefined && Date.now() < frameDeadline && typeof url === 'string') {
    await new Promise((resolve) => setTimeout(resolve, 50));
    frame = findFrame(window.webContents.mainFrame, url);
  }
  if (!frame) throw new Error('Missing Panel F9 frame');
  const evidence: unknown = await frame.executeJavaScript(
    `(async () => {
    const deadline=Date.now()+15000;
    const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const waitFor=async(predicate,description)=>{
      while(!predicate()) {
        if(Date.now()>=deadline) throw new Error(description+'; '+JSON.stringify({readyState:document.readyState,fonts:document.fonts.status,scroll:scrollY,viewport:{width:innerWidth,height:innerHeight},scrollHeight:document.scrollingElement?.scrollHeight}));
        await nextFrame();
      }
    };
    await waitFor(()=>document.readyState==='complete' && document.fonts.status==='loaded' && document.querySelector('[data-webrad-id="${id}"]'),'Panel Preview did not finish loading');
    const panel=document.querySelector('[data-webrad-id="${id}"]');
    const originalMinHeight=document.body.style.minHeight;
    const originalScroll={left:scrollX,top:scrollY};
    try {
      document.body.style.minHeight=Math.max(2000,innerHeight+240)+'px';
      await nextFrame(); await nextFrame();
      await waitFor(()=>document.scrollingElement.scrollHeight-document.scrollingElement.clientHeight>=120,'Panel fixture has no scrollable extent');
      window.scrollTo({left:0,top:0,behavior:'instant'});
      await waitFor(()=>scrollY===0,'Panel scroll baseline did not settle');
      let before;
      await waitFor(()=>{
        const current=panel.getBoundingClientRect().y;
        const stable=before===current;
        before=current;
        return stable;
      },'Panel layout did not settle before scrolling');
      window.scrollTo({left:0,top:120,behavior:'instant'});
      await waitFor(()=>scrollY===120,'Panel page scroll did not reach 120px');
      await nextFrame(); await nextFrame();
      return {position:getComputedStyle(panel).position,layer:panel.parentElement.className,scroll:window.scrollY,delta:before-panel.getBoundingClientRect().y};
    } finally {
      document.body.style.minHeight=originalMinHeight;
      window.scrollTo({...originalScroll,behavior:'instant'});
    }
  })()`,
    true,
  );
  if (
    typeof evidence !== 'object' ||
    evidence === null ||
    Reflect.get(evidence, 'position') !== 'absolute' ||
    Reflect.get(evidence, 'layer') !== 'wr-panel-floating-layer' ||
    Reflect.get(evidence, 'scroll') !== 120 ||
    Reflect.get(evidence, 'delta') !== 120
  )
    throw new Error(`Panel did not scroll with the page: ${JSON.stringify(evidence)}`);
  await stopPreviewSmoke(window);
  await click('button[aria-label="Design"]');
  await click(`[role="treeitem"][data-component-id=${JSON.stringify(id)}]`);
  await click('button[role="tab"][aria-label="Properties"]');
  await setPlacement('in-flow');
  await ready(
    window,
    `document.querySelector('[data-designer-node-id="${id}"]')?.parentElement.classList.contains('wr-designer-floating-layer') === false`,
  );
  // Remove only the component inserted by this smoke, through the element tree.
  await execute(
    `(() => { const e=document.querySelector('[role="treeitem"][data-component-id="${id}"]'); e.focus(); e.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true})); })()`,
  );
  await ready(window, `document.querySelector('[data-designer-node-id="${id}"]') === null`);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(
    window,
    `document.querySelector('.wr-toolbar-save-state')?.textContent.trim() === 'Saved'`,
  );
  log(
    `renderer Panel floating Inspector and F9 passed: top/bottom/left/right/client/none Inspector alignment, active inset coordinates, Stretch height and measured selection; ${JSON.stringify(evidence)}`,
  );
}
