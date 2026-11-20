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
  await window.webContents.executeJavaScript(
    `document.querySelector('button[aria-label="Codex assistant"]').click()`,
    true,
  );
  try {
    await waitFor(`(() => {
      const panel = document.querySelector('.wr-codex-panel');
      const prompt = panel?.querySelector('textarea[aria-label="Message Codex"]');
      const model = panel?.querySelector('select[aria-label="Codex model"]');
      const effort = panel?.querySelector('select[aria-label="Reasoning effort"]');
      const send = panel?.querySelector('button[aria-label="Send to Codex"]');
      const button = document.querySelector('button[aria-label="Codex assistant"]');
      const integration = document.querySelector('button[aria-label="RestGo integration"]');
      const spacer = document.querySelector('.wr-activity-bar > .wr-activity-spacer');
      if (!(panel instanceof HTMLElement && prompt instanceof HTMLTextAreaElement &&
          model instanceof HTMLSelectElement && effort instanceof HTMLSelectElement &&
          send instanceof HTMLButtonElement && button instanceof HTMLButtonElement)) return false;
      const bounds = panel.getBoundingClientRect();
      const inUpperGroup = integration instanceof HTMLButtonElement && spacer instanceof HTMLElement &&
        integration.nextElementSibling === button && button.nextElementSibling === spacer &&
        button.getBoundingClientRect().top >= integration.getBoundingClientRect().bottom &&
        button.getBoundingClientRect().bottom <= spacer.getBoundingClientRect().top;
      const promptBounds = prompt.getBoundingClientRect();
      const composer = panel.querySelector('.wr-codex-composer');
      const suggestion = panel.querySelector('.wr-codex-suggestions button');
      const minimalChrome = composer instanceof HTMLElement && suggestion instanceof HTMLButtonElement &&
        getComputedStyle(composer).borderRadius === '8px' &&
        getComputedStyle(suggestion).borderTopWidth === '0px' &&
        panel.querySelector('.wr-codex-title svg')?.getAttribute('data-brand-icon') === 'openai';
      const usage = panel.querySelector('[aria-label="Codex usage limits"]');
      const usageVisible = usage instanceof HTMLElement && usage.getBoundingClientRect().height > 0 &&
        usage.querySelectorAll('.wr-codex-usage-track').length === 2 &&
        usage.querySelector('.wr-codex-usage-window small') === null &&
        usage.getBoundingClientRect().bottom <= bounds.bottom;
      const header = panel.querySelector('.wr-codex-header');
      const tabs = document.querySelector('.wr-view-tabs');
      const aligned = header instanceof HTMLElement && tabs instanceof HTMLElement &&
        Math.abs(header.getBoundingClientRect().bottom - tabs.getBoundingClientRect().bottom) <= 1;
      const allowedModels = [...model.options].every((option) =>
        !option.value || /^gpt-6\\.1-(terra|sol)(?:$|-)/.test(option.value));
      return button.getAttribute('aria-pressed') === 'true' && send.disabled &&
        allowedModels && aligned && usageVisible && inUpperGroup && minimalChrome &&
        button.querySelector('svg')?.getAttribute('data-brand-icon') === 'openai' &&
        button.querySelector('svg')?.getAttribute('viewBox') === '1.5 1.5 13 13' &&
        panel.querySelectorAll('.wr-codex-suggestions button').length === 3 &&
        bounds.width >= 220 && bounds.height > 200 &&
        promptBounds.left >= bounds.left && promptBounds.right <= bounds.right &&
        promptBounds.top >= bounds.top && promptBounds.bottom <= bounds.bottom;
    })()`);
    await window.webContents.executeJavaScript(
      `document.querySelector('.wr-codex-suggestions button').click()`,
      true,
    );
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      return prompt instanceof HTMLTextAreaElement && prompt.value.includes('registration form');
    })()`);
    await waitFor(`document.querySelector('.wr-codex-project-context') === null`);
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Close Codex"]').click()`,
      true,
    );
    await waitFor(`document.querySelector('.wr-codex-panel') === null`);
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Codex assistant"]').click()`,
      true,
    );
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      return prompt instanceof HTMLTextAreaElement && prompt.value.includes('registration form');
    })()`);
    // Observe the real disk-backed draft before reloading the renderer.
    await waitFor(`(async () => {
      const groups = Object.values(await window.webrad.codex.readHistory());
      return groups.some(group => group.chats.some(chat => chat.draft.includes('registration form')));
    })()`);
    await new Promise<void>((resolve) => {
      window.webContents.once('did-finish-load', () => resolve());
      window.webContents.reload();
    });
    await waitFor(`document.querySelector('button[aria-label="Codex assistant"]') !== null`);
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Codex assistant"]').click()`,
      true,
    );
    await waitFor(
      `document.querySelector('.wr-codex-panel textarea')?.value.includes('registration form') === true`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="New Codex conversation"]').click()`,
      true,
    );
    await waitFor(`(() => {
      const prompt = document.querySelector('.wr-codex-panel textarea');
      const send = document.querySelector('.wr-codex-panel button[aria-label="Send to Codex"]');
      return prompt instanceof HTMLTextAreaElement && prompt.value === '' &&
        send instanceof HTMLButtonElement && send.disabled;
    })()`);
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Codex conversation history"]').click()`,
      true,
    );
    await waitFor(`(() => {
      const chats = document.querySelectorAll('.wr-codex-chat-row > button:first-child');
      return chats.length === 2 && [...chats].some((chat) => chat.textContent.includes('registration form')) &&
        document.querySelector('button[aria-label="Codex conversation history"] svg')?.getAttribute('data-lucide-icon') === 'messages-square' &&
        document.querySelector('.wr-codex-chat-row button[title="Delete conversation"] svg')?.getAttribute('data-lucide-icon') === 'trash';
    })()`);
    await window.webContents.executeJavaScript(
      `(() => {
      const chat = [...document.querySelectorAll('.wr-codex-chat-row > button:first-child')].find((item) => item.textContent.includes('registration form'));
      chat.click();
    })()`,
      true,
    );
    await waitFor(
      `document.querySelector('.wr-codex-panel textarea')?.value.includes('registration form') === true`,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="New Codex conversation"]').click()`,
      true,
    );
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Codex connection settings"]').click()`,
      true,
    );
    await waitFor(`document.querySelector('.wr-codex-settings') !== null`);
    if (screenshotPath) {
      const image = await capturePresentedSmokePage(window, deadline, 'Codex panel');
      await writeFile(
        path.join(path.dirname(screenshotPath), 'webrad-codex-panel.png'),
        image.toPNG(),
      );
    }
  } finally {
    await window.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Close Codex"]')?.click()`,
      true,
    );
  }
  await waitFor(
    `document.querySelector('.wr-codex-panel') === null && document.querySelector('button[aria-label="Codex assistant"]').getAttribute('aria-pressed') === 'false'`,
  );
}
