import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { stopPreviewSmoke } from './preview-workspace-smoke';
import { parseWebMenuConfiguration } from '@webrad/runtime/menu-model';
import { menuSourcePath } from '@webrad/project-model';
import { loadProjectFiles } from './project-files';
import { monacoHandlerInputReadyExpression } from './monaco-smoke-input';
import { projectExplorerRowExpression } from './project-explorer-smoke';

interface MenuSmokeOptions {
  readonly projectPath: string;
  readonly log: (message: string) => void;
}

interface MenuSmokeFrameFocus {
  readonly frame: WebFrameMain;
  readonly sessionId: string;
}

async function setDesktopViewport(window: BrowserWindow): Promise<void> {
  await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

/** Registry palette -> transactional editor -> saved model -> desktop and mobile compiled F9. */
export async function runMenuSmoke(
  window: BrowserWindow,
  options: MenuSmokeOptions,
): Promise<void> {
  window.webContents.debugger.attach('1.3');
  const frameFocusSessions: MenuSmokeFrameFocus[] = [];
  const enableFrameFocus = async (frame: WebFrameMain): Promise<void> => {
    // A cross-site Preview owns a separate renderer Page. Emulating focus on the
    // IDE target does not activate that Page's focus controller.
    if (frame.processId === window.webContents.mainFrame.processId) return;
    if (frameFocusSessions.some((session) => session.frame === frame)) return;
    const targets: unknown = await window.webContents.debugger.sendCommand('Target.getTargets', {
      filter: [{ type: 'iframe' }, { exclude: true }],
    });
    if (
      typeof targets !== 'object' ||
      targets === null ||
      !('targetInfos' in targets) ||
      !Array.isArray(targets.targetInfos)
    )
      throw new Error('Menu Preview debugger did not return iframe targets.');
    const target = targets.targetInfos.find(
      (candidate: unknown): candidate is { targetId: string; url: string } =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'targetId' in candidate &&
        typeof candidate.targetId === 'string' &&
        'url' in candidate &&
        candidate.url === frame.url,
    );
    if (!target)
      throw new Error(
        'Menu Preview has no matching cross-process debugger target: ' +
          JSON.stringify({
            url: frame.url,
            processId: frame.processId,
            mainFrameProcessId: window.webContents.mainFrame.processId,
            targets: targets.targetInfos,
          }),
      );
    const attached: unknown = await window.webContents.debugger.sendCommand(
      'Target.attachToTarget',
      { targetId: target.targetId, flatten: true },
    );
    if (
      typeof attached !== 'object' ||
      attached === null ||
      !('sessionId' in attached) ||
      typeof attached.sessionId !== 'string'
    )
      throw new Error('Menu Preview debugger did not return a child session.');
    frameFocusSessions.push({ frame, sessionId: attached.sessionId });
    await window.webContents.debugger.sendCommand(
      'Emulation.setFocusEmulationEnabled',
      { enabled: true },
      attached.sessionId,
    );
    options.log(
      'renderer Menu Preview focus target: ' +
        JSON.stringify({
          processId: frame.processId,
          mainFrameProcessId: window.webContents.mainFrame.processId,
          targetId: target.targetId,
          separateRenderer: true,
        }),
    );
  };
  try {
    // Hidden offscreen windows cannot acquire native activation reliably on CI.
    // Activate Chromium's page focus lifecycle so real focus pseudo-classes and
    // input events remain available without revealing the automation window.
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    });
    await runMenuSmokeWorkflow(window, options, enableFrameFocus);
  } finally {
    try {
      for (const { frame, sessionId } of frameFocusSessions) {
        // Stopping/recompiling Preview already destroys and detaches its target.
        if (frame.isDestroyed()) continue;
        try {
          await window.webContents.debugger.sendCommand(
            'Emulation.setFocusEmulationEnabled',
            { enabled: false },
            sessionId,
          );
        } finally {
          await window.webContents.debugger.sendCommand('Target.detachFromTarget', { sessionId });
        }
      }
    } finally {
      try {
        await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
          enabled: false,
        });
      } finally {
        try {
          await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
        } finally {
          window.webContents.debugger.detach();
        }
      }
    }
  }
}

