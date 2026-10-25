import { expect, it } from 'vitest';
import { WEBRAD_FONT_FAMILIES } from '@webrad/runtime/fonts';
import {
  addComponentStyle,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  createComponentStyle,
  createProject,
  deserializeProject,
  safeParseComponentStyle,
  serializeProject,
} from '../src/index.js';

it('validates and persists bundled fonts in every style state while keeping generic families', () => {
  const property = COMPONENT_STYLE_PROPERTY_DEFINITIONS.find(
    (entry) => entry.name === 'fontFamily',
  )!;
  if (property.editor.kind !== 'enum') throw new Error('Missing font family enum.');
  expect(property.editor.options).toEqual([
    { value: 'sans', label: 'Sans serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
    { value: 'ide', label: 'WebRAD IDE (system)' },
    ...WEBRAD_FONT_FAMILIES.map((font) => ({ value: font.id, label: font.label })),
  ]);
  let project = createProject('Fonts');
  for (const family of ['sans', 'serif', 'mono', 'ide', ...WEBRAD_FONT_FAMILIES.map((font) => font.id)]) {
    const style = createComponentStyle(family, 'WebLabel', {
      states: Object.fromEntries(
        ['base', 'hover', 'focus', 'active', 'disabled'].map((state) => [
          state,
          { fontFamily: family },
        ]),
      ),
    });
    expect(safeParseComponentStyle(style).success).toBe(true);
    project = addComponentStyle(project, style);
  }
  expect(deserializeProject(serializeProject(project))).toEqual(project);
  const style = createComponentStyle('Invalid', 'WebLabel');
  expect(
    safeParseComponentStyle({
      ...style,
      states: { ...style.states, base: { fontFamily: 'unavailable-font' } },
    }).success,
  ).toBe(false);
});
