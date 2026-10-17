import { expect, it } from 'vitest';
import { parsePage, serializePage, deserializePage, updateComponentProps } from '../src/index.js';
import { videoUploadProject } from '../../../tests/fixtures/video-upload';
import {
  defaultComponentRegistry,
  resolveComponentDesignerPresentation,
} from '@webrad/component-registry';

it('persists video limits with stable identity and registers a tray service without visual geometry controls', () => {
  const page = videoUploadProject().pages[0]!;
  const updated = updateComponentProps(page, 'video-upload', {
    maxFileSizeMB: 20,
    maxDurationSeconds: 45,
  });
  const restored = deserializePage(serializePage(updated));
  expect(restored.components.find((entry) => entry.id === 'video-upload')?.props).toMatchObject({
    maxFileSizeMB: 20,
    maxDurationSeconds: 45,
  });
  const metadata = defaultComponentRegistry.require('WebVideoUpload');
  expect(resolveComponentDesignerPresentation(metadata)).toBe('tray');
  expect(metadata.visual).toBe(false);
  expect(metadata.properties.some((property) => property.source === 'bounds')).toBe(false);
  expect(metadata.events.map((event) => event.name)).toEqual([
    'OnChange',
    'OnProgress',
    'OnStateChange',
    'OnUploadComplete',
    'OnProcessingProgress',
    'OnReady',
    'OnError',
    'OnComplete',
  ]);
});
it.each([
  { maxFileSizeMB: -1 },
  { maxDurationSeconds: 0 },
  { chunkSizeBytes: 1.5 },
  { maxDurationSeconds: '60' },
  { resumeToken: 'do-not-persist' },
  { uploadSession: {} },
  { selectedFile: {} },
])('rejects invalid config or persisted transient state %j', (props) => {
  const page = videoUploadProject().pages[0]!;
  expect(() =>
    parsePage({
      ...page,
      components: page.components.map((entry) =>
        entry.id === 'video-upload' ? { ...entry, props: { ...entry.props, ...props } } : entry,
      ),
    }),
  ).toThrow();
});
