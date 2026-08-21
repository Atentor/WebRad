import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';

import config from '../../../vite.renderer.config';

const rendererConfig = config as UserConfig;

describe('renderer Vite configuration', () => {
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
