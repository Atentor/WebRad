import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './Icon';

const iconNames: readonly IconName[] = [
  'add',
  'chevron-down',
  'chevron-right',
  'close',
  'delete',
  'folder-open',
  'info',
  'layers',
  'lightbulb',
  'palette',
  'page',
  'play',
  'redo',
  'save',
  'search',
  'settings',
  'style',
  'undo',
];

describe('Icon', () => {
  it('renders every IDE icon as local SVG without font ligature text', () => {
    for (const name of iconNames) {
      const markup = renderToStaticMarkup(<Icon name={name} />);
      expect(markup).toContain('<svg');
      expect(markup).toContain('class="wr-icon"');
      expect(markup).not.toContain(`>${name}<`);
    }
  });
});
