// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { VideoPlayerSourceEditor } from './VideoPlayerSourceEditor';
it('requires a valid source draft before saving and never saves a YouTube URL', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  await act(async () =>
    root.render(
      <VideoPlayerSourceEditor
        id="video-source"
        value={null}
        disabled={false}
        onChange={changed}
      />,
    ),
  );
  const select = host.querySelector('select')!;
  await act(async () => {
    select.value = 'url';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const input = host.querySelector('input')!;
  const set = (value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => set('https://youtube.com/watch?v=test'));
  expect(host.querySelector('button')!.disabled).toBe(true);
  expect(changed).not.toHaveBeenCalled();
  await act(async () => set('https://cdn.test/master.m3u8'));
  await act(async () => host.querySelector('button')!.click());
  expect(changed).toHaveBeenCalledWith({
    kind: 'url',
    url: 'https://cdn.test/master.m3u8',
    format: 'hls',
  });
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
