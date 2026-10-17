import type { BrowserWindow } from 'electron';
import type {
  DebugEvaluation,
  DebugFrame,
  DebugStartRequest,
  DebugStartResponse,
  DebugState,
  DebugVariable,
} from '../shared/debugger-contracts';
import { loadProjectFiles, saveProjectFiles } from './project-files';
import { getDebugPreviewWindow, getDebugState } from './debugger-ipc';

/** Real Electron CDP, typed preload IPC, compilation, source maps, and debugger controls. */
export async function runDebuggerSmoke(
  window: BrowserWindow,
  projectPath: string,
  log: (message: string) => void,
): Promise<void> {
  log('renderer debugger workflow entered');
  const original = await loadProjectFiles(projectPath);
  const page =
    original.project.pages.find((entry) => entry.id === original.project.entryPage) ??
    original.project.pages[0];
  if (page === undefined) throw new Error('Debugger smoke needs a starting page.');
  const sourcePath = `pages/${page.name}.ts`;
  const source = [
    `import { ${page.name}Generated } from './${page.name}.generated';`,
    `export class ${page.name} extends ${page.name}Generated {`,
    '  public constructor(element: HTMLElement) {',
    '    super(element);',
    '    const button = document.createElement("button");',
    '    button.id = "debug-smoke-run"; Object.assign(button.style, { position: "fixed", top: "8px", right: "8px", zIndex: "2147483647" });',
    '    button.textContent = "Run debugger smoke";',
    '    button.onclick = () => this.runSmoke();',
    '    document.body.append(button);',
    '  }',
    '  private runSmoke(): void {',
    '    const payload = { count: 1, nested: { ok: true } };',
    '    let counter = 0;',
    '    counter = this.increment(counter);',
    '    counter = this.increment(counter);',
    '    console.log("debug-smoke-console", payload, counter);',
    '    if (counter === 2) throw new Error("debug-smoke-exception");',
    '  }',
    '  private increment(value: number): number {',
    '    const result = value + 1;',
    '    return result;',
    '  }',
    '}',
    '',
  ].join('\n');
  const userSources = { ...original.userSources, [sourcePath]: source };
  await saveProjectFiles({ rootPath: original.rootPath, project: original.project, userSources });
  log('renderer debugger fixture saved');
  window.webContents.send('webrad:menu-command', 'file.openProject');

  async function bridge<T>(expression: string): Promise<T> {
    const result: unknown = await window.webContents.executeJavaScript(expression, true);
    return result as T;
  }
  async function waitFor(expression: string, description: string): Promise<void> {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await bridge<boolean>(expression)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`Debugger smoke timed out waiting for ${description}.`);
  }
  const state = (): Promise<DebugState> => bridge('window.webrad.debugger.getState()');
  async function waitPaused(description: string, previousFrameId?: string): Promise<DebugState> {
    const deadline = Date.now() + 20000;
    let latest = await state();
    while (Date.now() < deadline) {
      latest = await state();
      if (latest.status === 'paused' && latest.frames[0]?.id !== previousFrameId) return latest;
      if (latest.status === 'error')
        throw new Error(`Debugger smoke ${description}: ${latest.message}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(
      `Debugger smoke timed out waiting for ${description}: ${JSON.stringify(latest)}`,
    );
  }
  const command = (action: string): Promise<DebugState> =>
    bridge(`window.webrad.debugger.command(${JSON.stringify(action)})`);
  const evaluate = (
    paused: DebugState,
    frame: DebugFrame,
    expression: string,
  ): Promise<DebugEvaluation> =>
    bridge(
      `window.webrad.debugger.evaluate(${JSON.stringify({ sessionId: paused.sessionId, frameId: frame.id, expression })})`,
    );
  const properties = (paused: DebugState, objectId: string): Promise<readonly DebugVariable[]> =>
    bridge(
      `window.webrad.debugger.properties(${JSON.stringify({ sessionId: paused.sessionId, objectId })})`,
    );
  async function hoverCounter(expected: string): Promise<void> {
    window.show();
    window.focus();
    await bridge(
      `(() => { const editor = document.querySelector('.monaco-editor'); editor.focus(); return true; })()`,
    );
    const point = await bridge<{ x: number; y: number }>(`(() => {
      for (const line of document.querySelectorAll('.monaco-editor .view-line')) {
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const index = node.textContent.indexOf('counter');
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index); range.setEnd(node, index + 7);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0) return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
        }
      }
      throw new Error('No visible counter token in Monaco');
    })()`);
    window.webContents.focus();
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    try {
      await waitFor(
        `Array.from(document.querySelectorAll('.monaco-hover')).some(hover => hover.getBoundingClientRect().width > 0 && hover.textContent.includes(${JSON.stringify(`counter = ${expected}`)}))`,
        `Monaco mouse hover counter = ${expected}`,
      );
    } catch (error) {
      log(
        `renderer debugger hover diagnostic ${JSON.stringify(await bridge(`({ point: ${JSON.stringify(point)}, target: document.elementFromPoint(${point.x}, ${point.y})?.outerHTML, hovers: Array.from(document.querySelectorAll('[class*="hover"]')).map(element => ({ className: element.className, text: element.textContent })) })`))}`,
      );
      throw error;
    }
  }
  await waitFor(
    "document.querySelector('.wr-page-surface') !== null",
    'the opened fixture project',
  );
  log('renderer debugger fixture opened');
  await bridge(
    'window.__webradDebugSmokeEvents = []; window.__webradDebugSmokeUnsubscribe = window.webrad.debugger.subscribe(event => window.__webradDebugSmokeEvents.push(event)); true',
  );
  const request: DebugStartRequest = {
    rootPath: original.rootPath,
    project: original.project,
    userSources,
    breakpoints: [{ path: sourcePath, line: 15, enabled: true, condition: 'counter === 1' }],
    pauseOnExceptions: 'uncaught',
  };
  const started = await bridge<DebugStartResponse>(
    `window.webrad.debugger.start(${JSON.stringify(request)})`,
  );
  log('renderer debugger IPC start returned');
  if (!started.build.success)
    throw new Error(`Debugger smoke build failed: ${JSON.stringify(started.build.diagnostics)}`);
  const firstUrl = started.build.previewUrl;
  let previousState = '';
  const progress = setInterval(() => {
    const current = getDebugState(window.webContents.id);
    const summary = JSON.stringify({
      status: current.status,
      reason: current.reason,
      frame: current.frames[0]?.location,
      message: current.message,
    });
    if (summary !== previousState) {
      previousState = summary;
      log(`renderer debugger progress ${summary}`);
    }
  }, 500);
  async function runScenario(): Promise<void> {
    const preview = getDebugPreviewWindow(window.webContents.id);
    if (preview === undefined) throw new Error('Dedicated Debug Preview was not created.');
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (
        await preview.webContents.executeJavaScript(
          'document.querySelector("#debug-smoke-run") !== null',
        )
      )
        break;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    // Execute the event outside the evaluation stack so uncaught exceptions remain observable.
    preview.focus();
    preview.webContents.focus();
    await preview.webContents.executeJavaScript(
      'setTimeout(() => document.querySelector("#debug-smoke-run").click(), 0); true',
    );
  }
  try {
    await runScenario();
    let paused = await waitPaused('conditional authored breakpoint');
    let frame = paused.frames[0];
    if (
      frame?.location?.path !== sourcePath ||
      frame.location.line !== 15 ||
      !paused.breakpoints[0]?.verified
    )
      throw new Error(`Breakpoint source mapping failed: ${JSON.stringify(paused)}`);
    const counter = await evaluate(paused, frame, 'counter');
    if (counter.value.description !== '1')
      throw new Error(`Conditional breakpoint counter differs: ${JSON.stringify(counter)}`);
    await waitFor(
      `document.querySelector('.wr-debug-execution-line') !== null && document.querySelector('[aria-label="Code debugger"]') !== null`,
      'Monaco execution highlight and debugger dock',
    );
    await waitFor(
      `document.hasFocus() && document.activeElement?.closest('.monaco-editor') !== null && document.activeElement !== document.body`,
      'automatic IDE foreground and Monaco focus on breakpoint',
    );
    if (!window.isFocused()) throw new Error('Breakpoint did not bring the IDE window forward.');
    log('renderer debugger Monaco breakpoint focus passed');
    await hoverCounter('1');
    await bridge(
      `(() => { const input = document.querySelector('[aria-label="Debug console expression"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'counter'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    );
    await waitFor(
      'document.querySelector(".wr-debug-console-form button")?.disabled === false',
      'selected-frame debug console input',
    );
    await bridge('document.querySelector(".wr-debug-console-form").requestSubmit(); true');
    await waitFor(
      `document.querySelector('[aria-label="Debug console output"]')?.textContent.includes('counter') && document.querySelector('[aria-label="Debug console output"]')?.textContent.includes('1')`,
      'debug console UI evaluation',
    );
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F9', modifiers: ['control'] });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F9', modifiers: ['control'] });
    await waitFor(
      'document.querySelector(".wr-debug-breakpoint") !== null',
      'Monaco breakpoint keyboard action',
    );
    await bridge(
      `(() => { const input = document.querySelector('[aria-label="Condition for ${sourcePath}:15"]'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'counter === 1'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
    );
    await waitFor(
      `document.querySelector('[aria-label="Condition for ${sourcePath}:15"]')?.defaultValue === 'counter === 1'`,
      'breakpoint condition draft',
    );
    await bridge(
      `document.querySelector('[aria-label="Condition for ${sourcePath}:15"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`,
    );
    await waitFor(
      'document.querySelector(".wr-debug-breakpoint-conditional") !== null',
      'committed breakpoint condition',
    );
    window.webContents.send('webrad:menu-command', 'file.save');
    await waitFor(
      'document.querySelector(".wr-toolbar-save-state")?.textContent.includes("Saved")',
      'saved debugger preferences',
    );
    const saved = await loadProjectFiles(projectPath);
    if (
      saved.project.debugger?.breakpoints[0]?.line !== 15 ||
      saved.project.debugger.breakpoints[0].condition !== 'counter === 1'
    )
      throw new Error(
        `Monaco breakpoint preferences were not saved in the project manifest: ${JSON.stringify(saved.project.debugger)}`,
      );
    log('renderer debugger Monaco controls and persistence passed');
    const payload = await evaluate(paused, frame, 'payload');
    if (payload.value.objectId === undefined)
      throw new Error('Evaluation did not expose expandable object.');
    const expanded = await properties(paused, payload.value.objectId);
    const nested = expanded.find((entry) => entry.name === 'nested')?.value.objectId;
    if (
      nested === undefined ||
      !(await properties(paused, nested)).some(
        (entry) => entry.name === 'ok' && entry.value.description === 'true',
      )
    )
      throw new Error(`Nested variables did not expand: ${JSON.stringify(expanded)}`);
    const localScope = frame.scopes.find((entry) => entry.type === 'local');
    if (
      localScope === undefined ||
      !(await properties(paused, localScope.objectId)).some((entry) => entry.name === 'counter')
    )
      throw new Error('Local variable scope did not contain counter.');
    if (!(await bridge<boolean>('document.querySelector(".wr-toolbar") !== null && 1 + 1 === 2')))
      throw new Error('IDE renderer did not respond while application was paused.');
    const rejected = await bridge<boolean>(
      `window.webrad.debugger.evaluate({sessionId:${JSON.stringify(paused.sessionId)},frameId:crypto.randomUUID(),expression:'1'}).then(()=>false,()=>true)`,
    );
    if (!rejected) throw new Error('Unknown frame capability was accepted.');
    log('renderer debugger inspection and evaluation passed');
    await command('stepInto');
    paused = await waitPaused('step into authored method', frame.id);
    frame = paused.frames[0];
    if (
      frame?.location?.line !== 20 ||
      !frame.name.includes('increment') ||
      paused.frames.length < 2
    )
      throw new Error(`Step Into did not enter authored method: ${JSON.stringify(paused)}`);
    await command('stepOver');
    paused = await waitPaused('step over authored statement', frame.id);
    frame = paused.frames[0];
    if (
      frame?.location?.line !== 21 ||
      (await evaluate(paused, frame, 'result')).value.description !== '2'
    )
      throw new Error(`Step Over did not execute increment: ${JSON.stringify(paused)}`);
    await command('stepOut');
    paused = await waitPaused('step out to authored caller', frame.id);
    frame = paused.frames[0];
    if (
      frame?.location?.path !== sourcePath ||
      frame.location.line < 15 ||
      frame.location.line > 17 ||
      !frame.name.includes('runSmoke')
    )
      throw new Error(`Step Out did not return to authored caller: ${JSON.stringify(paused)}`);
    await waitFor(
      `!Array.from(document.querySelectorAll('.monaco-hover')).some(hover => hover.getBoundingClientRect().width > 0 && hover.textContent.includes('counter = 1'))`,
      'expired variable hover removal after stepping',
    );
    await hoverCounter('2');
    log('renderer debugger Monaco variable hover passed');
    await command('resume');
    paused = await waitPaused('uncaught exception', frame.id);
    if (
      paused.reason !== 'exception' ||
      !paused.exception?.description.includes('debug-smoke-exception')
    )
      throw new Error(`Exception pause failed: ${JSON.stringify(paused)}`);
    await waitFor(
      "window.__webradDebugSmokeEvents.some(event => event.type === 'console' && event.values.some(value => value.description.includes('debug-smoke-console')))",
      'console forwarding',
    );
    log('renderer debugger breakpoints and stepping passed');
    const oldSession = paused.sessionId;
    await command('restart');
    const afterRestart = await loadProjectFiles(projectPath);
    if (JSON.stringify(afterRestart.project.debugger) !== JSON.stringify(saved.project.debugger))
      throw new Error('Restart overwrote saved debugger preferences.');
    if ((await state()).sessionId === oldSession)
      throw new Error('Restart reused expired session capabilities.');
    if (firstUrl !== undefined && (await fetch(firstUrl)).status !== 404)
      throw new Error('Restart did not revoke the old Debug Preview publication.');
    await runScenario();
    paused = await waitPaused('restarted conditional breakpoint');
    const restartedFrame = paused.frames[0];
    if (restartedFrame === undefined) throw new Error('Restart did not expose authored stack.');
    await command('stop');
    if (
      (await state()).status !== 'stopped' ||
      getDebugPreviewWindow(window.webContents.id) !== undefined
    )
      throw new Error('Stop did not dispose Debug Preview.');
    const staleRejected = await bridge<boolean>(
      `window.webrad.debugger.evaluate(${JSON.stringify({ sessionId: paused.sessionId, frameId: restartedFrame.id, expression: '1' })}).then(()=>false,()=>true)`,
    );
    if (!staleRejected) throw new Error('Stopped session accepted stale frame capabilities.');
    await bridge(`document.querySelector('[aria-label="Start debugging (F5)"]').click(); true`);
    await waitFor(
      'window.webrad.debugger.getState().then(state => state.status === "running")',
      'toolbar debug start',
    );
    await waitFor(
      `document.querySelector('.wr-toolbar-debug.active[data-debug-status="running"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('.wr-toolbar-debug.active')?.textContent === 'Stop Debug'`,
      'active debug toolbar feedback',
    );
    const colors = await bridge<{ idle: string; active: string }>(
      `(() => ({ idle: getComputedStyle(document.querySelector('.wr-toolbar-run:not(.wr-toolbar-debug)')).backgroundColor, active: getComputedStyle(document.querySelector('.wr-toolbar-debug')).backgroundColor }))()`,
    );
    if (colors.idle === colors.active)
      throw new Error('Active debugging has no distinct toolbar color.');
    await bridge(`document.querySelector('.wr-toolbar-debug').click(); true`);
    await waitFor(
      'window.webrad.debugger.getState().then(state => state.status === "stopped")',
      'second Debug click stops the running session',
    );
    if (getDebugPreviewWindow(window.webContents.id) !== undefined)
      throw new Error('Toolbar stop left Debug Preview open.');
    await waitFor(
      `document.querySelector('.wr-toolbar-debug:not(.active)')?.getAttribute('aria-pressed') === 'false'`,
      'idle debug toolbar feedback',
    );
    await bridge(`document.querySelector('[aria-label="Start debugging (F5)"]').click(); true`);
    await waitFor(
      'window.webrad.debugger.getState().then(state => state.status === "running")',
      'toolbar debug start after toggling stop',
    );
    await runScenario();
    paused = await waitPaused('toolbar-started breakpoint');
    await waitFor(
      `document.querySelector('.wr-toolbar-debug.active[data-debug-status="paused"]')?.textContent === 'Debug Paused'`,
      'paused debug toolbar feedback',
    );
    await bridge(`document.querySelector('.wr-toolbar-debug').click(); true`);
    log('renderer debugger toolbar toggle and feedback passed');
    await waitFor(
      'window.webrad.debugger.getState().then(state => state.status === "stopped")',
      'debugger toolbar stop',
    );
    log('renderer debugger restart and teardown passed');
  } finally {
    clearInterval(progress);
    await command('stop');
    await bridge(
      'window.__webradDebugSmokeUnsubscribe?.(); delete window.__webradDebugSmokeEvents; delete window.__webradDebugSmokeUnsubscribe; true',
    );
  }
}
