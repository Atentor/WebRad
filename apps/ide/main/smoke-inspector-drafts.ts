import type { BrowserWindow } from 'electron';

/** Confirm edited Inspector fields before a synthetic click can unmount them. */
export async function confirmInspectorDrafts(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `(() => {
      const inputs = document.querySelectorAll('.wr-object-inspector [data-editor-draft-pending="true"]');
      for (const input of inputs) {
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', ctrlKey: input instanceof HTMLTextAreaElement,
          bubbles: true, cancelable: true,
        }));
      }
    })()`,
    true,
  );
}
