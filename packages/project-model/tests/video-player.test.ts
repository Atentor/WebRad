import { expect, it } from 'vitest';
import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  addComponent,
  createProject,
  deserializePage,
  parsePage,
  serializePage,
  updateComponentProps,
} from '../src/index.js';
function page() {
  const initial = createProject('VideoProject').pages[0]!;
  return addComponent(
    initial,
    defaultComponentRegistry.createComponent('WebVideoPlayer', {
      id: 'video-1',
      name: 'VideoPlayer1',
      parentId: initial.rootComponentId,
    }),
    initial.rootComponentId,
  );
}
it('persists the discriminated source and visual properties with stable identity', () => {
  const initial = page();
  const updated = updateComponentProps(initial, 'video-1', {
    source: { kind: 'restgo', videoId: 'video-id' },
    muted: true,
    volume: 0.5,
    aspectRatio: '9:16',
  });
  const restored = deserializePage(serializePage(updated));
  expect(restored.components.find((node) => node.id === 'video-1')?.props).toMatchObject({
    source: { kind: 'restgo', videoId: 'video-id' },
    muted: true,
    volume: 0.5,
    aspectRatio: '9:16',
  });
});
it.each([
  { volume: 2 },
  { playbackRate: 0 },
  { aspectRatio: '4:3' },
  { source: { kind: 'url', url: 'https://youtube.com/watch?v=x', format: 'hls' } },
  { source: { kind: 'restgo', videoId: 'video-id', token: 'secret' } },
  { source: { kind: 'url', url: 'javascript:alert(1)', format: 'hls' } },
  { currentTime: 42 },
])('rejects unsafe/invalid persisted player properties %j', (props) => {
  const initial = page();
  expect(() =>
    parsePage({
      ...initial,
      components: initial.components.map((node) =>
        node.id === 'video-1' ? { ...node, props: { ...node.props, ...props } } : node,
      ),
    }),
  ).toThrow();
});
