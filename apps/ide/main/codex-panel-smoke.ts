import type { BrowserWindow } from 'electron';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { capturePresentedSmokePage } from './smoke-capture';

/** Real panel interactions; no login or paid inference is performed by a smoke. */
export async function runCodexPanelSmoke(
  window: BrowserWindow,
  screenshotPath?: string,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  const waitFor = async (expression: string): Promise<void> => {
    while (Date.now() < deadline) {
      if ((await window.webContents.executeJavaScript(expression, true)) === true) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    throw new Error('Codex panel did not reach its expected UI state.');
  };
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Codex assistant"]').click()`, true);
  try {
    await waitFor(`(() => {
      const panel = document.querySelector('.wr-codex-panel');
      const prompt = panel?.querySelector('textarea[aria-label="Message Codex"]');
      const model = panel?.querySelector('select[aria-label="Codex model"]');
      const effort = panel?.querySelector('select[aria-label="Reasoning effort"]');
      const send = panel?.querySelector('button[aria-label="Send to Codex"]');
      const button = document.querySelector('button[aria-label="Codex assistant"]');
      if (!(panel instanceof HTMLElement && prompt instanceof HTMLTextAreaElement &&
          model instanceof HTMLSelectElement && effort instanceof HTMLSelectElement &&
          send instanceof HTMLButtonElement && button instanceof HTMLButtonElement)) return false;
      const bounds = panel.getBoundingClientRect();
      const promptBounds = prompt.getBoundingClientRect();
      const usage = panel.querySelector('[aria-label="Codex usage limits"]');
      const usageVisible = usage instanceof HTMLElement && usage.getBoundingClientRect().height > 0 &&
        usage.querySelectorAll('.wr-codex-usage-track').length === 2 &&
        usage.getBoundingClientRect().bottom <= bounds.bottom;
      const header = panel.querySelector('.wr-codex-header');
      const tabs = document.querySelector('.wr-view-tabs');
      const aligned = header instanceof HTMLElement && tabs instanceof HTMLElement &&
        Math.abs(header.getBoundingClientRect().bottom - tabs.getBoundingClientRect().bottom) <= 1;
      const allowedModels = [...model.options].every((option) =>
        !option.value || /^gpt-6\\.1-(terra|sol)(?:$|-)/.test(option.value));
      return button.getAttribute('aria-pressed') === 'true' && send.disabled &&
        allowedModels && aligned && usageVisible &&
        panel.querySelectorAll('.wr-codex-suggestions button').length === 3 &&
        bounds.width >= 220 && bounds.height > 200 &&
        promptBounds.left >= bounds.left && promptBounds.right <= bounds.right &&
        promptBounds.top >= bounds.top && promptBounds.bottom <= bounds.bottom;
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('.wr-codex-suggestions button').click()`, true);
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      return prompt instanceof HTMLTextAreaElement && prompt.value.includes('registration form');
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('.wr-codex-project-context > summary').click()`, true);
    await waitFor(`(() => {
      const context = document.querySelector('.wr-codex-project-context');
      const details = context?.querySelector('.wr-codex-context-details');
      return context instanceof HTMLDetailsElement && context.open &&
        details instanceof HTMLElement && details.getBoundingClientRect().height > 0 &&
        details.textContent.includes('Available source files');
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close Codex"]').click()`, true);
    await waitFor(`document.querySelector('.wr-codex-panel') === null`);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Codex assistant"]').click()`, true);
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      return prompt instanceof HTMLTextAreaElement && prompt.value.includes('registration form');
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="New Codex conversation"]').click()`, true);
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      const send = document.querySelector('.wr-codex-panel button[aria-label="Send to Codex"]');
      return prompt instanceof HTMLTextAreaElement && prompt.value === '' &&
        send instanceof HTMLButtonElement && send.disabled;
    })()`);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Codex conversation history"]').click()`, true);
    await waitFor(`(() => {
      const chats = document.querySelectorAll('.wr-codex-chat-row > button:first-child');
      return chats.length === 2 && [...chats].some((chat) => chat.textContent.includes('registration form')) &&
        document.querySelector('button[aria-label="Codex conversation history"] svg')?.getAttribute('data-lucide-icon') === 'messages-square' &&
        document.querySelector('.wr-codex-chat-row button[title="Delete conversation"] svg')?.getAttribute('data-lucide-icon') === 'trash';
    })()`);
    await window.webContents.executeJavaScript(`(() => {
      const chat = [...document.querySelectorAll('.wr-codex-chat-row > button:first-child')].find((item) => item.textContent.includes('registration form'));
      chat.click();
    })()`, true);
    await waitFor(`document.querySelector('.wr-codex-panel textarea')?.value.includes('registration form') === true`);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="New Codex conversation"]').click()`, true);
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Codex connection settings"]').click()`, true);
    await waitFor(`document.querySelector('.wr-codex-settings') !== null`);
    if (screenshotPath) {
      const image = await capturePresentedSmokePage(window, deadline, 'Codex panel');
      await writeFile(path.join(path.dirname(screenshotPath), 'webrad-codex-panel.png'), image.toPNG());
    }
  } finally {
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close Codex"]')?.click()`, true);
  }
  await waitFor(`document.querySelector('.wr-codex-panel') === null && document.querySelector('button[aria-label="Codex assistant"]').getAttribute('aria-pressed') === 'false'`);
}
