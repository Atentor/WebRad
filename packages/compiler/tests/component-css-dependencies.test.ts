import { expect, it } from 'vitest';
import {
  ComponentRegistry,
  defaultComponentRegistry,
  InvalidComponentDefinitionError,
} from '@webrad/component-registry';
import { selectComponentCss } from '../src/styles.js';

it('retains the embedded Toggle style through DataGrid registry metadata', () => {
  expect(defaultComponentRegistry.require('WebDataGrid').styleDependencies).toEqual(['WebToggle']);
  const css = selectComponentCss(new Set(['WebDataGrid']));
  expect(css).toContain('.wr-webtoggle {');
  expect(css).toContain('.wr-toggle-thumb {');
  expect(css).toContain(".wr-webtoggle[aria-checked='true'] > .wr-toggle-thumb");
  expect(css).toContain('.wr-data-grid-toggle {');
  expect(css).not.toContain('.wr-webvideoplayer');
  const unused = selectComponentCss(new Set(['WebLabel']));
  expect(unused).not.toContain('.wr-webtoggle');
  expect(unused).not.toContain('.wr-toggle-');
  expect(unused).not.toContain('.wr-data-grid-toggle');
});

it('copies and freezes dependency metadata while validating its component identifiers', () => {
  const dependencies = ['WebToggle'];
  const registry = new ComponentRegistry([
    { ...defaultComponentRegistry.require('WebLabel'), styleDependencies: dependencies },
  ]);
  dependencies.push('WebButton');
  expect(registry.require('WebLabel').styleDependencies).toEqual(['WebToggle']);
  expect(Object.isFrozen(registry.require('WebLabel').styleDependencies)).toBe(true);
  expect(Object.isFrozen(dependencies)).toBe(false);
  for (const styleDependencies of [['WebToggle', 'WebToggle'], ['bad-type']]) {
    expect(
      () =>
        new ComponentRegistry([
          { ...defaultComponentRegistry.require('WebLabel'), styleDependencies },
        ]),
    ).toThrow(InvalidComponentDefinitionError);
  }
});
