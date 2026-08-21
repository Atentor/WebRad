import type { ComponentNode, PageModel } from '@webrad/project-model';

export function component(
  id: string,
  parentId: string | null,
  overrides: Partial<ComponentNode> = {},
): ComponentNode {
  return {
    id,
    type: 'WebButton',
    name: id,
    parentId,
    bounds: { x: 0, y: 0, width: 40, height: 24 },
    props: {},
    events: {},
    children: [],
    ...overrides,
  };
}

export function pageFixture(): PageModel {
  return {
    formatVersion: 1,
    id: 'page',
    name: 'PageMain',
    caption: 'Main',
    width: 640,
    height: 480,
    layoutMode: 'absolute',
    rootComponentId: 'root',
    components: [
      component('root', null, {
        type: 'WebPage',
        name: 'PageMain',
        bounds: { x: 0, y: 0, width: 640, height: 480 },
        children: ['a', 'b', 'panel'],
      }),
      component('a', 'root', {
        name: 'BTNA',
        bounds: { x: 10, y: 20, width: 40, height: 24 },
        props: { caption: 'A', enabled: true },
      }),
      component('b', 'root', {
        name: 'BTNB',
        bounds: { x: 100, y: 50, width: 60, height: 30 },
        props: { caption: 'B' },
      }),
      component('panel', 'root', {
        type: 'WebPanel',
        name: 'PNLMain',
        bounds: { x: 200, y: 100, width: 200, height: 160 },
        children: ['inside'],
      }),
      component('inside', 'panel', {
        type: 'WebLabel',
        name: 'LBLInside',
        bounds: { x: 8, y: 8, width: 80, height: 24 },
      }),
    ],
  };
}