async function runMenuSmokeWorkflow(
  window: BrowserWindow,
  options: MenuSmokeOptions,
  enableFrameFocus: (frame: WebFrameMain) => Promise<void>,
): Promise<void> {
  const evaluate = (source: string): Promise<unknown> =>
    window.webContents.executeJavaScript(source, true);
  const ready = async (source: string): Promise<void> => {
    const deadline = Date.now() + 10000;
    for (;;) {
      if ((await evaluate(source)) === true) return;
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const evidence = await evaluate(`({
      viewport: document.querySelector('[data-viewport]')?.getAttribute('data-viewport-width'),
      menus: [...document.querySelectorAll('[data-designer-node-id] > .wr-webmenu')].map(menu => ({
        mobile: menu.dataset.menuMobile, bounds: menu.getBoundingClientRect().toJSON(),
        wrapper: menu.parentElement.getBoundingClientRect().toJSON(),
        hit: document.querySelector('.wr-design-hit[data-component-id="' + menu.dataset.componentId + '"]')?.getBoundingClientRect().toJSON(),
      })),
      preview: document.querySelector('.wr-preview-state')?.textContent,
      previewUrl: document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src'),
      save: document.querySelector('.wr-toolbar-save-state')?.textContent?.trim(),
      runDisabled: document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled,
      output: document.querySelector('.wr-bottom-panel')?.textContent,
      explorer: [...document.querySelectorAll('.wr-page-row')].map(row => ({
        id: row.getAttribute('data-project-resource-id'),
        name: row.querySelector(':scope > .wr-explorer-name')?.textContent,
        selected: row.getAttribute('aria-selected'),
      })),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => ({
        text: dialog.textContent?.slice(0, 2000),
        inputs: [...dialog.querySelectorAll('input,select')].map(input => ({
          value: input.value, disabled: input.disabled,
        })),
      })),
    })`);
    throw new Error(`Menu smoke timed out: ${source}; evidence: ${JSON.stringify(evidence)}`);
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
  await click('[data-menu-editor-item="workspace"]');
  await click('button[aria-label="Remove menu item"]');
  await ready(`document.querySelector('[data-menu-editor-item="workspace"]') === null
    && document.querySelector('[data-menu-editor-item="projects"]') === null
    && document.querySelector('[data-menu-editor-item="team"]') === null`);
  await input('Label', 'Menu smoke retained edit');
  await click('button[aria-label="Undo menu item removal"]');
  await ready(`document.querySelector('[data-menu-editor-item="workspace"]') === document.activeElement
    && document.querySelector('[data-menu-editor-item="projects"]') !== null
    && document.querySelector('[data-menu-editor-item="team"]') !== null
    && document.querySelector('[data-menu-editor-item="home"]')?.textContent.includes('Menu smoke retained edit')`);
  await click('button[aria-label="Remove menu item"]');
  await ready(`document.querySelector('[data-menu-editor-item="workspace"]') === null`);
  await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Undo menu item removal"]');
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', {key:'z', ctrlKey:true, bubbles:true, cancelable:true}));
  })()`);
  await ready(`document.querySelector('[data-menu-editor-item="workspace"]') === document.activeElement
    && document.querySelector('[data-menu-editor-item="projects"]') !== null
    && document.querySelector('[data-menu-editor-item="team"]') !== null`);
  await click('[data-menu-editor-item="home"]');
  await input('Label', 'Menu smoke home');
  options.log(
    'renderer Menu subtree removal undo passed: button, Ctrl+Z, preserved unrelated edits',
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(e=>e.textContent==='Brand & user').click()`,
  );
  const userBinding = `([...document.querySelectorAll('.wr-menu-editor-fields label')].find(e=>e.textContent.trim()==='Bind to current RestGO user')?.querySelector('input'))`;
  await ready(`${userBinding} instanceof HTMLInputElement && !${userBinding}.checked`);
  await input('User name', 'Menu smoke user');
  await evaluate(`${userBinding}.click()`);
  await ready(`${userBinding}?.checked === true
    && ${field('User name')}?.disabled === true
    && ${field('User description')}?.disabled === true
    && ${field('User photo')}?.disabled === true
    && ${field('Status')}?.disabled === true`);
  await evaluate(`${userBinding}.click()`);
  await ready(`${userBinding}?.checked === false
    && ${field('User name')}?.disabled === false
    && ${field('User name')}?.value === 'Menu smoke user'
    && ${field('Status')}?.disabled === false`);
  options.log(
    'renderer Menu RestGO user binding controls passed: manual default, binding disables profile fields, unbinding preserves manual values',
  );
  const userSettings = `([...document.querySelectorAll('.wr-menu-editor-fields label')].find(e=>e.textContent.trim()==='Enable user settings')?.querySelector('input'))`;
  await ready(`${userSettings} instanceof HTMLInputElement && !${userSettings}.checked`);
  await evaluate(`${userSettings}.click()`);
  await ready(`${userSettings}?.checked === true && ${userBinding}?.checked === true
    && ${field('User name')}?.disabled === true`);
  await ready(`${field('User settings language')}?.value === 'en'`);
  await evaluate(`(() => {
    const language = ${field('User settings language')};
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(language, 'pt-BR');
    language.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await ready(`${field('User settings language')}?.value === 'pt-BR'
    && document.querySelector('.wr-menu-editor-preview-surface .wr-menu-user-settings')?.getAttribute('aria-label') === 'Configurações da conta'`);
  await evaluate(`(() => {
    const language = ${field('User settings language')};
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(language, 'en');
    language.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await ready(`${field('User settings language')}?.value === 'en'
    && document.querySelector('.wr-menu-editor-preview-surface .wr-menu-user-settings')?.getAttribute('aria-label') === 'Account settings'`);
  options.log(
    'renderer Menu user settings language passed: English default, Portuguese and English accessible icon labels',
  );
  await input('Email confirmation URL', 'https://app.example.com/confirm-email');
  await input('Password reset URL', 'https://app.example.com/reset-password');
  await evaluate(`${userBinding}.click()`);
  await ready(`${userSettings}?.checked === false && ${userBinding}?.checked === false`);
  await evaluate(`${userSettings}.click()`);
  await ready(`${field('Email confirmation URL')}?.value === 'https://app.example.com/confirm-email'
    && ${field('Password reset URL')}?.value === 'https://app.example.com/reset-password'`);
  await evaluate(`${userBinding}.click()`);
  await ready(`${userSettings}?.checked === false && ${userBinding}?.checked === false`);
  options.log(
    'renderer Menu account link URLs passed: editable destinations retained when settings are toggled',
  );
  options.log(
    'renderer Menu user settings option passed: disabled by default, enables current-user binding, unbinding disables settings',
  );
  await ready(
    `document.querySelector('.wr-menu-editor-preview-surface .wr-menu-user-settings') instanceof HTMLButtonElement`,
  );
  await evaluate(`(() => {
    const menu = document.querySelector('.wr-menu-editor-preview-surface .wr-webmenu');
    const profile = menu.querySelector('.wr-menu-user');
    const icon = menu.querySelector('.wr-menu-user-settings');
    if (!(profile instanceof HTMLDivElement) || profile.tabIndex !== -1
      || profile.hasAttribute('data-menu-action') || profile.querySelector('button,a,input')
      || getComputedStyle(profile).cursor !== 'default' || !(icon instanceof HTMLButtonElement))
      throw new Error('Menu profile must be informational with a separate settings button');
    let clicks = 0;
    const onUserClick = () => { clicks++; };
    menu.addEventListener('userclick', onUserClick);
    try {
      profile.click();
      profile.querySelector('.wr-menu-copy').click();
      if (clicks !== 0) throw new Error('Profile content still triggers user actions');
      icon.click();
      if (clicks !== 1) throw new Error('Only the settings icon must trigger the user action');
    } finally {
      menu.removeEventListener('userclick', onUserClick);
    }
  })()`);
  options.log(
    'renderer Menu profile icon-only interaction passed: informational profile, icon action',
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(e=>e.textContent==='Behavior & layout').click()`,
  );
  await evaluate(
    `(() => { const select = ${field('Mobile icon position')}; if (!(select instanceof HTMLSelectElement) || select.value !== 'left') throw new Error('Missing default left Menu icon option'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'right'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-preview header button')].find(e=>e.textContent.trim()==='Mobile').click()`,
  );
  await ready(`(() => {
    const trigger = document.querySelector('.wr-menu-editor-preview-surface .wr-menu-mobile-trigger');
    const icon = trigger?.querySelector('.wr-icon-graphic');
    const label = trigger?.querySelector('.wr-menu-label');
    return icon && label && icon.getBoundingClientRect().left >= label.getBoundingClientRect().right;
  })()`);
  await evaluate(
    `[...document.querySelectorAll('.wr-menu-editor-preview header button')].find(e=>e.textContent.trim()==='Desktop').click()`,
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
    `(() => {const label=[...document.querySelectorAll('.wr-menu-editor-fields label')].find(e=>e.textContent.trim()==='Show theme switch');if(!label)throw new Error('Missing Menu theme switch option');const input=label.querySelector('input');if(!input.checked)throw new Error('New Menu theme switch must be enabled by default');input.click();if(input.checked)throw new Error('Menu theme switch must allow disabling');input.click();})()`,
  );
  await ready(
    `document.querySelector('.wr-menu-editor-preview-surface [data-menu-action="theme"]') !== null`,
  );
  const originalPreviewTheme = await evaluate(
    `document.querySelector('.wr-menu-editor-preview-surface').dataset.webradTheme`,
  );
  await click('.wr-menu-editor-preview-surface [data-menu-action="theme"]');
  await ready(
    `document.querySelector('.wr-menu-editor-preview-surface').dataset.webradTheme !== ${JSON.stringify(originalPreviewTheme)}`,
  );
  await click('.wr-menu-editor-preview-surface [data-menu-action="theme"]');
  await ready(
    `document.querySelector('.wr-menu-editor-preview-surface').dataset.webradTheme === ${JSON.stringify(originalPreviewTheme)}`,
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
  const sharedDefinition = saved.project.menus?.find(
    (menu) => menu.id === node?.props.menuDefinitionId,
  );
  const sharedRoot = sharedDefinition?.components.find(
    (component) => component.id === sharedDefinition.rootComponentId,
  );
  if (
    !node ||
    !sharedDefinition ||
    !sharedRoot ||
    node.props.configuration !== undefined ||
    !saved.userSources[menuSourcePath(sharedDefinition)]?.includes(`class ${sharedDefinition.name}`)
  )
    throw new Error(
      'Palette Menu must persist a shared definition reference and a separate authored class.',
    );
  const config = parseWebMenuConfiguration(sharedRoot.props.configuration);
  options.log(
    'renderer native Menu persistence passed: palette insertion, stable definition reference, configuration stored once and separate authored TypeScript',
  );
  const assertMenuSearchFocus = `(menu) => {
    const input = menu.querySelector('.wr-menu-search-input');
    const field = input?.closest('.wr-menu-search');
    if (!input || !field || !field.querySelector('.wr-icon-graphic'))
      throw new Error('Missing complete Menu search field');
    const previous = document.activeElement;
    const before = field.getBoundingClientRect();
    input.focus({preventScroll: true});
    const outer = getComputedStyle(field);
    const inner = getComputedStyle(input);
    const after = field.getBoundingClientRect();
    const evidence = {
      documentFocused: document.hasFocus(), inputActive: document.activeElement === input,
      inputFocused: input.matches(':focus'), inputFocusVisible: input.matches(':focus-visible'),
      fieldFocusWithin: field.matches(':focus-within'), connected: input.isConnected,
      mobile: menu.dataset.menuMobile, viewport: {width: innerWidth, height: innerHeight},
      outer: {style: outer.outlineStyle, width: outer.outlineWidth, offset: outer.outlineOffset,
        color: outer.outlineColor, accent: outer.getPropertyValue('--wr-menu-accent').trim()},
      inner: {style: inner.outlineStyle, width: inner.outlineWidth, offset: inner.outlineOffset,
        shadow: inner.boxShadow},
      before: before.toJSON(), after: after.toJSON()
    };
    // outline-style:none paints no ring even when Chromium reports the initial
    // medium outline-width as 3px. Keep that raw width in the diagnostic evidence.
    if (!evidence.documentFocused || !evidence.inputActive || !evidence.inputFocused
      || !evidence.inputFocusVisible || !evidence.fieldFocusWithin
      || evidence.outer.style !== 'solid' || evidence.outer.width !== '2px'
      || evidence.outer.offset !== '2px' || evidence.inner.style !== 'none'
      || evidence.inner.offset !== '0px'
      || evidence.inner.shadow !== 'none' || Math.abs(after.width - before.width) > 0.5
      || Math.abs(after.height - before.height) > 0.5)
      throw new Error('Menu search focus must surround icon and input without an inner ring or layout shift: ' + JSON.stringify(evidence));
    input.blur();
    if (getComputedStyle(field).outlineStyle !== 'none')
      throw new Error('Menu search focus ring remains after blur: ' + JSON.stringify(evidence));
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll: true});
    return evidence;
  }`;
  const assertMenuIconGeometry = `(menu) => {
    const icons = [...menu.querySelectorAll('.wr-icon-graphic')];
    let visible = 0;
    for (const icon of icons) {
      if (icon.getClientRects().length === 0) continue;
      const bounds = icon.getBoundingClientRect();
      const style = getComputedStyle(icon);
      const disclosure = icon.matches('.wr-menu-item > .wr-icon-graphic:last-child:not(:first-child)');
      const expected = disclosure ? 16 : ${JSON.stringify(config.appearance.iconSize)};
      const transform = style.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
      const expectedWidth = expected * (Math.abs(transform.a) + Math.abs(transform.c));
      const expectedHeight = expected * (Math.abs(transform.b) + Math.abs(transform.d));
      if (Math.abs(Number.parseFloat(style.width) - expected) > 0.5
        || Math.abs(Number.parseFloat(style.height) - expected) > 0.5
        || Math.abs(bounds.width - expectedWidth) > 0.5
        || Math.abs(bounds.height - expectedHeight) > 0.5)
        throw new Error('Menu icon geometry: ' + JSON.stringify({
          expected, width: bounds.width, height: bounds.height,
          collapsed: menu.dataset.menuCollapsed, mobile: menu.dataset.menuMobile,
          orientation: menu.dataset.menuOrientation, icon: icon.outerHTML,
          size: getComputedStyle(menu).getPropertyValue('--wr-menu-icon-size')
        }));
      visible++;
    }
    if (visible === 0) throw new Error('Menu has no visible icons');
  }`;
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
    config.mobileIconPosition !== 'right' ||
    !config.searchable ||
    !config.themeToggle ||
    config.searchMode !== 'event' ||
    node.props.marginTop !== 12 ||
    node.props.marginRight !== 16 ||
    node.props.marginBottom !== 20 ||
    node.props.marginLeft !== 24 ||
    config.items[1]?.children?.length !== 2
  )
    throw new Error('Menu editor and saved model disagree.');
  const menuCanvasGeometry = (mobile?: boolean): string => `(() => {
 const wrapper=document.querySelector('[data-designer-node-id="${id}"]');
 const menu=wrapper?.querySelector('.wr-webmenu');
 const hit=document.querySelector('.wr-design-hit[data-component-id="${id}"]');
 const surface=wrapper?.closest('[data-viewport]');
 if (!wrapper || !menu || !hit || !surface) return false;
 const mobile=${mobile === undefined ? 'Number(surface.dataset.viewportWidth) < 768' : String(mobile)};
 if (menu.dataset.menuMobile !== String(mobile)) return false;
 const bounds=wrapper.getBoundingClientRect();
 const visual=menu.getBoundingClientRect();
 const selection=hit.getBoundingClientRect();
 const same=rect => ['left','top','width','height'].every(key=>Math.abs(rect[key]-bounds[key])<=1);
 const scale=surface.getBoundingClientRect().width / surface.clientWidth;
 return bounds.width>0 && same(visual) && same(selection) && (!mobile || Math.abs(bounds.height / scale - 48)<=1);
 })()`;
  // Default follows available canvas width and can legitimately be mobile.
  await ready(menuCanvasGeometry());
  await click('button[role="tab"][aria-label="Responsive"]');
  await click('.wr-viewport-presets button[aria-label="Tablet"]');
  await ready(menuCanvasGeometry(false));
  await click('.wr-viewport-presets button[aria-label="Mobile"]');
  await ready(menuCanvasGeometry(true));
  await click('.wr-viewport-presets button[aria-label="Default"]');
  await ready(menuCanvasGeometry());
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
  // Preview has its own viewport; a desktop Designer preset does not resize it.
  // Keep the compiled desktop checks independent of the runner's window size.
  await setDesktopViewport(window);
  const previous = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
  );
  await ready(
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false && document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved' && document.querySelector('[role="dialog"]') === null`,
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
  let desktopReady = false;
  const deadline = Date.now() + 10000;
  for (;;) {
    frame = findFrame(window.webContents.mainFrame);
    if (
      frame &&
      (await frame.executeJavaScript(
        `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); return innerWidth >= 768 && menu?.dataset.menuMobile === 'false' && menu.dataset.menuOrientation === 'vertical' && menu.querySelector('.wr-menu-search-input') !== null && menu.querySelector('.wr-menu-item') !== null; })()`,
        true,
      )) === true
    ) {
      desktopReady = true;
      break;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!frame || !desktopReady) {
    const evidence = frame
      ? await frame.executeJavaScript(
          `({ width: innerWidth, height: innerHeight,
          mobile: document.querySelector('[data-webrad-id="${id}"]')?.dataset.menuMobile })`,
          true,
        )
      : { frame: 'missing' };
    throw new Error('Compiled Menu desktop Preview is not ready: ' + JSON.stringify(evidence));
  }
  const compiledFrame = frame;
  const evaluatePreviewCheck = async (source: string): Promise<unknown> => {
    // Serialize inside the frame: Electron can reject executeJavaScript with a
    // generic error that omits the assertion and its measurements.
    const result: unknown = await compiledFrame.executeJavaScript(
      `(() => { try { return {ok: true, value: (${source})}; }
      catch (error) { return {ok: false, error: {message: String(error?.message ?? error), stack: String(error?.stack ?? '')}}; } })()`,
      true,
    );
    if (typeof result !== 'object' || result === null || !('ok' in result))
      throw new Error('Menu Preview check did not return evidence: ' + JSON.stringify(result));
    if (result.ok !== true || !('value' in result))
      throw new Error('Menu Preview assertion failed: ' + JSON.stringify(result));
    return result.value;
  };
  const desktopViewport = await frame.executeJavaScript(
    '({ width: innerWidth, height: innerHeight })',
    true,
  );
  const focusPreviewFrame = async (): Promise<void> => {
    // In an out-of-process iframe, enabling emulation updates document.hasFocus
    // without refreshing the local FrameSelection. Transfer focus from the IDE
    // only after emulation is enabled so :focus/:focus-visible update as well.
    // Use Stop to leave the child first, including on the second (mobile) pass.
    const focusDeadline = Date.now() + 10000;
    const waitForFocusedFrame = async (expected: WebFrameMain): Promise<void> => {
      for (;;) {
        if (window.webContents.focusedFrame === expected) return;
        if (Date.now() >= focusDeadline) {
          const actual = window.webContents.focusedFrame;
          throw new Error(
            'Menu Preview frame did not receive focus: ' +
              JSON.stringify({
                expected: { processId: expected.processId, routingId: expected.routingId },
                actual: actual && { processId: actual.processId, routingId: actual.routingId },
              }),
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };
    window.webContents.focus();
    await evaluate(`(() => {
      const stop = document.querySelector('button[aria-label="Stop preview"]');
      if (!(stop instanceof HTMLButtonElement)) throw new Error('Missing Preview focus control.');
      stop.focus({preventScroll: true});
    })()`);
    await waitForFocusedFrame(window.webContents.mainFrame);
    await enableFrameFocus(compiledFrame);
    await evaluate(
      `document.querySelector('iframe[title="WebRAD application preview"]').focus({preventScroll: true})`,
    );
    await waitForFocusedFrame(compiledFrame);
  };
  await focusPreviewFrame();
  const desktop = await evaluatePreviewCheck(
    `(() => {
    const menu = document.querySelector('[data-webrad-id="${id}"]');
    if (!menu || menu.dataset.menuMobile !== 'false') return {error:'Missing desktop Menu',mobile:menu?.dataset.menuMobile};
    (${assertMenuIconGeometry})(menu);
    if (!(${matchesProjectScrollbar})(menu.querySelector('.wr-menu-navigation'))) return {error:'Desktop navigation scrollbar'};
    const originalMode = Theme.mode;
    const originalResolved = Theme.resolvedMode;
    const themeControl = menu.querySelector('[data-menu-action="theme"]');
    if (!(themeControl instanceof HTMLButtonElement)) return {error:'Missing theme switch'};
    const brand = menu.querySelector('.wr-menu-brand');
    if (!themeControl.closest('.wr-menu-header') || themeControl.textContent.trim() !== ''
      || !themeControl.title || !brand || themeControl.getBoundingClientRect().left < brand.getBoundingClientRect().right - 1) return {error:'Theme switch must be an icon in the header opposite the logo'};
    themeControl.focus();
    themeControl.click();
    if (Theme.resolvedMode === originalResolved || document.activeElement !== themeControl
      || themeControl.getAttribute('aria-label') !== (Theme.resolvedMode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')) return {error:'Theme switch did not update theme, label or preserve focus'};
    Theme.mode = originalMode;
    const received=[];
    const onSearch=event=>received.push(event.detail.text);
    menu.addEventListener('search',onSearch);
    const search=menu.querySelector('.wr-menu-search-input');
    if(!search)return {error:'Missing search'};
    const searchFocus = (${assertMenuSearchFocus})(menu);
    const count=menu.querySelectorAll('.wr-menu-item').length;
    search.value='external search';search.dispatchEvent(new Event('input',{bubbles:true}));
    if(received.length!==0||menu.querySelectorAll('.wr-menu-item').length!==count)return {error:'Typing must not submit search or filter items',received,count,actual:menu.querySelectorAll('.wr-menu-item').length};
    search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true}));
    search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,repeat:true}));
    if(received.length!==0)return {error:'Composing or repeating Enter must not submit search',received};
    const submit=()=>{const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});search.dispatchEvent(event);if(!event.defaultPrevented)throw new Error('Search Enter must prevent implicit form submission');};
    submit();
    if(received.length!==1||received[0]!=='external search')return {error:'Search Enter event',received};
    submit();
    if(received.length!==2||received[1]!=='external search')return {error:'Explicit Enter must allow resubmitting unchanged search',received};
    search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
    if(received.length!==2)return {error:'Clearing must not submit search',received};
    submit();
    menu.removeEventListener('search',onSearch);
    if(received.length!==3||received[2]!==''||menu.querySelectorAll('.wr-menu-item').length!==count)return {error:'Empty search Enter event or item visibility',received};

    const toggle = () => menu.querySelector('[data-menu-action="collapse"]');
    const width = menu.getBoundingClientRect().width;
    for (let cycle = 0; cycle < 4; cycle++) {
      toggle().click();
      if (menu.dataset.menuCollapsed !== 'true' || Math.abs(menu.getBoundingClientRect().width - 72) > 1) return {error:'Collapse',collapsed:menu.dataset.menuCollapsed,width:menu.getBoundingClientRect().width,style:menu.getAttribute('style')};
      (${assertMenuIconGeometry})(menu);
      toggle().click();
      if (Math.abs(menu.getBoundingClientRect().width - width) > 1) return {error:'Expanded width restoration',before:width,after:menu.getBoundingClientRect().width,style:menu.getAttribute('style')};
      (${assertMenuIconGeometry})(menu);
    }
    menu.querySelector('[data-menu-item="home"]').click();
    (${assertMenuIconGeometry})(menu);
    return {selected:menu.querySelector('[data-menu-item="home"]').getAttribute('aria-current'),children:menu.querySelector('.wr-menu-submenu').children.length,searchFocus};
  })()`,
  );
  if (
    typeof desktop !== 'object' ||
    desktop === null ||
    !('selected' in desktop) ||
    desktop.selected !== 'page' ||
    !('children' in desktop) ||
    desktop.children !== 2 ||
    !('searchFocus' in desktop)
  )
    throw new Error(
      'Menu desktop project scrollbar, collapse, selection or submenu projection failed: ' +
        JSON.stringify(desktop),
    );
  options.log(
    'renderer Menu search Enter passed: typing/clearing remain silent, Enter submits current or empty text, explicit resubmission, composition/repeat suppression and unchanged items',
  );
  try {
    await focusPreviewFrame();
    await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const mobileDeadline = Date.now() + 10000;
    let mobile = false;
    for (;;) {
      if (
        (await frame.executeJavaScript(
          `innerWidth < 768 && document.querySelector('[data-webrad-id="${id}"]')?.dataset.menuMobile === 'true'`,
          true,
        )) === true
      ) {
        mobile = true;
        break;
      }
      if (Date.now() >= mobileDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!mobile) throw new Error('Menu did not respond to the real mobile viewport.');
    const mobileIconRight = await frame.executeJavaScript(
      `(() => {
        const trigger = document.querySelector('[data-webrad-id="${id}"] .wr-menu-mobile-trigger');
        const icon = trigger?.querySelector('.wr-icon-graphic');
        const label = trigger?.querySelector('.wr-menu-label');
        return Boolean(icon && label && icon.getBoundingClientRect().left >= label.getBoundingClientRect().right);
      })()`,
      true,
    );
    if (mobileIconRight !== true)
      throw new Error('Compiled Menu ignored the mobile icon position.');
    options.log(
      'renderer Menu mobile icon position passed: modal preview, saved right, compiled mobile geometry',
    );
    const mobileViewport = await frame.executeJavaScript(
      '({ width: innerWidth, height: innerHeight })',
      true,
    );
    const drawer = await evaluatePreviewCheck(
      `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); (${assertMenuIconGeometry})(menu); menu.querySelector('[data-menu-action="open"]').click(); (${assertMenuIconGeometry})(menu); const searchFocus = (${assertMenuSearchFocus})(menu); const dialog = menu.querySelector('dialog'); const originalMode = Theme.mode; const originalResolved = Theme.resolvedMode; const themeControl = dialog.querySelector('[data-menu-action="theme"]'); if (!(themeControl instanceof HTMLButtonElement)) return {passed:false,searchFocus}; themeControl.focus(); themeControl.click(); (${assertMenuIconGeometry})(menu); const themeChanged = Theme.resolvedMode !== originalResolved && dialog.open && document.activeElement === themeControl; Theme.mode = originalMode; return {passed:themeChanged && (${matchesProjectScrollbar})(dialog.querySelector('.wr-menu-navigation')) && Math.abs(menu.getBoundingClientRect().height - 48) <= 1 && dialog.open && dialog.contains(document.activeElement) && document.body.style.overflow === 'hidden' && dialog.getBoundingClientRect().width <= innerWidth,searchFocus}; })()`,
    );
    if (
      typeof drawer !== 'object' ||
      drawer === null ||
      !('passed' in drawer) ||
      drawer.passed !== true ||
      !('searchFocus' in drawer)
    )
      throw new Error(
        'Menu mobile drawer lacks project scrollbar, modal focus, viewport sizing or scroll lock: ' +
          JSON.stringify(drawer),
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
    options.log(
      'renderer Menu search focus passed: focused Preview iframe, full rounded search field, icon and input, no inner ring, no layout shift, blur cleanup, desktop and mobile drawer; ' +
        JSON.stringify({ desktop: desktop.searchFocus, mobile: drawer.searchFocus }),
    );
    options.log(
      'renderer Menu compiled viewports passed: ' +
        JSON.stringify({ desktop: desktopViewport, mobile: mobileViewport }),
    );
  } finally {
    await setDesktopViewport(window);
  }
  await stopPreviewSmoke(window);
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
    horizontalNode.bounds.height !== 80 ||
    horizontalNode.props.menuDefinitionId !== sharedDefinition.id ||
    !horizontalSaved.project.menus?.some(
      (menu) =>
        menu.id === sharedDefinition.id &&
        menu.components.some(
          (component) =>
            component.type === 'WebMenu' &&
            parseWebMenuConfiguration(component.props.configuration).orientation === 'horizontal',
        ),
    )
  )
    throw new Error(
      'Horizontal Menu saved layout was not normalized: ' + JSON.stringify(horizontalNode),
    );
  const horizontalDeadline = Date.now() + 10000;
  let horizontal: WebFrameMain | undefined;
  let horizontalReady = false;
  for (;;) {
    horizontal = horizontalFrame(window.webContents.mainFrame);
    if (
      horizontal &&
      (await horizontal.executeJavaScript(
        `(() => { const menu = document.querySelector('[data-webrad-id="${id}"]'); return innerWidth >= 768 && menu?.dataset.menuMobile === 'false' && menu.dataset.menuOrientation === 'horizontal' && menu.querySelector('[data-menu-item="workspace"]') !== null && Math.abs(menu.getBoundingClientRect().height - 80) <= 1; })()`,
        true,
      )) === true
    ) {
      horizontalReady = true;
      break;
    }
    if (Date.now() >= horizontalDeadline) break;
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
 (${assertMenuIconGeometry})(menu);
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
  await stopPreviewSmoke(window);
  await click('button[aria-label="Design"]');
  await click(tree);
  // The two shared configuration edits belong to the definition's history.
  // The page owns insertion, four margins, and the final placement-side edit.
  for (let index = 0; index < 6; index++) {
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
  // Exercise the same Menu interactions through a dragged reusable placement.
  // Temporary documents keep authored smoke handlers out of the original page.
  const resourceRow = (name: string): string =>
    projectExplorerRowExpression(name === page.name ? { id: page.id } : { name });
  const showProjectExplorer = async (): Promise<void> => {
    await click('button[aria-label="Project Explorer"]');
    await ready(`document.querySelector('.wr-project-tree') !== null`);
  };
  const selectResource = async (name: string): Promise<void> => {
    await showProjectExplorer();
    await ready(`${resourceRow(name)} instanceof HTMLElement`);
    await evaluate(`${resourceRow(name)}.click()`);
    await ready(`${resourceRow(name)}?.getAttribute('aria-selected') === 'true'`);
  };
  const createDocument = async (kind: 'page' | 'reusable', name: string): Promise<void> => {
    await showProjectExplorer();
    window.webContents.send(
      'webrad:menu-command',
      kind === 'page' ? 'project.addPage' : 'project.addReusableElement',
    );
    await ready(`document.querySelector('[role="dialog"] input') !== null`);
    if (kind === 'reusable') {
      await ready(
        `document.querySelector('[role="dialog"] select') === null && !document.querySelector('[role="dialog"]').textContent.includes('Responsive menu')`,
      );
      options.log(
        'renderer reusable creation dialog passed: blank composition without the obsolete Responsive menu option or redundant Template selector',
      );
    }
    await evaluate(
      `(() => {const input=document.querySelector('[role="dialog"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await ready(
      `document.querySelector('[role="dialog"] input')?.value === ${JSON.stringify(name)}`,
    );
    await click('[role="dialog"] button[type="submit"]');
    await ready(`document.querySelector('[role="dialog"]') === null`);
    await ready(`${resourceRow(name)}?.getAttribute('aria-selected') === 'true'`);
  };
  const authorItemClick = async (
    handlerName: string,
    code: string,
    senderType = handlerName.startsWith('Menu') ? 'WebMenu' : 'WebReusableElement',
  ): Promise<void> => {
    await click('button[role="tab"][aria-label="Events"]');
    const row = `[...document.querySelectorAll('.wr-inspector-event-row')].find(row => row.querySelector('label')?.textContent === 'OnItemClick')`;
    await ready(`${row} !== undefined`);
    await evaluate(`${row}.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
    await ready(monacoHandlerInputReadyExpression(handlerName));
    await ready(
      `document.querySelector('.monaco-editor')?.textContent?.replaceAll(String.fromCharCode(160),' ').includes(${JSON.stringify(`sender: ${senderType}, event: CustomEvent<WebMenuItemEvent>`)}) === true`,
    );
    await window.webContents.insertText(code + '\n');
    await ready(
      `document.querySelector('.monaco-editor')?.textContent?.includes('menuInteractionOrder') === true`,
    );
    await click('button[aria-label="Design"]');
  };
  const smokePageName = 'MenuInteractionSmoke';
  const smokeMenuName = 'SharedMenuInteractionSmoke';
  await createDocument('page', smokePageName);
  await createDocument('reusable', smokeMenuName);
  await click('button[aria-label="Design"]');
  // Compose the supported blank reusable through the ordinary Menu palette;
  // the former Responsive menu option is intentionally absent from the dialog.
  await ready(
    `[...document.querySelectorAll('.wr-palette-item')].some(item => item.querySelector('.wr-palette-item-caption')?.textContent.trim() === 'Menu')`,
  );
  await evaluate(
    `[...document.querySelectorAll('.wr-palette-item')].find(item => item.querySelector('.wr-palette-item-caption')?.textContent.trim() === 'Menu').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await ready(`document.querySelector('.wr-inspector-selection strong')?.textContent === 'Menu1'`);
  await click('[role="treeitem"][aria-label="Menu1"]');
  await authorItemClick(
    'Menu1ItemClick',
    "document.documentElement.dataset.menuInteractionOrder = 'internal:' + event.detail.itemId; if (event.detail.itemId === 'home') event.preventDefault();",
  );
  await selectResource(smokePageName);
  await ready(`document.querySelector('.wr-page-surface') !== null`);
  await evaluate(`(async () => {
    const button=[...document.querySelectorAll('.wr-palette-item')]
      .find(item=>item.querySelector('.wr-palette-item-caption')?.textContent.trim()==='Button');
    if (!(button instanceof HTMLButtonElement)) throw new Error('Missing Button drag source.');
    const dataTransfer=new DataTransfer();
    const surface=document.querySelector('.wr-design-overlay');
    const count=surface.querySelectorAll('.wr-design-hit').length;
    button.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const bounds=surface.getBoundingClientRect();
    surface.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,clientX:bounds.left+40,clientY:bounds.top+60}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const feedback=surface.querySelector('.wr-insertion-feedback');
    const ghost=feedback?.querySelector('.wr-drop-ghost');
    if (!(ghost instanceof HTMLElement) || ghost.getBoundingClientRect().width<=0 ||
        getComputedStyle(ghost).borderTopStyle!=='dashed' ||
        getComputedStyle(ghost).borderTopColor!=='rgb(251, 191, 36)' ||
        feedback.querySelector('.wr-drop-caption') !== null ||
        !feedback.getAttribute('aria-label')?.includes('Button') ||
        surface.querySelectorAll('.wr-design-hit').length!==count)
      throw new Error('Palette drag lacks the visible component footprint or inserted before drop.');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    button.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if (surface.querySelector('.wr-insertion-feedback') ||
        surface.querySelectorAll('.wr-design-hit').length!==count)
      throw new Error('Escape did not cancel palette feedback without inserting.');
  })()`);
  const placementIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    await showProjectExplorer();
    await evaluate(
      `(async () => {
        const row=${resourceRow(smokeMenuName)};
        const dataTransfer=new DataTransfer();
        row.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
        const surface=document.querySelector('.wr-design-overlay');
        const bounds=surface.getBoundingClientRect();
        const coordinates={clientX:bounds.left+10,clientY:bounds.top+10};
        const count=surface.querySelectorAll('.wr-design-hit').length;
        surface.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer,...coordinates}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const feedback=surface.querySelector('.wr-insertion-feedback');
        const highlight=feedback?.querySelector('.wr-drop-parent-highlight');
        const parentId=document.querySelector('.wr-page-surface [data-designer-parent-id]')?.dataset.designerParentId;
        if (!feedback || feedback.dataset.dropParentId!==parentId || feedback.dataset.dropValid!=='true' ||
            !(highlight instanceof HTMLElement) || highlight.getBoundingClientRect().width<=0 ||
            getComputedStyle(highlight).borderTopStyle!=='solid' ||
            getComputedStyle(highlight).borderTopColor!=='rgb(251, 191, 36)' ||
            getComputedStyle(feedback).pointerEvents!=='none' ||
            feedback.querySelector('.wr-drop-caption') !== null ||
            !feedback.getAttribute('aria-label')?.includes(${JSON.stringify(smokeMenuName)}) ||
            surface.querySelectorAll('.wr-design-hit').length!==count)
          throw new Error('Reusable drag lacks visible parent feedback or mutates the canvas before drop.');
        surface.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,...coordinates}));
        row.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if (surface.querySelector('.wr-insertion-feedback'))
          throw new Error('Insertion feedback remained after drop.');
      })()`,
    );
    await ready(
      `document.querySelector('.wr-inspector-selection strong')?.textContent === 'Reusable${String(index + 1)}'`,
    );
    const placementId = await evaluate(
      `document.querySelector('.wr-inspector-selection')?.getAttribute('title')`,
    );
    if (typeof placementId !== 'string') throw new Error('Dragged Menu has no placement ID.');
    placementIds.push(placementId);
    await click('button[role="tab"][aria-label="Events"]');
    await ready(
      `[...document.querySelectorAll('.wr-inspector-event-row label')].map(label=>label.textContent).sort().join(',') === 'OnBrandClick,OnClose,OnCollapseChange,OnItemClick,OnItemToggle,OnOpen,OnSearch,OnSelectionChange,OnUserClick'`,
    );
    await authorItemClick(
      `Reusable${String(index + 1)}ItemClick`,
      "document.documentElement.dataset.menuInteractionOrder += ':page:' + sender.id + ':' + event.detail.itemId + ':' + String(event.defaultPrevented); event.preventDefault();",
    );
  }
  options.log(
    'renderer Designer insertion feedback passed: palette footprint, reusable parent outline and name, no insertion before drop, Escape cancellation and cleanup',
  );
  const nativePlacementIds: string[] = [];
  for (let index = 0; index < 2; index++) {
    await ready(
      `[...document.querySelectorAll('.wr-palette-item')].some(item => item.querySelector('.wr-palette-item-caption')?.textContent.trim() === 'Menu')`,
    );
    await evaluate(`(async () => {
      const item = [...document.querySelectorAll('.wr-palette-item')].find(item => item.querySelector('.wr-palette-item-caption')?.textContent.trim() === 'Menu');
      const surface = document.querySelector('.wr-design-overlay');
      const bounds = surface.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      const coordinates = { clientX: bounds.left + 20, clientY: bounds.top + 20 };
      item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      surface.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, ...coordinates }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      surface.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, ...coordinates }));
      item.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    })()`);
    await ready(
      `document.querySelector('.wr-inspector-selection strong')?.textContent === 'Menu${String(index + 1)}'`,
    );
    const nativeId = await evaluate(
      `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
    );
    if (typeof nativeId !== 'string')
      throw new Error('Native Menu drag did not create a placement.');
    nativePlacementIds.push(nativeId);
    if (index === 0) {
      await click('button[role="tab"][aria-label="Properties"]');
      await click('button[aria-label="Configure Menu"]');
      await ready(`document.querySelector('.wr-menu-configuration-dialog') !== null`);
      await evaluate(
        `[...document.querySelectorAll('.wr-menu-editor-tabs button')].find(button => button.textContent === 'Behavior & layout').click()`,
      );
      await evaluate(
        `(() => { const select = ${field('Desktop orientation')}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'vertical'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      );
      await click('.wr-menu-configuration-dialog button[type="submit"]');
      await ready(`document.querySelector('.wr-menu-configuration-dialog') === null`);
    }
    await authorItemClick(
      `Menu${String(index + 1)}ItemClick`,
      "document.documentElement.dataset.menuInteractionOrder += ':page:' + sender.id + ':' + event.detail.itemId + ':' + String(event.defaultPrevented); event.preventDefault();",
      'WebMenu',
    );
    if (index === 0) {
      await click('button[role="tab"][aria-label="Properties"]');
      await click('button[aria-label="Edit shared menu"]');
      await ready(
        `document.querySelector('.wr-inspector-selection strong')?.textContent === ${JSON.stringify(sharedRoot.name)}`,
      );
      await authorItemClick(
        `${sharedRoot.name}ItemClick`,
        "document.documentElement.dataset.menuInteractionOrder = 'internal:' + event.detail.itemId; this.searchText = event.detail.itemId; if (event.detail.itemId === 'home') event.preventDefault();",
        'WebMenu',
      );
      await selectResource(smokePageName);
    }
  }
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const interactionSession = await loadProjectFiles(options.projectPath);
  const interactionPage = interactionSession.project.pages.find(
    (candidate) => candidate.name === smokePageName,
  );
  const interactionMenu = interactionSession.project.reusableElements.find(
    (candidate) => candidate.name === smokeMenuName,
  );
  if (
    !nativePlacementIds.every((placementId, index) =>
      interactionPage?.components.some(
        (candidate) =>
          candidate.id === placementId &&
          candidate.type === 'WebMenu' &&
          candidate.props.menuDefinitionId === sharedDefinition.id &&
          candidate.props.configuration === undefined &&
          candidate.events.OnItemClick === `Menu${String(index + 1)}ItemClick`,
      ),
    )
  )
    throw new Error(
      'Native Menu placements did not preserve their shared definition and local event bindings.',
    );
  if (
    !interactionMenu?.components.some(
      (candidate) =>
        candidate.type === 'WebMenu' && candidate.events.OnItemClick === 'Menu1ItemClick',
    ) ||
    !placementIds.every((placementId, index) =>
      interactionPage?.components.some(
        (candidate) =>
          candidate.id === placementId &&
          candidate.events.OnItemClick === `Reusable${String(index + 1)}ItemClick`,
      ),
    )
  )
    throw new Error('Reusable Menu Interaction bindings were not saved.');
  const previousInteractionPreview = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src') ?? ''`,
  );
  await ready(
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false`,
  );
  await evaluate(
    `window.dispatchEvent(new KeyboardEvent('keydown',{key:'F9',bubbles:true,cancelable:true}))`,
  );
  await ready(
    `(() => {const src=document.querySelector('iframe[title="WebRAD application preview"]')?.getAttribute('src');return Boolean(src && src !== ${JSON.stringify(previousInteractionPreview)});})()`,
  );
  const interactionUrl = await evaluate(
    `document.querySelector('iframe[title="WebRAD application preview"]').getAttribute('src')`,
  );
  const interactionFrameRoot = new URL('./', String(interactionUrl)).href;
  const findInteractionFrame = (candidate: WebFrameMain): WebFrameMain | undefined =>
    candidate.url.startsWith(interactionFrameRoot)
      ? candidate
      : candidate.frames.map(findInteractionFrame).find((child) => child !== undefined);
  const interactionDeadline = Date.now() + 10000;
  let interactionsPassed = false;
  for (;;) {
    const interactionFrame = findInteractionFrame(window.webContents.mainFrame);
    if (interactionFrame) {
      interactionsPassed =
        (await interactionFrame.executeJavaScript(
          `(() => {
            if (typeof Navigate !== 'function') return false;
            Navigate(${JSON.stringify(smokePageName)});
            const placements = ${JSON.stringify(placementIds)}.map(id =>
              document.querySelector('[data-webrad-id="' + id + '"]'));
            if (placements.some(host => !host?.querySelector('[data-menu-item="home"]')))
              throw new Error('Compiled reusable Menu placements are missing');
            for (const host of placements) {
              const menu = host.querySelector('.wr-webmenu');
              const selection = () => menu.querySelector('[aria-current="page"]')?.getAttribute('data-menu-item') ?? null;
              const selected = selection();
              for (const itemId of ['home', 'settings']) {
                document.documentElement.dataset.menuInteractionOrder = '';
                menu.querySelector('[data-menu-item="' + itemId + '"]').click();
                const expected = 'internal:' + itemId + ':page:' + host.dataset.webradId + ':' + itemId + ':' + String(itemId === 'home');
                if (document.documentElement.dataset.menuInteractionOrder !== expected)
                  throw new Error('Menu handler order/isolation: ' + document.documentElement.dataset.menuInteractionOrder);
                if (selection() !== selected)
                  throw new Error('Menu cancellation did not preserve selection');
              }
              for (let cycle = 0; cycle < 4; cycle++) {
                for (const collapsed of [true, false]) {
                  menu.querySelector('[data-menu-action="collapse"]').click();
                  if (menu.dataset.menuCollapsed !== String(collapsed))
                    throw new Error('Reusable Menu collapse state did not change');
                  (${assertMenuIconGeometry})(menu);
                }
              }
            }
            const nativeMenus = ${JSON.stringify(nativePlacementIds)}.map(id => document.querySelector('[data-webrad-id="' + id + '"]'));
            if (nativeMenus.some(menu => !menu?.querySelector('[data-menu-item="home"]')))
              throw new Error('Compiled native Menu placements are missing');
            for (const menu of nativeMenus) {
              const other = nativeMenus.find(candidate => candidate !== menu);
              const otherSearch = other.querySelector('.wr-menu-search-input').value;
              const otherCollapsed = other.dataset.menuCollapsed;
              const selected = menu.querySelector('[aria-current="page"]')?.getAttribute('data-menu-item') ?? null;
              for (const itemId of ['home', 'settings']) {
                document.documentElement.dataset.menuInteractionOrder = '';
                menu.querySelector('[data-menu-item="' + itemId + '"]').click();
                const expected = 'internal:' + itemId + ':page:' + menu.dataset.webradId + ':' + itemId + ':' + String(itemId === 'home');
                if (document.documentElement.dataset.menuInteractionOrder !== expected)
                  throw new Error('Native Menu handler order/cancellation: ' + document.documentElement.dataset.menuInteractionOrder);
                if ((menu.querySelector('[aria-current="page"]')?.getAttribute('data-menu-item') ?? null) !== selected)
                  throw new Error('Native Menu cancellation changed selection');
                if (menu.querySelector('.wr-menu-search-input').value !== itemId || other.querySelector('.wr-menu-search-input').value !== otherSearch)
                  throw new Error('Native Menu authored state leaked between placements');
              }
              for (const collapsed of [true, false]) {
                menu.querySelector('[data-menu-action="collapse"]').click();
                if (menu.dataset.menuCollapsed !== String(collapsed) || other.dataset.menuCollapsed !== otherCollapsed)
                  throw new Error('Native Menu collapse state leaked between placements');
              }
            }
            return true;
          })()`,
          true,
        )) === true;
      if (interactionsPassed) break;
    }
    if (Date.now() >= interactionDeadline) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!interactionsPassed)
    throw new Error('Reusable Menu Interaction Preview did not become ready.');
  options.log(
    'renderer reusable Menu Interaction passed: nine Inspector events, typed page/internal authoring, persisted bindings, compiled F9 internal-before-page order, two isolated placements and cancellation in either handler',
  );
  options.log(
    'renderer native shared Menu Interaction passed: palette drag, shared TypeScript root, typed page handlers, persisted references, compiled F9 internal-before-page order, cancellation, independent search and collapse in two placements',
  );
  await stopPreviewSmoke(window);
  const createdMenuNames = original.project.menus?.some((menu) => menu.id === sharedDefinition.id)
    ? []
    : [sharedDefinition.name];
  for (const name of [smokePageName, smokeMenuName, ...createdMenuNames]) {
    await selectResource(name);
    await ready(
      `document.querySelector('[aria-label="Delete selected project item"]')?.title === ${JSON.stringify(`Delete ${name}`)}`,
    );
    await evaluate(
      `(() => {const original=window.confirm;window.confirm=()=>true;try{document.querySelector('[aria-label="Delete selected project item"]').click();}finally{window.confirm=original;}})()`,
    );
    await ready(`${resourceRow(name)} === undefined`);
  }
  await selectResource(page.name);
  await click('button[aria-label="Design"]');
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  options.log(
    'renderer Menu icon geometry passed: configured SVG size, 16px disclosures, repeated desktop and reusable collapse/expand, mobile trigger/drawer, horizontal flyouts and theme changes',
  );
  options.log(
    `renderer Menu Inspector and F9 passed: project scrollbar, Light/Dark switch configuration and local preview, persisted themeToggle, desktop/mobile application theme and focus, header icon opposite logo, nested items, persistence, desktop collapse/selection, mobile viewport, modal focus/Escape, undo; screenshot ${screenshot}`,
  );
}
