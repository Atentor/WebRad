// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { isLucideIconName } from '@webrad/runtime/icon';
import { installMonacoLucideIcons, MONACO_LUCIDE_ICONS } from './monaco-icons';

it('replaces Monaco controls and completion symbols with valid local Lucide masks without duplicating styles', () => {
  for (const icon of Object.values(MONACO_LUCIDE_ICONS)) expect(isLucideIconName(icon)).toBe(true);
  installMonacoLucideIcons(document);
  installMonacoLucideIcons(document);
  expect(document.querySelectorAll('#wr-monaco-lucide-icons')).toHaveLength(1);
  const css = document.getElementById('wr-monaco-lucide-icons')!.textContent!;
  for (const name of [
    'symbol-method',
    'symbol-property',
    'symbol-class',
    'find-next-match',
    'find-close',
    'folding-collapsed',
    'lightbulb',
    'marker-navigation-warning',
  ]) {
    expect(css).toContain(`.codicon-${name}::before`);
  }
  expect(css).toContain('data:image/svg+xml,');
  expect(css).not.toContain('https:');
});
