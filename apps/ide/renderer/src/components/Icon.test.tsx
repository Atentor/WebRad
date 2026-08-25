import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

const AUTH_AND_DOOR_ICON_NAMES = [
  'login',
  'logout',
  'log-in',
  'log-out',
  'sign-in',
  'sign-out',
  'door-in',
  'door-out',
  'door-enter',
  'door-exit',
  'door-open',
  'door-closed',
] as const;

describe('Icon', () => {
  it('provides a broad local catalogue across common button actions', () => {
    expect(WEBRAD_ICON_NAMES.length).toBeGreaterThanOrEqual(200);
    expect(new Set(WEBRAD_ICON_NAMES).size).toBe(WEBRAD_ICON_NAMES.length);
    expect(WEBRAD_ICON_NAMES).toEqual(
      expect.arrayContaining([
        'arrow-left',
        'calendar',
        'chart-line',
        'download-cloud',
        'mail',
        'video',
        'shield-check',
        'file-code',
        'message-circle',
        'credit-card',
        ...AUTH_AND_DOOR_ICON_NAMES,
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
