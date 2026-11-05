import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadUpdateArtifact } from './update-network';
import type { UpdateManifest, UpdateTarget } from './update-release';
import { createWindowsArmUpdateFeed } from './windows-arm-update-feed';

vi.mock('electron', async () => {
  const { tmpdir } = await import('node:os');
  return { app: { getPath: () => tmpdir() } };
});
vi.mock('./update-network', () => ({ downloadUpdateArtifact: vi.fn() }));

const target: UpdateTarget = {
  platform: 'win32',
  arch: 'arm64',
  kind: 'squirrel',
  file: 'arm64-webrad-0.2.0-full.nupkg',
  size: 15,
  sha256: 'a'.repeat(64),
  signed: false,
};
const manifest: UpdateManifest = {
  formatVersion: 1,
  version: '0.2.0',
  publishedAt: '2026-10-15T12:00:00.000Z',
  targets: [target],
};

afterEach(() => vi.resetAllMocks());

describe('Windows ARM64 Squirrel update feed', () => {
  it('serves only the downloaded ARM package and its Squirrel metadata over loopback', async () => {
    const contents = Buffer.from('package fixture');
    let packagePath = '';
    vi.mocked(downloadUpdateArtifact).mockImplementation(async (url, destination, item) => {
      expect(url).toBe(
        'https://github.com/Atentor/WebRad/releases/download/v0.2.0/arm64-webrad-0.2.0-full.nupkg',
      );
      expect(item).toEqual(target);
      packagePath = destination;
      await fs.writeFile(destination, contents);
    });
    const feed = await createWindowsArmUpdateFeed('Atentor/WebRad', manifest, target, vi.fn());
    try {
      expect(new URL(feed.url).hostname).toBe('127.0.0.1');
      const response = await fetch(`${feed.url}/RELEASES?id=webrad`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        `${createHash('sha1').update(contents).digest('hex')} webrad-0.2.0-full.nupkg ${String(contents.length)}\n`,
      );
      const packageResponse = await fetch(`${feed.url}/webrad-0.2.0-full.nupkg`);
      expect(Buffer.from(await packageResponse.arrayBuffer())).toEqual(contents);
      expect((await fetch(`${feed.url}/other.nupkg`)).status).toBe(404);
      expect((await fetch(`${feed.url}/RELEASES`, { method: 'POST' })).status).toBe(405);
    } finally {
      await feed.close();
    }
    await expect(fs.stat(packagePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fetch(`${feed.url}/RELEASES`)).rejects.toThrow();
  });

  it('rejects a package without the ARM64 asset prefix before downloading', async () => {
    await expect(
      createWindowsArmUpdateFeed(
        'Atentor/WebRad',
        manifest,
        { ...target, file: 'webrad-0.2.0-full.nupkg' },
        vi.fn(),
      ),
    ).rejects.toThrow('Invalid Windows ARM64 update package name');
    expect(downloadUpdateArtifact).not.toHaveBeenCalled();
  });

  it('removes the temporary directory if the verified download fails', async () => {
    let packagePath = '';
    vi.mocked(downloadUpdateArtifact).mockImplementation(async (_url, destination) => {
      packagePath = destination;
      await fs.writeFile(destination, 'incomplete');
      throw new Error('Update integrity check failed');
    });
    await expect(
      createWindowsArmUpdateFeed('Atentor/WebRad', manifest, target, vi.fn()),
    ).rejects.toThrow('Update integrity check failed');
    expect(packagePath.startsWith(os.tmpdir())).toBe(true);
    await expect(fs.stat(packagePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
