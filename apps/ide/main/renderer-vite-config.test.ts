import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';

import config from '../../../vite.renderer.config';

const rendererConfig = config as UserConfig;

describe('renderer Vite configuration', () => {
  it('prevents generated previews from embedding the privileged development renderer', () => {
    expect(rendererConfig.server?.headers).toMatchObject({
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
  });

  it('serves source-first workspaces directly while optimizing TypeScript interop', () => {
    expect(rendererConfig.optimizeDeps?.exclude).toEqual(
      expect.arrayContaining([
        '@webrad/component-registry',
        '@webrad/components',
        '@webrad/designer',
        '@webrad/language',
        '@webrad/project-model',
        '@webrad/runtime',
      ]),
    );
    expect(rendererConfig.optimizeDeps?.include).toContain('typescript');
  });
});
