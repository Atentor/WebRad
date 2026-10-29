import type { BrowserWindow, WebFrameMain } from 'electron';

const BUTTON_STYLE_PROPERTIES = [
  'justifyContent',
  'textAlign',
  'flexDirection',
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

function buttonStyleExpression(
  selector: string,
  checkPageWidth = false,
  expectedFontFamily?: string,
): string {
  return `(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!(button instanceof HTMLButtonElement)) return '';
    const style = getComputedStyle(button);
    if (style.fontWeight !== '500') throw new Error('Button text must use medium weight.');
    if (style.borderRadius !== '8px') throw new Error('Button corners must be 8px.');
    if (!['flex-start', 'start'].includes(style.justifyContent) || style.textAlign !== 'left' || style.flexDirection !== 'row')
      throw new Error('Button icon and text are not aligned to the left.');
    if (${JSON.stringify(expectedFontFamily ?? '')} && !style.fontFamily.includes(${JSON.stringify(expectedFontFamily ?? '')}))
      throw new Error('Button font differs from its saved style: ' + style.fontFamily);
    if (${String(checkPageWidth)}) {
      const page = button.closest('.wr-webpage');
      const available = document.documentElement.clientWidth;
      const width = page?.getBoundingClientRect().width;
      if (width === undefined || Math.abs(width - available) > 1)
        throw new Error('Responsive page width differs from available width: ' + JSON.stringify({ width, available }));
    }
    return JSON.stringify(${JSON.stringify(BUTTON_STYLE_PROPERTIES)}.map(property => style[property]));
  })()`;
}

export async function captureDesignerButtonStyle(
  window: BrowserWindow,
  expectedFontFamily: string,
): Promise<string> {
  const result: unknown = await window.webContents.executeJavaScript(
    buttonStyleExpression(
      '.wr-page-surface .wr-component[data-component-type="WebButton"]',
      false,
      expectedFontFamily,
    ),
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
    buttonStyleExpression('[data-webrad-name="BTNMostrar"]', true),
  );
  if (result !== expected) {
    throw new Error(
      `Designer/Preview button styles differ: Designer=${expected}; Preview=${String(result)}`,
    );
  }
}
