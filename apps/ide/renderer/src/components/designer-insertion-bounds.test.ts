// @vitest-environment jsdom
import { componentRegistry } from '@webrad/component-registry';
import { createPage, createDefaultRepeatingGroupConfiguration } from '@webrad/project-model';
import { expect, it } from 'vitest';
import { designerInsertionBounds } from './designer-insertion-bounds';

function fixture() {
  const page = createPage('PageMain');
  const group = componentRegistry.createComponent('WebRepeatingGroup', {
    id: 'group',
    name: 'RepeatingGroup1',
    parentId: page.rootComponentId,
    props: {
      repeatingGroupConfig: {
        ...createDefaultRepeatingGroupConfiguration(),
        rowHeightMode: 'fixed',
        fixedRowHeight: 120,
      },
    },
  });
  return { page: { ...page, components: [...page.components, group] }, group };
}

it('uses a fixed row height when no browser measurements are available', () => {
  const { page, group } = fixture();
  expect(designerInsertionBounds(group, page, null, 1)).toEqual({ width: 420, height: 120 });
});

it('uses the responsive row child host measurements at the active zoom', () => {
  const { page, group } = fixture();
  const surface = document.createElement('div');
  const host = document.createElement('div');
  host.dataset.designerParentId = group.id;
  surface.append(host);
  surface.getBoundingClientRect = () => new DOMRect(0, 0, 1280, 1440);
  host.getBoundingClientRect = () => new DOMRect(20, 40, 560, 192);
  Object.defineProperties(host, { clientWidth: { value: 280 }, clientHeight: { value: 96 } });
  expect(designerInsertionBounds(group, page, surface, 2)).toEqual({
    x: 0,
    y: 0,
    width: 280,
    height: 96,
  });
});

it('preserves ordinary container insertion dimensions', () => {
  const { page, group } = fixture();
  const panel = { ...group, type: 'WebPanel' };
  expect(designerInsertionBounds(panel, page, null, 1)).toBe(panel.bounds);
});
