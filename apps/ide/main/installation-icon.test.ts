import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { synchronizeInstallationIcon } from './installation-icon';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

describe('Squirrel installation icon', () => {
  let directory: string;
  let resourcesPath: string;
  let executablePath: string;
  const icon = Buffer.from('bundled WebRAD icon');
  const registry = vi.mocked(execFileSync);

  beforeEach(() => {
    vi.resetAllMocks();
    directory = mkdtempSync(path.join(os.tmpdir(), 'webrad installation '));
    resourcesPath = path.join(directory, 'app-0.1.3', 'resources');
    executablePath = path.join(directory, 'app-0.1.3', 'WebRad.exe');
    mkdirSync(resourcesPath, { recursive: true });
    writeFileSync(path.join(resourcesPath, 'Icon.ico'), icon);
    writeFileSync(path.join(directory, 'Update.exe'), 'updater');
    registry.mockReturnValue('DisplayName    REG_SZ    WebRad\r\n');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function synchronize(
    arguments_: readonly string[] = [],
    platform: NodeJS.Platform = 'win32',
    packaged = true,
  ): void {
    synchronizeInstallationIcon({
      platform,
      packaged,
      executablePath,
      resourcesPath,
      arguments: arguments_,
    });
  }

  it('installs the bundled icon and registers its local path before Squirrel creates the entry', () => {
    synchronize(['--squirrel-install']);
    const iconPath = path.join(directory, 'app.ico');
    expect(readFileSync(iconPath)).toEqual(icon);
    expect(registry).toHaveBeenCalledExactlyOnceWith(
      'reg.exe',
      [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\webrad',
        '/v',
        'DisplayIcon',
        '/t',
        'REG_SZ',
        '/d',
        iconPath,
        '/f',
      ],
      { windowsHide: true, encoding: 'utf8', timeout: 5_000 },
    );
  });

  it('replaces an old Electron icon during normal startup and repairs the registered icon', () => {
    writeFileSync(path.join(directory, 'app.ico'), 'old Electron icon');
    synchronize();
    expect(readFileSync(path.join(directory, 'app.ico'))).toEqual(icon);
    expect(registry).toHaveBeenCalledTimes(2);
    expect(registry.mock.calls[1]?.[1]).toContain('DisplayIcon');
  });

  it('repairs the icon during an update without changing a correct registration', () => {
    writeFileSync(path.join(directory, 'app.ico'), 'old Electron icon');
    registry.mockReturnValue(`    DisplayIcon    REG_SZ    ${path.join(directory, 'app.ico')}\r\n`);
    synchronize(['--squirrel-updated']);
    expect(readFileSync(path.join(directory, 'app.ico'))).toEqual(icon);
    expect(registry).toHaveBeenCalledTimes(1);
  });

  it('does not create a partial uninstall entry when the existing registration is unavailable', () => {
    registry.mockImplementation(() => {
      throw new Error('Registry key not found');
    });
    expect(() => synchronize()).toThrow('Registry key not found');
    expect(registry).toHaveBeenCalledTimes(1);
  });

  it.each(['--squirrel-uninstall', '--squirrel-obsolete'])(
    'does not restore installation files during %s',
    (argument) => {
      synchronize([argument]);
      expect(existsSync(path.join(directory, 'app.ico'))).toBe(false);
      expect(registry).not.toHaveBeenCalled();
    },
  );

  it('leaves development, Linux and portable applications untouched', () => {
    synchronize([], 'win32', false);
    synchronize([], 'linux');
    rmSync(path.join(directory, 'Update.exe'));
    synchronize();
    expect(existsSync(path.join(directory, 'app.ico'))).toBe(false);
    expect(registry).not.toHaveBeenCalled();
  });
});
