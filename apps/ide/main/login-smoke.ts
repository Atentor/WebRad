import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, WebFrameMain } from 'electron';
import { parseWebLoginConfiguration } from '@webrad/runtime/login-model';
import { bindDefaultStylesToTheme, createDefaultComponentStyles } from '@webrad/project-model';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { loadProjectFiles, saveProjectFiles } from './project-files';
import { stopPreviewSmoke } from './preview-workspace-smoke';

/** Real palette/configuration/save/F9 interactions; authentication uses the RestGo HTTP fixture. */
export async function runLoginSmoke(
  window: BrowserWindow,
  {
    projectPath,
    log,
  }: {
    readonly projectPath: string;
    readonly log: (message: string) => void;
  },
): Promise<void> {
  const evaluate = (source: string): Promise<unknown> =>
    window.webContents.executeJavaScript(source, true);
  const ready = async (expression: string): Promise<void> => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === true) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const evidence = await evaluate(`(() => {
      const modal = document.querySelector('.wr-login-configuration-dialog');
      const bounds = selector => modal?.querySelector(selector)?.getBoundingClientRect().toJSON();
      const style = selector => {
        const node = modal?.querySelector(selector);
        if (!node) return null;
        const computed = getComputedStyle(node);
        return { backgroundImage: computed.backgroundImage, boxShadow: computed.boxShadow,
          padding: computed.padding, zoom: computed.zoom, styleId: node.dataset.loginStyleId };
      };
      const body = modal?.querySelector('.wr-menu-editor-body');
      const canvas = modal?.querySelector('.wr-login-editor-preview-canvas');
      return { viewport: [innerWidth, innerHeight], modal: modal?.getBoundingClientRect().toJSON(),
        header: bounds('.wr-modal-header'), footer: bounds('.wr-modal-actions'), close: bounds('.wr-modal-close'),
        body: bounds('.wr-menu-editor-body'), preview: bounds('.wr-login-editor-preview'),
        fields: [...(modal?.querySelectorAll('.wr-login-editor-fields > .wr-menu-editor-field') ?? [])]
          .map(node => node.getBoundingClientRect().toJSON()),
        bodyWidth: body && [body.clientWidth, body.scrollWidth], canvasWidth: canvas && [canvas.clientWidth, canvas.scrollWidth],
        button: style('.wr-login-submit'), input: style('.wr-login-input[name="email"]'),
        form: style('.wr-login-form'), surface: style('.wr-login-editor-preview-surface') };
    })()`);
    const screenshot = path.resolve('node_modules/.cache/webrad-login-failure.png');
    await fs.writeFile(screenshot, (await window.webContents.capturePage()).toPNG());
    throw new Error(
      `Login smoke timed out: ${expression}; evidence=${JSON.stringify(evidence)}; screenshot=${screenshot}`,
    );
  };
  const click = async (selector: string): Promise<void> => {
    await ready(`document.querySelector(${JSON.stringify(selector)}) instanceof HTMLElement`);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const baseline = await loadProjectFiles(projectPath);
  const dependencies = defaultComponentRegistry.require('WebLogin').styleDependencies ?? [];
  const missingStyles = bindDefaultStylesToTheme(
    createDefaultComponentStyles(baseline.project.id),
    baseline.project.settings.themes,
  ).filter(
    (style) =>
      dependencies.includes(style.componentType) &&
      !baseline.project.styles.some(
        (existing) =>
          existing.componentType === style.componentType && existing.preset === 'default',
      ),
  );
  const reloadProject = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      window.webContents.once('did-finish-load', () => resolve());
      window.webContents.reload();
    });
    await ready(`document.querySelector('[role="treeitem"][data-component-id]') !== null`);
  };
  // The legacy HelloWebRad fixture predates the field/container default library.
  // Seed only the missing Login dependencies in its smoke-owned copy; all
  // configuration, selection, persistence and F9 assertions still use the real UI.
  await saveProjectFiles({
    ...baseline,
    project: {
      ...baseline.project,
      styles: [...baseline.project.styles, ...missingStyles],
      settings: {
        ...baseline.project.settings,
        // Anonymous startup requires no HTTP request. Real authentication is
        // exercised separately by the existing RestGo HTTP fixture workflow.
        restGo: {
          ...baseline.project.settings.restGo,
          enabled: true,
          baseUrl: 'https://login-visual.webrad.invalid',
          apiToken: '',
          persistSession: false,
          sessionStorage: 'memory',
        },
      },
    },
  });
  await reloadProject();
  const original = await loadProjectFiles(projectPath);
  const page = original.project.pages.find((entry) => entry.name === 'index');
  if (!page) throw new Error('Login smoke requires the index page.');
  const panelStyle = original.project.styles.find(
    (style) => style.componentType === 'WebPanel' && style.preset === 'default',
  );
  const editStyle = original.project.styles.find(
    (style) => style.componentType === 'WebEdit' && style.preset === 'default',
  );
  const labelStyle = original.project.styles.find(
    (style) => style.componentType === 'WebLabel' && style.preset === 'default',
  );
  const buttonStyle = original.project.styles.find(
    (style) => style.componentType === 'WebButton' && style.preset === 'default',
  );
  const popupStyle = original.project.styles.find(
    (style) => style.componentType === 'WebPopup' && style.preset === 'default',
  );
  if (!panelStyle || !editStyle || !labelStyle || !buttonStyle || !popupStyle)
    throw new Error('Login style binding smoke requires the project default styles.');
  const root = `[role="treeitem"][data-component-id=${JSON.stringify(page.rootComponentId)}]`;
  const dialog = '.wr-login-configuration-dialog';
  const tab = async (name: string): Promise<void> => {
    await evaluate(
      `[...document.querySelectorAll('${dialog} nav button')].find(button => button.textContent === ${JSON.stringify(name)}).click()`,
    );
  };
  const field = async (label: string, value: string): Promise<void> => {
    await evaluate(`(() => {
      const label = [...document.querySelectorAll('${dialog} .wr-menu-editor-field')].find(item => item.querySelector('span')?.textContent === ${JSON.stringify(label)});
      const input = label?.querySelector('input, textarea, select');
      if (!input) throw new Error('Missing Login field');
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`);
  };
  const insert = async (): Promise<string> => {
    await click(root);
    const palette = '[data-palette-component-type="WebLogin"]';
    await ready(`document.querySelector(${JSON.stringify(palette)}) instanceof HTMLButtonElement`);
    await evaluate(`document.querySelector(${JSON.stringify(palette)}).focus()`);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    await ready(
      `document.querySelector('.wr-inspector-selection strong')?.textContent?.startsWith('Login') === true`,
    );
    const id = await evaluate(
      `document.querySelector('.wr-inspector-selection').getAttribute('title')`,
    );
    if (typeof id !== 'string') throw new Error('Login insertion has no stable identity.');
    await click('button[aria-label="Configure Login"]');
    await ready(`document.querySelector('${dialog}') !== null`);
    await ready(`(() => {
      const modal = document.querySelector('${dialog}');
      const bounds = modal.getBoundingClientRect();
      const body = modal.querySelector('.wr-menu-editor-body');
      const header = modal.querySelector('.wr-modal-header').getBoundingClientRect();
      const footer = modal.querySelector('.wr-modal-actions').getBoundingClientRect();
      const close = modal.querySelector('.wr-modal-close').getBoundingClientRect();
      const fields = [...modal.querySelectorAll('.wr-login-editor-fields > .wr-menu-editor-field')];
      const preview = modal.querySelector('.wr-login-editor-preview').getBoundingClientRect();
      const canvas = modal.querySelector('.wr-login-editor-preview-canvas');
      const sample = modal.querySelector('.wr-login-submit');
      const sampleStyle = getComputedStyle(sample);
      const sideBySide = bounds.width <= 800 || Math.abs(fields[0].getBoundingClientRect().top - fields[1].getBoundingClientRect().top) <= 1;
      return bounds.width <= 1041 && bounds.height <= 621
        && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight
        && header.height <= 64 && close.width === 28 && close.height === 28
        && footer.bottom <= bounds.bottom && footer.top >= body.getBoundingClientRect().bottom - 1
        && body.scrollWidth <= body.clientWidth + 1 && sideBySide
        && (bounds.width <= 800 || preview.width >= body.clientWidth * 0.49)
        && canvas.scrollWidth <= canvas.clientWidth + 1
        && sampleStyle.backgroundImage.includes('linear-gradient')
        && sampleStyle.boxShadow !== 'none'
        && sample.dataset.loginStyleId === ${JSON.stringify(buttonStyle.id)}
        && getComputedStyle(modal.querySelector('.wr-login-input[name="email"]')).backgroundImage.includes('linear-gradient')
        && getComputedStyle(modal.querySelector('.wr-login-form')).padding === '0px'
        && getComputedStyle(modal.querySelector('.wr-login-editor-preview-surface')).zoom === '0.85';
    })()`);
    return id;
  };
  const saveConfiguration = async (): Promise<void> => {
    await click(`${dialog} .wr-modal-actions .primary`);
    await ready(`document.querySelector('${dialog}') === null`);
  };
  await click('button[aria-label="Design"]');
  await click('button[role="tab"][aria-label="Properties"]');
  const panelId = await insert();
  await field('Initial view', 'register');
  await tab('Texts');
  await field('Registration title', 'Login smoke registration');
  await tab('Styles');
  await field('Email input', '');
  await ready(
    `document.querySelector('${dialog} .wr-login-input[name="email"]')?.dataset.loginStyled === undefined`,
  );
  await field('Email input', editStyle.id);
  await field('Title', labelStyle.id);
  await field('Panel', panelStyle.id);
  await field('Submit button', buttonStyle.id);
  await ready(`(() => {
    const modal = document.querySelector('${dialog}');
    const select = modal.querySelector('select[aria-label="Style for Login Email input"]');
    return !modal.querySelector('input[type="color"]')
      && ![...select.options].some(option => option.value === ${JSON.stringify(panelStyle.id)})
      && modal.querySelector('.wr-login-input[name="email"]').dataset.loginStyleId === ${JSON.stringify(editStyle.id)}
      && modal.querySelector('.wr-login-title').dataset.loginStyleId === ${JSON.stringify(labelStyle.id)};
  })()`);
  await tab('Recovery');
  await field('Recovery title', 'Login smoke recovery');
  for (const view of ['recovery', 'reset', 'register']) {
    await evaluate(`(() => {
      const select = document.querySelector('select[aria-label="Login preview view"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(view)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await ready(
      `document.querySelector('${dialog} .wr-weblogin')?.dataset.loginView === ${JSON.stringify(view)}`,
    );
  }
  const screenshot = path.resolve('node_modules', '.cache', 'webrad-login-configurator.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('Login configuration screenshot is empty.');
  await fs.writeFile(screenshot, capture.toPNG());
  await saveConfiguration();
  const popupId = await insert();
  await field('Presentation', 'popup');
  await ready(`(() => {
    const popup = document.querySelector('${dialog} .wr-login-static-popup');
    const close = popup?.querySelector('.wr-login-close');
    return popup?.dataset.loginStyleId === ${JSON.stringify(popupStyle.id)}
      && close instanceof HTMLButtonElement && !close.hidden
      && popup.querySelector('[data-webrad-popup-children] .wr-login-panel') !== null;
  })()`);
  await saveConfiguration();
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const saved = await loadProjectFiles(projectPath);
  const nodes = saved.project.pages.flatMap((entry) => entry.components);
  const panel = nodes.find((node) => node.id === panelId);
  const popup = nodes.find((node) => node.id === popupId);
  const panelConfiguration = parseWebLoginConfiguration(panel?.props.configuration);
  const popupConfiguration = parseWebLoginConfiguration(popup?.props.configuration);
  if (
    panel?.type !== 'WebLogin' ||
    popup?.type !== 'WebLogin' ||
    panelConfiguration.initialView !== 'register' ||
    panel.layout.item.height !== 'fit-content' ||
    popup.layout.item.height !== 'fit-content' ||
    panelConfiguration.texts.registerTitle !== 'Login smoke registration' ||
    panelConfiguration.styles?.panel !== panelStyle.id ||
    panelConfiguration.styles?.email !== editStyle.id ||
    panelConfiguration.styles?.title !== labelStyle.id ||
    panelConfiguration.styles?.submit !== buttonStyle.id ||
    panelConfiguration.recovery?.texts.requestTitle !== 'Login smoke recovery' ||
    panelConfiguration.recovery?.enabled !== true ||
    popupConfiguration.presentation !== 'popup'
  )
    throw new Error('Login saved configuration or identity differs.');
  await ready(
    `document.querySelector('button[aria-label="Build and run (F9)"]')?.disabled === false`,
  );
  await click('button[aria-label="Build and run (F9)"]');
  const previewSelector = 'iframe[title="WebRAD application preview"]';
  await ready(`!!document.querySelector('${previewSelector}')?.getAttribute('src')`);
  const url = await evaluate(`document.querySelector('${previewSelector}').getAttribute('src')`);
  const deadline = Date.now() + 20_000;
  let frame: WebFrameMain | undefined;
  const findFrame = (parent: WebFrameMain): WebFrameMain | undefined =>
    parent.url === url ? parent : parent.frames.map(findFrame).find((child) => child !== undefined);
  while (Date.now() < deadline) {
    frame = findFrame(window.webContents.mainFrame);
    if (
      frame &&
      (await frame.executeJavaScript(
        `document.querySelector('.wr-login-dialog')?.open === true`,
        true,
      )) === true
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (
    !frame ||
    (await frame.executeJavaScript(
      `document.querySelector('.wr-login-dialog')?.open === true`,
      true,
    )) !== true
  )
    throw new Error('Login compiled Popup did not open.');
  try {
    const result = await frame.executeJavaScript(
      `(async () => {
      const popup = document.querySelector('.wr-login-dialog');
      if (!popup.matches(':modal') || !popup.contains(document.activeElement)) throw new Error('Popup is not modal or lacks focus');
      popup.querySelector('[data-login-action="recovery"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const recovery = document.querySelector('.wr-login-dialog');
      if (!recovery.open || !recovery.querySelector('input[name="password"]').disabled
          || recovery.querySelector('input[name="email"]').disabled)
        throw new Error('Popup recovery did not preserve its modal or email-only form');
      recovery.querySelector('[data-login-action="login"]').click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const reopened = document.querySelector('.wr-login-dialog');
      reopened.querySelector('.wr-login-close').click();
      const panel = document.querySelector('[data-webrad-id=${JSON.stringify(panelId)}]');
      const title = panel.querySelector('.wr-login-title');
      const field = panel.querySelector('.wr-login-input');
      const buttonBounds = panel.querySelector('.wr-login-submit').getBoundingClientRect();
      const panelBounds = panel.querySelector('.wr-login-panel').getBoundingClientRect();
      return { passed: !reopened.open && title.textContent === 'Login smoke registration'
        && panel.querySelector('input[name="fullName"]').required
        && panel.querySelector('.wr-login-panel').dataset.loginStyleId === ${JSON.stringify(panelStyle.id)}
        && field.dataset.loginStyleId === ${JSON.stringify(editStyle.id)}
        && title.dataset.loginStyleId === ${JSON.stringify(labelStyle.id)}
        && panel.querySelector('.wr-login-submit').dataset.loginStyleId === ${JSON.stringify(buttonStyle.id)}
        && Math.abs(buttonBounds.left + buttonBounds.width / 2 - panelBounds.left - panelBounds.width / 2) <= 1
        && buttonBounds.width < field.getBoundingClientRect().width
        && panel.querySelector('.wr-login-submit').style.width === 'fit-content'
        && getComputedStyle(panel.querySelector('.wr-login-panel')).backgroundImage.includes('linear-gradient')
        && getComputedStyle(panel.querySelector('.wr-login-submit')).backgroundImage.includes('linear-gradient')
        && getComputedStyle(field).backgroundImage.includes('linear-gradient')
        && getComputedStyle(field).fontSize === '14px'
        && field.getBoundingClientRect().height <= 40
        && getComputedStyle(panel.querySelector('.wr-login-fields')).gap === '8px'
        && getComputedStyle(panel.querySelector('.wr-login-panel')).padding === '20px'
        && panel.querySelector('.wr-login-panel').getBoundingClientRect().height <= 500
        && panel.querySelector('.wr-login-options .wr-login-link') !== null,
        evidence: { open: reopened.open, title: title.textContent,
          fullNameRequired: panel.querySelector('input[name="fullName"]').required,
          panelStyleId: panel.querySelector('.wr-login-panel').dataset.loginStyleId,
          inputStyleId: field.dataset.loginStyleId, titleStyleId: title.dataset.loginStyleId,
          buttonStyleId: panel.querySelector('.wr-login-submit').dataset.loginStyleId,
          buttonBounds: buttonBounds.toJSON(), panelBounds: panelBounds.toJSON(), fieldBounds: field.getBoundingClientRect().toJSON(),
          buttonWidth: panel.querySelector('.wr-login-submit').style.width,
          panelBackground: getComputedStyle(panel.querySelector('.wr-login-panel')).backgroundImage,
          buttonBackground: getComputedStyle(panel.querySelector('.wr-login-submit')).backgroundImage,
          inputBackground: getComputedStyle(field).backgroundImage,
          inputFontSize: getComputedStyle(field).fontSize,
          gap: getComputedStyle(panel.querySelector('.wr-login-fields')).gap,
          padding: getComputedStyle(panel.querySelector('.wr-login-panel')).padding,
          optionsLink: panel.querySelector('.wr-login-options .wr-login-link') !== null,
          rows: [...panel.querySelector('.wr-login-fields').children].map(node => ({
            className: node.className, hidden: node.hidden, height: node.getBoundingClientRect().height,
            margin: getComputedStyle(node).margin, padding: getComputedStyle(node).padding,
          })),
          heading: [title, panel.querySelector('.wr-login-subtitle')].map(node => ({
            height: node.getBoundingClientRect().height, margin: getComputedStyle(node).margin,
            text: node.textContent, whiteSpace: getComputedStyle(node).whiteSpace,
          })),
        } };
    })()`,
      true,
    );
    if (typeof result !== 'object' || result === null || Reflect.get(result, 'passed') !== true)
      throw new Error(
        `Compiled Login Panel differs from its saved configuration: ${JSON.stringify(result)}`,
      );
    await click('.wr-preview-viewports button[aria-label="Mobile"]');
    const mobile = await frame.executeJavaScript(
      `(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = document.querySelector('[data-webrad-id=${JSON.stringify(panelId)}]');
      const input = panel.querySelector('input[name="email"]');
      const original = [panel.style.getPropertyValue('width'), panel.style.getPropertyPriority('width')];
      panel.style.setProperty('width', '280px', 'important');
      try {
        await new Promise(resolve => requestAnimationFrame(resolve));
        // Project input styles transition size changes. Measure the settled
        // mobile controls after those real CSS animations finish.
        await Promise.all(input.getAnimations().map(animation => animation.finished));
        const body = panel.querySelector('.wr-login-panel');
        return { passed: innerWidth === 390 && body.scrollWidth <= body.clientWidth + 1
          && getComputedStyle(body).padding === '20px'
          && input.getBoundingClientRect().width <= body.getBoundingClientRect().width
          && parseFloat(getComputedStyle(input).fontSize) >= 16
          && parseFloat(getComputedStyle(input).minHeight) >= 44,
          evidence: { width: innerWidth, bodyWidth: [body.clientWidth, body.scrollWidth],
            padding: getComputedStyle(body).padding, inputWidth: input.getBoundingClientRect().width,
            panelWidth: body.getBoundingClientRect().width, fontSize: getComputedStyle(input).fontSize,
            minHeight: getComputedStyle(input).minHeight } };
      } finally { panel.style.setProperty('width', original[0], original[1]); }
    })()`,
      true,
    );
    if (typeof mobile !== 'object' || mobile === null || Reflect.get(mobile, 'passed') !== true)
      throw new Error(
        `Login mobile fields overflow or lose touch sizing: ${JSON.stringify(mobile)}`,
      );
    await click('.wr-preview-viewports button[aria-label="Desktop"]');
  } finally {
    await stopPreviewSmoke(window);
  }
  await click('button[aria-label="Design"]');
  for (const id of [popupId, panelId]) {
    const tree = `[role="treeitem"][data-component-id=${JSON.stringify(id)}]`;
    await click(tree);
    await evaluate(
      `document.querySelector(${JSON.stringify(tree)}).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))`,
    );
    await ready(`document.querySelector(${JSON.stringify(tree)}) === null`);
  }
  await click(root);
  await click('button[aria-label="Save (Ctrl+S)"]');
  await ready(`document.querySelector('.wr-toolbar-save-state')?.textContent?.trim() === 'Saved'`);
  const restored = await loadProjectFiles(projectPath);
  const seededIds = new Set(missingStyles.map((style) => style.id));
  await saveProjectFiles({
    ...restored,
    project: {
      ...restored.project,
      styles: restored.project.styles.filter((style) => !seededIds.has(style.id)),
      settings: { ...restored.project.settings, restGo: baseline.project.settings.restGo },
    },
  });
  await reloadProject();
  log(
    `renderer Login configuration and F9 passed: compact editor; Aurora appearance; compact template; project styles; palette, compatible per-element Style/None bindings and persistence, native Popup modal and close, Panel, 390px mobile fields; screenshot ${screenshot}`,
  );
}
