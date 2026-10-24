import { expect, it } from 'vitest';
import postcss from 'postcss';
import { createComponentStyle, createProject, addComponentStyle } from '@webrad/project-model';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import {
  compileGeneratedAppStyles,
  compileTailwindStyles,
  compileProjectToMemory,
} from '../src/index.js';
import { fontProject } from '../../../tests/fixtures/fonts';

it('generates matching font utilities and self-contained WOFF2 in Designer and application CSS', async () => {
  const styles = WEBRAD_FONT_FAMILIES.map((font) =>
    createComponentStyle(font.label, 'WebLabel', { states: { base: { fontFamily: font.id } } }),
  );
  for (const css of await Promise.all([
    compileTailwindStyles(styles),
    compileGeneratedAppStyles(styles),
  ])) {
    const root = postcss.parse(css);
    for (const font of WEBRAD_FONT_FAMILIES) {
      expect(css).toContain(`--font-${font.id}: '${font.label}', ${font.fallback}`);
      expect(css).toContain(`.font-${font.id}`);
      const descriptors: Record<string, string>[] = [];
      root.walkAtRules('font-face', (rule) => {
        const declarations: Record<string, string> = {};
        rule.walkDecls((declaration) => {
          declarations[declaration.prop] = declaration.value;
        });
        if (declarations['font-family'] === `'${font.label}'`) descriptors.push(declarations);
      });
      expect(descriptors.length).toBeGreaterThanOrEqual(4);
      expect(new Set(descriptors.map((entry) => entry['font-style']))).toEqual(
        new Set(['normal', 'italic']),
      );
      expect(new Set(descriptors.map((entry) => entry['unicode-range'])).size).toBe(2);
      for (const descriptor of descriptors) {
        expect(descriptor['font-display']).toBe('swap');
        const encoded = descriptor.src?.match(/data:font\/woff2;base64,([\w+/=]+)/u)?.[1];
        expect(encoded).toBeTruthy();
        expect(Buffer.from(encoded!, 'base64').subarray(0, 4).toString()).toBe('wOF2');
      }
    }
    expect(css).not.toMatch(/url\(["']?(?:https?:|\.\/files)/u);
  }
});

it('includes families referenced by interaction classes and omits unused font binaries', async () => {
  const style = createComponentStyle('Conditional fonts', 'WebLabel', {
    states: {
      base: { fontFamily: 'roboto' },
      hover: { fontFamily: 'open-sans' },
      focus: { fontFamily: 'jetbrains-mono' },
      active: { fontFamily: 'inter' },
    },
  });
  const css = await compileTailwindStyles([style]);
  for (const name of ['Open Sans', 'JetBrains Mono', 'Roboto', 'Inter'])
    expect(css).toContain(`font-family: '${name}'`);
  for (const name of ['Lato', 'Montserrat', 'Poppins', 'Nunito'])
    expect(css).not.toContain(`font-family: '${name}'`);
  const generic = await compileTailwindStyles([
    createComponentStyle('Generic', 'WebLabel', { states: { base: { fontFamily: 'sans' } } }),
  ]);
  expect(generic).not.toContain('data:font/woff2');
});

it('exports font notices and embedded fonts in the minified compiled Preview and browser application', async () => {
  const result = await compileProjectToMemory(fontProject(), { userSources: {}, minify: true });
  expect(result.success, JSON.stringify(result.diagnostics)).toBe(true);
  expect(result.previewHtml).toContain('data:font/woff2;base64,');
  expect(result.files['assets/app.css']).toContain('data:font/woff2;base64,');
  for (const font of WEBRAD_FONT_FAMILIES) {
    expect(result.files[`assets/licenses/fonts/${font.id}-OFL-1.1.txt`]).toContain(
      'SIL OPEN FONT LICENSE',
    );
  }
  const plain = await compileProjectToMemory(
    addComponentStyle(
      createProject('UnusedFont'),
      createComponentStyle('Unused', 'WebLabel', { states: { base: { fontFamily: 'nunito' } } }),
    ),
    { userSources: {} },
  );
  // An unassigned style is pruned by the existing application source selection.
  expect(plain.success, JSON.stringify(plain.diagnostics)).toBe(true);
  const embeddedFamilies = new Set<string>();
  postcss.parse(plain.files['assets/app.css']!).walkAtRules('font-face', (face) => {
    face.walkDecls('font-family', (declaration) => {
      embeddedFamilies.add(declaration.value.replaceAll("'", '').replaceAll('"', ''));
    });
  });
  expect([...embeddedFamilies]).toEqual(['Roboto']);
  expect(
    Object.keys(plain.files).filter((file) => file.startsWith('assets/licenses/fonts/')),
  ).toEqual(['assets/licenses/fonts/roboto-OFL-1.1.txt']);
});
