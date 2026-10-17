import path from 'node:path';

export interface LinuxInstaller {
  readonly kind: 'deb' | 'rpm';
  readonly command: string;
  readonly arguments: readonly string[];
}

export type RunUpdateCommand = (file: string, arguments_: readonly string[]) => Promise<string>;

/** Only system package managers may elevate; never run a downloaded executable as root. */
export async function detectLinuxInstaller(
  executable: string,
  run: RunUpdateCommand,
): Promise<LinuxInstaller | undefined> {
  try {
    const owner = await run('/usr/bin/dpkg-query', ['--search', executable]);
    if (/^webrad(?::[a-z0-9]+)?: /m.test(owner)) {
      await run('/usr/bin/apt-get', ['--version']);

      return { kind: 'deb', command: '/usr/bin/apt-get', arguments: ['install', '--yes', '--'] };
    }
  } catch {
    /* Try RPM ownership on distributions without dpkg. */
  }
  try {
    const owner = (
      await run('/usr/bin/rpm', ['-qf', '--queryformat', '%{NAME}', executable])
    ).trim();
    if (owner !== 'webrad') return undefined;

    for (const command of ['/usr/bin/dnf', '/usr/bin/zypper']) {
      try {
        await run(command, ['--version']);
        return {
          kind: 'rpm',
          command,
          arguments: command.endsWith('/dnf')
            ? ['install', '--assumeyes', '--']
            : ['--non-interactive', 'install', '--'],
        };
      } catch {
        /* Try the next supported package manager. */
      }
    }
  } catch {
    /* A portable archive is not a package-managed installation. */
  }
  return undefined;
}

export function linuxInstallArguments(
  installer: LinuxInstaller,
  packageFile: string,
): readonly string[] {
  if (!path.posix.isAbsolute(packageFile) || !packageFile.endsWith(`.${installer.kind}`))
    throw new Error('Invalid Linux update package.');
  return [installer.command, ...installer.arguments, packageFile];
}
