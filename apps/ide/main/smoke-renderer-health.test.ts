import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it } from 'vitest';
import { trackSmokeRendererHealth } from './smoke-renderer-health';
function harness() {
  const contents = new EventEmitter();
  const assertHealthy = trackSmokeRendererHealth(contents as unknown as WebContents);
  return { contents, assertHealthy };
}
describe('smoke renderer health', () => {
  it('allows development notices and expected HTTP failures without an uncaught exception', () => {
    const test = harness();
    for (const message of [
      '[vite] connected.',
      'Electron Security Warning',
      'Failed to load resource: 401 (Unauthorized)',
    ]) {
      test.contents.emit('console-message', { message });
    }
    test.contents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
    expect(test.assertHealthy).not.toThrow();
  });
  it.each([
    'Uncaught Error: Maximum update depth exceeded.',
    'Uncaught (in promise) TypeError: broken editor',
  ])('retains an exception even if the workflow later completes: %s', (message) => {
    const test = harness();
    test.contents.emit('console-message', { message, sourceId: 'CodeEditor.tsx', lineNumber: 481 });
    test.contents.emit('console-message', { message: 'renderer all assertions passed' });
    expect(test.assertHealthy).toThrow(message);
    expect(test.assertHealthy).toThrow('CodeEditor.tsx:481');
  });
  it('rejects a renderer crash even after the UI reloads', () => {
    const test = harness();
    test.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 139 });
    test.contents.emit('console-message', { message: 'renderer reloaded' });
    expect(test.assertHealthy).toThrow('crashed (exit 139)');
  });
});
