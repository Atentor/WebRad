import { getWebRadIconShapes, type WebRadIconName, WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { JSDOM } from 'jsdom';
import { createLucideIconElement, LUCIDE_ICON_NAMES } from '@webrad/runtime/icon';
import { resolveIdeIcon } from '../ide-icons';

const AUTH_AND_DOOR_ICON_NAMES = [
  'login',
  'logout',
  'sign-in',
  'sign-out',
  'door-in',
  'door-out',
  'door-open',
  'door-closed',
] as const;

const REMOVED_ICON_ALIASES = ['plus', 'x', 'log-in', 'log-out', 'door-enter', 'door-exit'] as const;

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
    for (const alias of REMOVED_ICON_ALIASES) {
      expect(WEBRAD_ICON_NAMES).not.toContain(alias);
    }
  });

  it('does not expose identical SVG artwork under multiple catalogue IDs', () => {
    const namesByShape = new Map<string, WebRadIconName>();
    for (const name of WEBRAD_ICON_NAMES) {
      const shapeSignature = JSON.stringify(getWebRadIconShapes(name));
      expect(
        namesByShape.get(shapeSignature),
        `${name} duplicates an existing icon`,
      ).toBeUndefined();
      namesByShape.set(shapeSignature, name);
    }
  });

  it('renders every IDE icon as local SVG without font ligature text', () => {
    const dom = new JSDOM('<!doctype html><div></div>');
    try {
      for (const name of [...WEBRAD_ICON_NAMES, ...LUCIDE_ICON_NAMES]) {
        const markup = renderToStaticMarkup(<Icon name={name} />);
        expect(markup).toContain('<svg');
        expect(markup).toContain('class="wr-icon"');
        expect(markup).not.toContain(`>${name}<`);
        const expected = createLucideIconElement(dom.window.document, resolveIdeIcon(name));
        const host = dom.window.document.querySelector('div')!;
        host.innerHTML = markup;
        const actual = host.querySelector('svg')!;
        expect(actual.dataset.lucideIcon).toBe(resolveIdeIcon(name));
        expect(actual.getAttribute('stroke-width')).toBe('2');
        expect(actual.innerHTML, name).toBe(expected.innerHTML);
        expect(actual.getAttribute('aria-hidden')).toBe('true');
      }
    } finally {
      dom.window.close();
    }
  });
});
