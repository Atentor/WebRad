import { describe, expect, it } from 'vitest';
import { collectExternalPackageImports } from '../src/package-imports.js';

describe('external package imports', () => {
  it('collects authored package references across all module forms using syntax', () => {
    expect(
      collectExternalPackageImports({
        'pages/index.ts': `import dayjs from 'dayjs';
        import { WebPage } from '@webrad/runtime';
        import { value } from '../units/value';
        export { get } from 'axios';
        type Config = import('@scope/library/config').Config;
        const lazy = import('dayjs/plugin/utc');
        const old = require('legacy');
        // import ignored from 'comment';
        const text = "import ignored from 'string'";`,
        'units/value.ts': `import dayjs = require('dayjs');`,
      }),
    ).toEqual(['@scope/library/config', 'axios', 'dayjs', 'dayjs/plugin/utc', 'legacy']);
  });
});
