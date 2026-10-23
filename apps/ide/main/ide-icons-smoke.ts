import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

/** Inspect actual IDE chrome and open Monaco suggestions, preserving existing smoke interactions. */
export async function runIdeIconsSmoke(
  window: BrowserWindow,
  log: (message: string) => void,
): Promise<void> {
  const result: unknown = await window.webContents.executeJavaScript(
    `(() => {
    const icons = [...document.querySelectorAll('svg.wr-icon')].filter(icon =>
      !icon.closest('.wr-inspector-icon-picker-preview, .wr-icon-picker-option'));
    const invalid = icons.filter(icon => !icon.dataset.lucideIcon || !icon.children.length ||
      icon.getAttribute('stroke-width') !== '2' || icon.getAttribute('aria-hidden') !== 'true');
    const native = [...document.querySelectorAll('.codicon')].filter(icon => {
      const bounds = icon.getBoundingClientRect();
      const style = getComputedStyle(icon);
      return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    const unmapped = native.filter(icon => !getComputedStyle(icon, '::before').getPropertyValue('--wr-lucide-icon').trim());
    // Resource entries wrap their SVG in a caption-sized span; the SVG must
    // retain the same 16px box as direct page icons and header actions.
    const pageIcon = document.querySelector('svg.wr-page-icon');
    if (!pageIcon) throw new Error('Project Explorer page icon is missing.');
    const resource = document.createElement('span');
    resource.className = 'wr-page-icon';
    const graphic = pageIcon.cloneNode(true);
    graphic.setAttribute('class', 'wr-icon');
    resource.append(graphic);
    pageIcon.parentElement.append(resource);
    try {
      const box = graphic.getBoundingClientRect();
      if (box.width !== 16 || box.height !== 16)
        throw new Error('Project Explorer resource icon must be 16 by 16px: ' + JSON.stringify({ width: box.width, height: box.height }));
    } finally { resource.remove(); }
    return { icons: icons.length, invalid: invalid.map(icon => icon.outerHTML), monaco: native.length,
      unmapped: unmapped.map(icon => icon.className) };
  })()`,
    true,
  );
  if (
    !result ||
    typeof result !== 'object' ||
    !('icons' in result) ||
    typeof result.icons !== 'number' ||
    result.icons < 10 ||
    !('invalid' in result) ||
    !Array.isArray(result.invalid) ||
    result.invalid.length ||
    !('monaco' in result) ||
    typeof result.monaco !== 'number' ||
    result.monaco < 1 ||
    !('unmapped' in result) ||
    !Array.isArray(result.unmapped) ||
    result.unmapped.length
  ) {
    throw new Error(`IDE Lucide icon audit failed: ${JSON.stringify(result)}`);
  }
  const screenshot = path.resolve('node_modules', '.cache', 'webrad-ide-lucide.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  window.webContents.invalidate();
  const capture = await window.webContents.capturePage(undefined, {
    stayHidden: true,
    stayAwake: true,
  });
  if (capture.isEmpty()) throw new Error('IDE Lucide screenshot was empty.');
  await fs.writeFile(screenshot, capture.toPNG());
  log(`renderer IDE Lucide icons passed: ${JSON.stringify(result)}; screenshot ${screenshot}`);
}
