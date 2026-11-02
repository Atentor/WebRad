import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bindComponentEvent, createProject, updatePage } from '@webrad/project-model';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import { bundleSources } from '../src/bundle.js';
import { compileProjectToMemory } from '../src/index.js';
import { virtualAbsolutePath } from '../src/source-graph.js';
import { typecheckSources } from '../src/typecheck.js';

const directories: string[] = [];

async function fixtureRoot(version = '1.0.0'): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-project-packages-'));
  directories.push(root);
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ private: true, dependencies: { '@scope/calendar': version } }),
    'node_modules/@scope/calendar/package.json': JSON.stringify({
      name: '@scope/calendar',
      version,
      type: 'module',
      exports: {
        '.': { types: './index.d.ts', browser: './browser.js', default: './node.js' },
        './format': { types: './index.d.ts', browser: './browser.js', default: './node.js' },
        './style.css': './style.css',
      },
    }),
    'node_modules/@scope/calendar/index.d.ts': `import type { Label } from './types';\nexport function format(value: Label): string;\nexport function unused(): string;`,
    'node_modules/@scope/calendar/types.d.ts': 'export type Label = string;',
    'node_modules/@scope/calendar/browser.js': `import cjs from 'tiny-cjs';\nexport const format = value => cjs.tag(value) + ' ${version}';\nexport const unused = () => 'UNUSED_PACKAGE_EXPORT_SENTINEL';`,
    'node_modules/@scope/calendar/node.js': `import fs from 'node:fs'; export const format = () => fs.readFileSync('/secret');`,
    'node_modules/@scope/calendar/style.css': `@font-face {font-family:PackageFont;src:url('./font.woff2')} .package-calendar { color: rgb(1, 2, 3); }`,
    'node_modules/@scope/calendar/font.woff2': 'font-fixture-bytes',
    'node_modules/tiny-cjs/package.json': JSON.stringify({
      name: 'tiny-cjs',
      version: '1.0.0',
      main: 'index.cjs',
    }),
    'node_modules/tiny-cjs/index.cjs': `exports.tag = value => '[' + value + ']';`,
    'node_modules/plain-js/package.json': JSON.stringify({
      name: 'plain-js',
      version: '1.0.0',
      main: 'index.js',
    }),
    'node_modules/plain-js/index.js': 'module.exports = value => String(value);',
  };
  await Promise.all(
    Object.entries(files).map(async ([name, contents]) => {
      const target = path.join(root, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents);
    }),
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('project NPM package compilation', () => {
  it.each(['preview', 'deploy', 'native'] as const)(
    'bundles scoped browser exports, CJS transitives, styles and resources for %s',
    async (target) => {
      const packageRoot = await fixtureRoot();
      let project = createProject('PackageApplication');
      const page = project.pages[0]!;
      project = updatePage(
        project,
        page.id,
        bindComponentEvent(page, page.rootComponentId, 'OnCreate', 'PageCreate'),
      );
      const result = await compileProjectToMemory(project, {
        packageRoot,
        target,
        debug: target === 'preview',
        minify: true,
        userSources: {
          'units/Dates.ts': `import { format } from '@scope/calendar/format';\nexport function today(): string { return format('today'); }`,
          'pages/index.ts': `import { indexGenerated } from './index.generated';
import { today } from '../units/Dates';
import '@scope/calendar/style.css';
export class index extends indexGenerated {
  public PageCreate(): void { this.element.dataset.packageValue = today(); }
}`,
        },
      });
      expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
      expect(result.files['assets/app.js']).not.toContain('UNUSED_PACKAGE_EXPORT_SENTINEL');
      expect(result.files['assets/app.js']).not.toContain('readFileSync');
      expect(result.files['assets/app.css']).toContain('.package-calendar');
      expect(result.files['assets/app.css']).toContain('data:font/woff2;base64,');
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
        url: 'https://packages.webrad.test/',
      });
      try {
        dom.window.eval(result.files['assets/app.js'] ?? '');
        expect(
          dom.window.document
            .querySelector('[data-package-value]')
            ?.getAttribute('data-package-value'),
        ).toBe('[today] 1.0.0');
        expect(Reflect.get(dom.window, 'require')).toBeUndefined();
        expect(Reflect.get(dom.window, 'process')).toBeUndefined();
      } finally {
        dom.window.close();
      }
      if (target === 'preview') {
        expect(result.debug?.sourceMap).toContain('__packages/@scope/calendar/browser.js');
        expect(result.debug?.sourceMap).toContain('units/Dates.ts');
        expect(result.previewHtml).toContain('.package-calendar');
      }
    },
  );

  it('uses installed declarations for strict errors and invalidates them after a package update', async () => {
    const packageRoot = await fixtureRoot();
    const sources = new Map([
      [
        virtualAbsolutePath('units/Dates.ts'),
        `import { format } from '@scope/calendar'; export const value: string = format(123);`,
      ],
    ]);
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 2345 })]),
    );
    await fs.writeFile(
      path.join(packageRoot, 'node_modules/@scope/calendar/types.d.ts'),
      'export type Label = number;',
    );
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual([]);
    await fs.rm(path.join(packageRoot, 'node_modules/@scope/calendar'), { recursive: true });
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 2307,
          message: expect.stringContaining('Project > Packages'),
        }),
      ]),
    );
  });

  it('isolates two projects using different versions of the same package', async () => {
    const roots = await Promise.all([fixtureRoot('1.0.0'), fixtureRoot('2.0.0')]);
    const entryPath = virtualAbsolutePath('packages-entry.ts');
    const sources = new Map([
      [
        entryPath,
        `import { format } from '@scope/calendar'; globalThis.document.title = format('version');`,
      ],
    ]);
    for (const [index, packageRoot] of roots.entries()) {
      const result = await bundleSources({
        sources,
        entryPath,
        packageRoot,
        outputDirectory: path.join(packageRoot, 'output'),
        minify: false,
        sourcemap: false,
      });
      expect(result.files['assets/app.js']).toContain(`${index + 1}.0.0`);
      expect(result.files['assets/app.js']).not.toContain(`${2 - index}.0.0`);
    }
  });

  it('does not borrow packages from the IDE when a project has not installed them', async () => {
    const packageRoot = await fixtureRoot();
    const entryPath = virtualAbsolutePath('units/Missing.ts');
    const sources = new Map([
      [entryPath, `import React from 'react'; export const value = React.version;`],
    ]);
    for (const root of [undefined, packageRoot]) {
      expect(typecheckSources(sources, undefined, root).diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 2307 })]),
      );
      await expect(
        bundleSources({
          sources,
          entryPath,
          packageRoot: root,
          outputDirectory: path.join(packageRoot, 'output'),
          minify: false,
          sourcemap: false,
        }),
      ).rejects.toThrow();
    }
  });

  it('warns about JavaScript packages without types while preserving bundling', async () => {
    const packageRoot = await fixtureRoot();
    const entryPath = virtualAbsolutePath('units/Plain.ts');
    const sources = new Map([
      [entryPath, `import plain from 'plain-js'; export const value = plain('ok');`],
    ]);
    const checked = typecheckSources(sources, undefined, packageRoot);
    expect(checked.diagnostics).toEqual([
      expect.objectContaining({
        code: 7016,
        category: 'warning',
        message: expect.stringContaining('@types'),
      }),
    ]);
    const bundled = await bundleSources({
      sources,
      entryPath,
      packageRoot,
      outputDirectory: path.join(packageRoot, 'output'),
      minify: false,
      sourcemap: false,
    });
    expect(bundled.files['assets/app.js']).toContain('module.exports');
  });

  it('refuses a node_modules directory linked outside the authorized project', async () => {
    const packageRoot = await fixtureRoot();
    const otherProject = await fixtureRoot('2.0.0');
    await fs.rm(path.join(packageRoot, 'node_modules'), { recursive: true });
    await fs.symlink(
      path.join(otherProject, 'node_modules'),
      path.join(packageRoot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const entryPath = virtualAbsolutePath('units/Escaping.ts');
    const sources = new Map([
      [
        entryPath,
        `import { format } from '@scope/calendar'; export const value = format('escape');`,
      ],
    ]);
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 2307 })]),
    );
    await expect(
      bundleSources({
        sources,
        entryPath,
        packageRoot,
        outputDirectory: path.join(packageRoot, 'output'),
        minify: false,
        sourcemap: false,
      }),
    ).rejects.toThrow('outside this project');
  });

  it('honors explicit browser shims and disabled Node imports inside browser-compatible dependencies', async () => {
    const packageRoot = await fixtureRoot();
    const directory = path.join(packageRoot, 'node_modules/browser-shimmed');
    await fs.mkdir(directory);
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'browser-shimmed',
        version: '1.0.0',
        main: 'index.js',
        browser: { fs: false, path: './path.js' },
      }),
    );
    await fs.writeFile(
      path.join(directory, 'index.js'),
      `const fs = require('fs'); const path = require('path'); module.exports = path.join('safe','browser') + Object.keys(fs).length;`,
    );
    await fs.writeFile(
      path.join(directory, 'path.js'),
      `exports.join = (...parts) => parts.join('/');`,
    );
    const entryPath = virtualAbsolutePath('units/Shimmed.ts');
    const sources = new Map([
      [entryPath, `import shimmed from 'browser-shimmed'; document.title = shimmed;`],
    ]);
    const bundled = await bundleSources({
      sources,
      entryPath,
      packageRoot,
      outputDirectory: path.join(packageRoot, 'output'),
      minify: false,
      sourcemap: false,
    });
    expect(bundled.files['assets/app.js']).toContain('parts.join("/")');
    expect(bundled.files['assets/app.js']).not.toContain('require("fs")');
  });

  it.each(['node:fs', 'fs', 'node:child_process'])(
    'rejects unavailable Node APIs (%s) without injecting a bridge',
    async (specifier) => {
      const packageRoot = await fixtureRoot();
      const entryPath = virtualAbsolutePath('units/Native.ts');
      const sources = new Map([
        [entryPath, `import * as native from '${specifier}'; export const value = native;`],
      ]);
      expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('unavailable in browser applications'),
          }),
        ]),
      );
      await expect(
        bundleSources({
          sources,
          entryPath,
          packageRoot,
          outputDirectory: path.join(packageRoot, 'output'),
          minify: false,
          sourcemap: false,
        }),
      ).rejects.toThrow('unavailable in browser applications');
    },
  );

  it('explains unavailable authored Node globals without recommending a Node type package', async () => {
    const packageRoot = await fixtureRoot();
    const sources = new Map([
      [virtualAbsolutePath('units/NodeGlobal.ts'), `export const cwd = process.cwd();`],
    ]);
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual([
      expect.objectContaining({
        code: 2591,
        message: expect.stringContaining('Node.js global "process" is unavailable'),
      }),
    ]);
  });

  it('preserves an installed dependency own transitive vendor code and declarations', async () => {
    const packageRoot = await fixtureRoot();
    const files = {
      'node_modules/wrapped-vendor/package.json': JSON.stringify({
        name: 'wrapped-vendor',
        version: '1.0.0',
        main: 'index.js',
        types: 'index.d.ts',
        dependencies: { 'pdf-lib': '1.0.0' },
      }),
      'node_modules/wrapped-vendor/index.js': `exports.version = require('pdf-lib').value;`,
      'node_modules/wrapped-vendor/index.d.ts': `export const version: import('pdf-lib').PDFDocument;`,
      'node_modules/pdf-lib/package.json': JSON.stringify({
        name: 'pdf-lib',
        version: '1.0.0',
        main: 'index.js',
        types: 'index.d.ts',
      }),
      'node_modules/pdf-lib/index.js': `exports.value = 'project-transitive';`,
      'node_modules/pdf-lib/index.d.ts': `export type PDFDocument = 'project-transitive'; export const value: PDFDocument;`,
    };
    for (const [file, contents] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(packageRoot, file)), { recursive: true });
      await fs.writeFile(path.join(packageRoot, file), contents);
    }
    const entryPath = virtualAbsolutePath('units/TransitiveVendor.ts');
    const sources = new Map([
      [
        entryPath,
        `import { version } from 'wrapped-vendor'; export const value: 'project-transitive' = version; document.title = value;`,
      ],
    ]);
    expect(typecheckSources(sources, undefined, packageRoot).diagnostics).toEqual([]);
    const bundled = await bundleSources({
      sources,
      entryPath,
      packageRoot,
      outputDirectory: path.join(packageRoot, 'output'),
      minify: false,
      sourcemap: false,
    });
    expect(bundled.files['assets/app.js']).toContain('project-transitive');
    expect(bundled.files['assets/app.js']).not.toContain('webrad-pdf:');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      runScripts: 'outside-only',
    });
    try {
      dom.window.eval(bundled.files['assets/app.js'] ?? '');
      expect(dom.window.document.title).toBe('project-transitive');
    } finally {
      dom.window.close();
    }
  });
});
