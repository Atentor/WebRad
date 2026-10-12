// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import { applyRuntimeLayout, projectRuntimeLayout, WebVideoPlayer } from '../src/index.js';

it.each(['fixed', 'align-to-parent', 'row', 'column'] as const)(
  'restores saved layout after changing runtime aspect ratios in %s',
  (mode) => {
    const node = defaultComponentRegistry.createComponent('WebVideoPlayer', {
      id: 'video',
      name: 'VideoPlayer1',
    });
    const parent = { ...node.layout.container, mode, alignItems: 'stretch' as const };
    const element = document.createElement('div');
    const player = new WebVideoPlayer(element);
    applyRuntimeLayout(element, node, parent);
    const properties = [
      'width',
      'height',
      'position',
      'top',
      'bottom',
      'flex-basis',
      'flex-grow',
      'flex-shrink',
      'align-self',
      'aspect-ratio',
    ];
    const original = properties.map((property) => element.style.getPropertyValue(property));
    for (const ratio of ['16:9', '9:16'] as const) {
      player.aspectRatio = ratio;
      expect(player.aspectRatio).toBe(ratio);
      expect(element.style.height).toBe('auto');
      expect(element.style.aspectRatio).toBe(ratio === '16:9' ? '16 / 9' : '9 / 16');
      expect(element.style.getPropertyPriority('aspect-ratio')).toBe('important');
      const projected = projectRuntimeLayout(
        { ...node, props: { ...node.props, aspectRatio: ratio } },
        parent,
      );
      expect(element.style.aspectRatio).toBe(projected.item['aspect-ratio']);
    }
    player.width = 350;
    player.x = 25;
    player.aspectRatio = 'none';
    expect(player.width).toBe(350);
    expect(player.x).toBe(25);
    expect(
      properties
        .filter((property) => property !== 'width')
        .map((property) => element.style.getPropertyValue(property)),
    ).toEqual(original.filter((_value, index) => properties[index] !== 'width'));
    expect(() => {
      player.aspectRatio = '4:3' as '16:9';
    }).toThrow('Invalid video aspectRatio');
    expect(player.aspectRatio).toBe('none');
  },
);

it('preserves directly constructed player dimensions when ratio is disabled', () => {
  const element = document.createElement('div');
  element.style.height = '123px';
  const player = new WebVideoPlayer(element);
  player.aspectRatio = '9:16';
  expect(element.style.height).toBe('auto');
  player.aspectRatio = 'none';
  expect(element.style.height).toBe('123px');
  expect(element.style.aspectRatio).toBe('');
});

it.each(['start', 'center', 'end'] as const)(
  'preserves row default %s alignment with a fixed ratio',
  (alignItems) => {
    const node = defaultComponentRegistry.createComponent('WebVideoPlayer', {
      id: 'video',
      name: 'VideoPlayer1',
      props: { aspectRatio: '16:9' },
    });
    const projection = projectRuntimeLayout(node, {
      ...node.layout.container,
      mode: 'row',
      alignItems,
    });
    expect(projection.item['align-self']).toBeUndefined();
    expect(projection.item.height).toBe('auto');
  },
);
