import { describe, expect, it, vi } from 'vitest';
import { UpdateService, type UpdateBackend } from './update-service';
import { isNewerVersion, parseUpdateManifest, releaseAssetUrl } from './update-release';
import { validateUpdateUrl } from './update-network';
import { detectLinuxInstaller, linuxInstallArguments } from './update-installers';

const target = {
  platform: 'linux' as const,
  arch: 'x64' as const,
  kind: 'deb' as const,
  file: 'WebRad-0.2.0-linux-x64.deb',
  size: 10,
  sha256: 'a'.repeat(64),
  signed: false,
};
const manifest = {
  formatVersion: 1,
  version: '0.2.0',
  publishedAt: '2026-10-15T12:00:00.000Z',
  targets: [target],
};
function fixture(mode: UpdateBackend['mode'] = 'automatic') {
  const backend: UpdateBackend = {
    mode,
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
  };
  const readManifest = vi.fn(async (): Promise<unknown> => manifest);
  const canInstall = vi.fn(() => true);
  const selectBackend = vi.fn(async () => ({ target, backend }));
  const service = new UpdateService({
    currentVersion: '0.1.11',
    readManifest,
    selectBackend,
    canInstall,
  });
  return { service, backend, readManifest, canInstall, selectBackend };
}

describe('release metadata and trust boundary', () => {
  it('compares numeric versions without downgrades, prefixes or prereleases', () => {
    expect(isNewerVersion('0.1.12', '0.1.9')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.1.9', '0.1.12')).toBe(false);
    expect(() => isNewerVersion('0.2.0-beta', '0.1.11')).toThrow();
    expect(() => isNewerVersion('00.2.0', '0.1.11')).toThrow();
  });
  it('rejects duplicate, mismatched and traversing artifact metadata', () => {
    expect(parseUpdateManifest(manifest).version).toBe('0.2.0');
    expect(() => parseUpdateManifest({ ...manifest, targets: [target, target] })).toThrow(
      'Duplicate',
    );
    expect(() =>
      parseUpdateManifest({ ...manifest, targets: [{ ...target, file: '../setup.deb' }] }),
    ).toThrow();
    expect(() =>
      parseUpdateManifest({ ...manifest, targets: [{ ...target, platform: 'win32' }] }),
    ).toThrow('platform');
    expect(() =>
      parseUpdateManifest({ ...manifest, targets: [{ ...target, url: 'https://evil.example' }] }),
    ).toThrow();
  });
  it('pins generated asset URLs and validates each possible redirect host', () => {
    expect(releaseAssetUrl('Atentor/WebRad-Releases', '0.2.0', 'WebRad Setup.exe')).toBe(
      'https://github.com/Atentor/WebRad-Releases/releases/download/v0.2.0/WebRad%20Setup.exe',
    );
    expect(validateUpdateUrl('https://release-assets.githubusercontent.com/a?sig=1').hostname).toBe(
      'release-assets.githubusercontent.com',
    );
    for (const url of [
      'http://github.com/a',
      'https://github.com.evil.example/a',
      'https://user:token@github.com/a',
      'https://github.com:8443/a',
      'file:///a',
      'https://127.0.0.1/a',
    ])
      expect(() => validateUpdateUrl(url)).toThrow();
  });
});

describe('application update lifecycle', () => {
  it('checks without downloading, coalesces requests and installs only after download', async () => {
    const f = fixture();
    const states: string[] = [];
    const stop = f.service.subscribe((state) => states.push(state.status));
    await f.service.install();
    await f.service.download();
    expect(f.backend.install).not.toHaveBeenCalled();
    await Promise.all([f.service.check(), f.service.check()]);
    expect(f.readManifest).toHaveBeenCalledTimes(1);
    expect(f.service.getState().status).toBe('available');
    expect(f.backend.download).not.toHaveBeenCalled();
    await Promise.all([f.service.download(), f.service.download()]);
    expect(f.backend.download).toHaveBeenCalledTimes(1);
    expect(f.service.getState().status).toBe('ready');
    expect(f.backend.install).not.toHaveBeenCalled();
    await f.service.install();
    expect(f.backend.install).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['checking', 'available', 'downloading', 'ready', 'installing']);
    stop();
  });
  it('keeps a verified download ready when another window has unsaved changes', async () => {
    const f = fixture();
    await f.service.check();
    await f.service.download();
    f.canInstall.mockReturnValue(false);
    expect((await f.service.install()).status).toBe('ready');
    expect(f.backend.install).not.toHaveBeenCalled();
    f.canInstall.mockReturnValue(true);
    await f.service.install();
    expect(f.backend.install).toHaveBeenCalledTimes(1);
  });
  it('never installs an unsigned macOS or other manual download', async () => {
    const f = fixture('manual');
    await f.service.check();
    expect(f.service.getState().mode).toBe('manual');
    expect((await f.service.download()).status).toBe('manual');
    await f.service.install();
    expect(f.backend.install).not.toHaveBeenCalled();
  });
  it('does not offer equal/older releases and keeps development disabled', async () => {
    const f = fixture();
    f.readManifest.mockResolvedValue({ ...manifest, version: '0.1.10' });
    expect((await f.service.check()).status).toBe('current');
    expect(f.selectBackend).not.toHaveBeenCalled();
    const service = new UpdateService({
      currentVersion: '0.1.11',
      disabled: true,
      readManifest: f.readManifest,
      selectBackend: f.selectBackend,
      canInstall: f.canInstall,
    });
    expect((await service.check()).status).toBe('disabled');
    expect(f.readManifest).toHaveBeenCalledTimes(1);
  });
  it('recovers from network/download failures without reporting success', async () => {
    const f = fixture();
    f.readManifest.mockRejectedValueOnce(new Error('offline'));
    expect((await f.service.check()).message).toBe('offline');
    await f.service.check();
    vi.mocked(f.backend.download).mockRejectedValueOnce(new Error('checksum mismatch'));
    expect((await f.service.download()).status).toBe('error');
    expect(f.backend.install).not.toHaveBeenCalled();
    await f.service.check();
    expect((await f.service.download()).status).toBe('ready');
  });
});

describe('Linux package ownership and system authorization', () => {
  it('selects apt only when the executable belongs to the webrad package', async () => {
    const run = vi.fn(async () => 'webrad: /usr/lib/webrad/WebRad\n');
    const installer = await detectLinuxInstaller('/usr/lib/webrad/WebRad', run);
    expect(installer?.kind).toBe('deb');
    expect(linuxInstallArguments(installer!, '/tmp/with space/update.deb')).toEqual([
      '/usr/bin/apt-get',
      'install',
      '--yes',
      '--',
      '/tmp/with space/update.deb',
    ]);
    expect(() => linuxInstallArguments(installer!, '/tmp/update.rpm')).toThrow();
  });
  it('selects dnf for a real RPM install and leaves portable copies manual', async () => {
    const run = vi.fn(async (file: string) => {
      if (file.endsWith('/dpkg-query')) throw new Error('not installed');
      return file.endsWith('/rpm') ? 'webrad' : 'version';
    });
    expect((await detectLinuxInstaller('/usr/lib64/webrad/WebRad', run))?.kind).toBe('rpm');
    expect(
      await detectLinuxInstaller('/tmp/WebRad', async () => {
        throw new Error('not owned');
      }),
    ).toBeUndefined();
  });
});
