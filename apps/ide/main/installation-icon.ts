import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import packageManifest from '../../../package.json';

interface InstallationIconOptions {
  readonly platform: NodeJS.Platform;
  readonly packaged: boolean;
  readonly executablePath: string;
  readonly resourcesPath: string;
  readonly arguments: readonly string[];
}

// Squirrel runs installation hooks before registering the Windows uninstall entry.
// Keep its icon local so installation and upgrades also work without network access.
export function synchronizeInstallationIcon(options: InstallationIconOptions): void {
  if (
    options.platform !== 'win32' ||
    !options.packaged ||
    options.arguments.includes('--squirrel-uninstall') ||
    options.arguments.includes('--squirrel-obsolete')
  ) {
    return;
  }

  const applicationDirectory = path.dirname(options.executablePath);
  const installationDirectory = path.dirname(applicationDirectory);
  if (
    !path.basename(applicationDirectory).startsWith('app-') ||
    !existsSync(path.join(installationDirectory, 'Update.exe'))
  ) {
    return;
  }

  const iconPath = path.join(installationDirectory, 'app.ico');
  const icon = readFileSync(path.join(options.resourcesPath, 'Icon.ico'));
  if (!existsSync(iconPath) || !readFileSync(iconPath).equals(icon)) {
    writeFileSync(iconPath, icon);
  }

  const applicationName = packageManifest.name.replaceAll('-', '_');
  const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${applicationName}`;
  const processOptions = { windowsHide: true, encoding: 'utf8' as const, timeout: 5_000 };
  const installing = options.arguments.includes('--squirrel-install');
  if (!installing) {
    // Normal startup repairs existing entries, without creating an incomplete entry.
    const registration = execFileSync('reg.exe', ['query', uninstallKey], processOptions);
    if (
      registration.split('\n').some((line) => {
        const value = line.trim();
        return value.startsWith('DisplayIcon ') && value.endsWith(`REG_SZ    ${iconPath}`);
      })
    ) {
      return;
    }
  }

  execFileSync(
    'reg.exe',
    ['add', uninstallKey, '/v', 'DisplayIcon', '/t', 'REG_SZ', '/d', iconPath, '/f'],
    processOptions,
  );
}
