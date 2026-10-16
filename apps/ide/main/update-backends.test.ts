import type * as NodeFileSystem from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoUpdater } from 'electron';
import { selectUpdateBackend } from './update-backends';
import type { UpdateManifest } from './update-release';

const mocks = vi.hoisted(() => ({
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { autoUpdater: Object.assign(new EventEmitter(), mocks), app: {}, shell: {} };
});
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof NodeFileSystem>();
  return { ...actual, promises: { ...actual.promises, access: vi.fn(async () => undefined) } };
});
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: async () => ({ stdout: '', stderr: 'TeamIdentifier=ABC123XYZ\n' }),
  });
  return { execFile };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  autoUpdater.removeAllListeners();
});

describe('native update protocols', () => {
  it.each([
    [
      'win32',
      'x64',
      'squirrel',
      'webrad-0.2.0-full.nupkg',
      'https://github.com/Atentor/WebRad-Releases/releases/download/v0.2.0',
    ],
    [
      'darwin',
      'arm64',
      'mac',
      'WebRad-0.2.0-darwin-arm64.zip',
      'https://github.com/Atentor/WebRad-Releases/releases/download/v0.2.0/webrad-darwin-arm64.json',
    ],
  ] as const)(
    'uses the pinned %s feed and waits for the actual native download event',
    async (platform, arch, kind, file, feed) => {
      vi.stubGlobal('process', { ...process, platform, arch });
      const manifest: UpdateManifest = {
        formatVersion: 1,
        version: '0.2.0',
        publishedAt: '2026-10-15T12:00:00.000Z',
        targets: [{ platform, arch, kind, file, size: 10, sha256: 'a'.repeat(64), signed: true }],
      };
      const { target, backend } = await selectUpdateBackend('Atentor/WebRad-Releases', manifest);
      expect(backend.mode).toBe('automatic');
      const download = backend.download(manifest, target, vi.fn());
      expect(mocks.setFeedURL).toHaveBeenCalledWith(
        platform === 'darwin' ? { url: feed, serverType: 'json' } : { url: feed },
      );
      expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
      expect(mocks.quitAndInstall).not.toHaveBeenCalled();
      autoUpdater.emit('update-downloaded');
      await download;
      expect(autoUpdater.listenerCount('update-downloaded')).toBe(0);
      const installation = backend.install();
      autoUpdater.emit('before-quit-for-update');
      await installation;
      expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
    },
  );
  it('propagates native download errors and never treats them as installation success', async () => {
    vi.stubGlobal('process', { ...process, platform: 'win32', arch: 'x64' });
    const manifest: UpdateManifest = {
      formatVersion: 1,
      version: '0.2.0',
      publishedAt: '2026-10-15T12:00:00.000Z',
      targets: [
        {
          platform: 'win32',
          arch: 'x64',
          kind: 'squirrel',
          file: 'webrad-0.2.0-full.nupkg',
          size: 10,
          sha256: 'a'.repeat(64),
          signed: false,
        },
      ],
    };
    const { target, backend } = await selectUpdateBackend('Atentor/WebRad-Releases', manifest);
    const download = backend.download(manifest, target, vi.fn());
    autoUpdater.emit('error', new Error('native signature validation failed'));
    await expect(download).rejects.toThrow('signature validation failed');
    expect(mocks.quitAndInstall).not.toHaveBeenCalled();
    expect(autoUpdater.listenerCount('error')).toBe(0);
  });
});
