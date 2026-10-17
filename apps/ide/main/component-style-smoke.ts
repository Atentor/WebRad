import type { BrowserWindow, WebFrameMain } from 'electron';

const BUTTON_STYLE_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'backgroundColor',
  'backgroundImage',
  'borderRadius',
  'borderWidth',
  'padding',
  'gap',
] as const;

function buttonStyleExpression(selector: string): string {
  return `(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!(button instanceof HTMLButtonElement)) return '';
    const style = getComputedStyle(button);
    return JSON.stringify(${JSON.stringify(BUTTON_STYLE_PROPERTIES)}.map(property => style[property]));
  })()`;
}

export async function captureDesignerButtonStyle(window: BrowserWindow): Promise<string> {
  const result: unknown = await window.webContents.executeJavaScript(
    buttonStyleExpression('.wr-page-surface .wr-component[data-component-type="WebButton"]'),
  );
  if (typeof result !== 'string' || result.length === 0)
    throw new Error('Designer button style was unavailable.');
  return result;
}

export async function assertPreviewButtonStyle(
  frame: WebFrameMain,
  expected: string,
): Promise<void> {
  const result: unknown = await frame.executeJavaScript(
    buttonStyleExpression('[data-webrad-name="BTNMostrar"]'),
  );
  if (result !== expected) {
    throw new Error(
      `Designer/Preview button styles differ: Designer=${expected}; Preview=${String(result)}`,
    );
  }
}
