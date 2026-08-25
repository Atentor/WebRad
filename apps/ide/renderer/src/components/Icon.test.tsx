import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('provides 100 local icons across common button actions', () => {
    expect(WEBRAD_ICON_NAMES).toHaveLength(100);
    expect(new Set(WEBRAD_ICON_NAMES).size).toBe(WEBRAD_ICON_NAMES.length);
    expect(WEBRAD_ICON_NAMES).toEqual(
      expect.arrayContaining([
        'arrow-left',
        'calendar',
        'chart-line',
        'download-cloud',
        'mail',
        'video',
      ]),
    );
  });

  it('renders every IDE icon as local SVG without font ligature text', () => {
    for (const name of WEBRAD_ICON_NAMES) {
      const markup = renderToStaticMarkup(<Icon name={name} />);
      expect(markup).toContain('<svg');
      expect(markup).toContain('class="wr-icon"');
      expect(markup).not.toContain(`>${name}<`);
    }
  });
});
