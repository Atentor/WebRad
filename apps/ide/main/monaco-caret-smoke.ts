import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, KeyboardInputEvent } from 'electron';
import { runMonacoWorkspaceSmoke } from './monaco-workspace-smoke';

interface MonacoCaretSmokeOptions {
  readonly log: (message: string) => void;
  readonly sendKey: (
    keyCode: string,
    modifiers?: NonNullable<KeyboardInputEvent['modifiers']>,
  ) => void;
  readonly screenshotPath?: string;
}

async function readCursorLine(window: BrowserWindow): Promise<unknown> {
  return window.webContents.executeJavaScript(
    `(() => {
    const cursor = document.querySelector('.monaco-editor .cursors-layer > .cursor');
    if (!(cursor instanceof HTMLElement)) return null;
    const top = cursor.getBoundingClientRect().top;
    const line = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')]
      .find((node) => Math.abs(node.getBoundingClientRect().top - top) < 1);
    return line?.textContent?.replaceAll('\\u00a0', ' ') ?? null;
  })()`,
    true,
  );
}

/** Compare the real caret with the rendered glyph edge after each character. */
export async function runMonacoCaretSmoke(
  window: BrowserWindow,
  { log, sendKey, screenshotPath }: MonacoCaretSmokeOptions,
): Promise<void> {
  sendKey('Escape');
  sendKey('End');
  await window.webContents.executeJavaScript(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    true,
  );
  const originalLine = await readCursorLine(window);
  if (typeof originalLine !== 'string') {
    throw new Error(
      `Monaco caret smoke could not read the current source line: ${JSON.stringify(originalLine)}`,
    );
  }

  let samples = 0;
  let maxDelta = 0;
  for (const prefix of ['caretSmoke_', '// caretSmoke_']) {
    await window.webContents.insertText(prefix);
    let insertedLength = prefix.length;
    let expectedSource = originalLine + prefix;
    for (const fragment of [
      ...'WiIlm0_!==',
      'WiIlm0123456789_'.repeat(4),
      'WiIlm0123456789_'.repeat(4),
    ]) {
      await window.webContents.insertText(fragment);
      insertedLength += fragment.length;
      expectedSource += fragment;
      const evidence: unknown = await window.webContents.executeJavaScript(
        `new Promise((resolve) => {
        requestAnimationFrame(() => {
          const line = [...document.querySelectorAll('.monaco-editor .view-lines .view-line')]
            .find((node) => node.textContent?.includes('caretSmoke_'));
          const cursor = document.querySelector('.monaco-editor .cursors-layer > .cursor');
          if (!(line instanceof HTMLElement) || !(cursor instanceof HTMLElement)) return resolve(null);
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let lastText = null;
          while (walker.nextNode()) {
            if (walker.currentNode.textContent?.length > 0) lastText = walker.currentNode;
          }
          if (lastText === null) return resolve(null);
          const range = document.createRange();
          range.setStart(lastText, lastText.textContent.length);
          range.collapse(true);
          const glyphEnd = range.getBoundingClientRect();
          const caret = cursor.getBoundingClientRect();
          const cursorStyle = getComputedStyle(cursor);
          resolve({
            delta: Math.abs(caret.left - glyphEnd.left),
            caretX: caret.left,
            glyphEndX: glyphEnd.left,
            caretY: caret.top,
            glyphY: glyphEnd.top,
            animation: cursorStyle.animationName,
            transition: cursorStyle.transitionDuration,
            textRendering: getComputedStyle(line).textRendering,
            source: line.textContent,
          });
        });
      })`,
        true,
      );
      if (
        typeof evidence !== 'object' ||
        evidence === null ||
        !Number.isFinite(Reflect.get(evidence, 'delta')) ||
        Number(Reflect.get(evidence, 'delta')) > 1.5 ||
        Reflect.get(evidence, 'animation') !== 'none' ||
        Reflect.get(evidence, 'transition') !== '0s' ||
        Reflect.get(evidence, 'textRendering') !== 'auto' ||
        String(Reflect.get(evidence, 'source')).replaceAll('\u00a0', ' ') !== expectedSource
      ) {
        throw new Error(
          `Monaco typing or caret alignment failed: ${JSON.stringify({ expectedSource, evidence })}`,
        );
      }
      samples += 1;
      maxDelta = Math.max(maxDelta, Number(Reflect.get(evidence, 'delta')));
    }
    sendKey('Escape');
    if (prefix.startsWith('//') && screenshotPath !== undefined) {
      await window.webContents.executeJavaScript(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        true,
      );
      if (!path.isAbsolute(screenshotPath)) {
        throw new Error('Smoke screenshot destination must be an absolute path.');
      }
      const parsed = path.parse(screenshotPath);
      const destination = path.join(parsed.dir, `${parsed.name}-monaco.png`);
      await fs.mkdir(parsed.dir, { recursive: true });
      await fs.writeFile(destination, (await window.webContents.capturePage()).toPNG());
      log(`renderer Monaco screenshot saved: ${destination}`);
    }
    // Select exactly the appended ASCII text, preserving the original line on every OS.
    // One native deletion avoids starving React with hundreds of synchronous source edits.
    for (let index = 0; index < insertedLength; index += 1) sendKey('Left', ['shift']);
    sendKey('Backspace');

    await window.webContents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      true,
    );
    const restoredLine = await readCursorLine(window);
    if (restoredLine !== originalLine) {
      throw new Error(
        `Monaco caret smoke did not restore the original line: ${JSON.stringify({ originalLine, restoredLine })}`,
      );
    }
  }
  log(`renderer Monaco caret alignment passed: ${JSON.stringify({ samples, maxDelta })}`);
  await runMonacoWorkspaceSmoke(window, { log, sendKey });
}
