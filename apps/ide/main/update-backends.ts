import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, autoUpdater, shell } from 'electron';
import { downloadUpdateArtifact } from './update-network';
import {
  detectLinuxInstaller,
  linuxInstallArguments,
  type LinuxInstaller,
} from './update-installers';
import { releaseAssetUrl, type UpdateManifest, type UpdateTarget } from './update-release';
import type { UpdateBackend } from './update-service';

const execute = promisify(execFile);

function nativeBackend(repository: string): UpdateBackend {
  return {
    mode: 'automatic',
    async download(manifest) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          autoUpdater.removeListener('error', failed);
          autoUpdater.removeListener('update-not-available', unavailable);
          autoUpdater.removeListener('update-downloaded', downloaded);
        };
        const failed = (error: Error): void => {
          cleanup();
          reject(error);
        };
        const unavailable = (): void =>
          failed(new Error('The updater could not find this release. Check for updates again.'));
        const downloaded = (): void => {
          cleanup();
          resolve();
        };

        autoUpdater.on('error', failed);
        autoUpdater.once('update-not-available', unavailable);
        autoUpdater.once('update-downloaded', downloaded);
        try {
          const feed =
            process.platform === 'darwin'
              ? releaseAssetUrl(repository, manifest.version, `webrad-darwin-${process.arch}.json`)
              : releaseAssetUrl(repository, manifest.version, 'RELEASES').slice(
                  0,
                  -'/RELEASES'.length,
                );
          autoUpdater.setFeedURL(
            process.platform === 'darwin' ? { url: feed, serverType: 'json' } : { url: feed },
          );
          autoUpdater.checkForUpdates();
        } catch (error) {
          failed(error instanceof Error ? error : new Error('Unable to start the native updater.'));
        }
      });
    },
    async install() {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          autoUpdater.removeListener('error', failed);
          autoUpdater.removeListener('before-quit-for-update', quitting);
        };
        const failed = (error: Error): void => {
          cleanup();
          reject(error);
        };
        const quitting = (): void => {
          cleanup();
          resolve();
        };
        autoUpdater.once('error', failed);
        autoUpdater.once('before-quit-for-update', quitting);
        try {
          autoUpdater.quitAndInstall();
        } catch (error) {
          failed(error instanceof Error ? error : new Error('Unable to restart for the update.'));
        }
      });
    },
  };
}

function downloadedBackend(repository: string, installer?: LinuxInstaller): UpdateBackend {
  let packageFile: string | undefined;
  let temporaryDirectory: string | undefined;
  const manualMessage =
    process.platform === 'darwin'
      ? 'This macOS build is not signed for automatic updates. The ZIP will be downloaded; replace WebRad.app in Applications to update.'
      : 'Automatic installation requires a WebRad package installed with a supported system package manager. The installer will be downloaded for you.';
  return {
    mode: installer ? 'automatic' : 'manual',
    message: installer
      ? 'WebRad will save your project, request system authorization and restart after installing.'
      : manualMessage,
    async download(manifest, target, progress) {
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = await fs.mkdtemp(path.join(app.getPath('temp'), 'webrad-update-'));
      // apt's sandbox user must be able to read the verified local .deb.
      if (installer) await fs.chmod(temporaryDirectory, 0o755);
      packageFile = path.join(temporaryDirectory, target.file);
      await downloadUpdateArtifact(
        releaseAssetUrl(repository, manifest.version, target.file),
        packageFile,
        target,
        progress,
      );
      if (!installer) shell.showItemInFolder(packageFile);
    },
    async install() {
      if (!installer || !packageFile) throw new Error('No verified update is ready to install.');
      // execFile passes paths literally. Authorization/cancellation belongs to polkit.
      await execute('/usr/bin/pkexec', [...linuxInstallArguments(installer, packageFile)], {
        timeout: 15 * 60_000,
        maxBuffer: 1024 * 1024,
      });
      if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
      app.relaunch();
      app.quit();
    },
  };
}

async function hasMacDeveloperSignature(): Promise<boolean> {
  try {
    const bundlePath = path.resolve(path.dirname(process.execPath), '../..');
    const result = await execute('/usr/bin/codesign', ['--display', '--verbose=4', bundlePath], {
      timeout: 10_000,
    });
    return /^TeamIdentifier=[A-Z0-9]+$/m.test(result.stderr);
  } catch {
    return false;
  }
}

export async function selectUpdateBackend(
  repository: string,
  manifest: UpdateManifest,
): Promise<{ target: UpdateTarget; backend: UpdateBackend }> {
  const targets = manifest.targets.filter(
    (target) => target.platform === process.platform && target.arch === process.arch,
  );
  if (process.platform === 'win32') {
    const target = targets.find((item) => item.kind === 'squirrel');
    if (!target) throw new Error('No Windows update is available for this architecture.');
    try {
      await fs.access(path.resolve(path.dirname(process.execPath), '..', 'Update.exe'));
    } catch {
      throw new Error('Install WebRad using its Windows Setup before using automatic updates.');
    }
    return { target, backend: nativeBackend(repository) };
  }
  if (process.platform === 'darwin') {
    const target = targets.find((item) => item.kind === 'mac');
    if (!target) throw new Error('No macOS update is available for this architecture.');
    return {
      target,
      backend:
        target.signed && (await hasMacDeveloperSignature())
          ? nativeBackend(repository)
          : downloadedBackend(repository),
    };
  }
  if (process.platform === 'linux') {
    const installer = await detectLinuxInstaller(
      await fs.realpath(process.execPath),
      async (file, arguments_) => {
        const { stdout } = await execute(file, [...arguments_], {
          timeout: 10_000,
          maxBuffer: 65536,
        });
        return stdout;
      },
    );
    const target = targets.find((item) => item.kind === (installer?.kind ?? 'deb'));
    if (!target)
      throw new Error('No Linux update is available for this package format and architecture.');
    let authorizedInstaller = installer;
    if (installer) {
      try {
        await execute('/usr/bin/pkexec', ['--version'], { timeout: 10_000 });
      } catch {
        authorizedInstaller = undefined;
      }
    }
    return { target, backend: downloadedBackend(repository, authorizedInstaller) };
  }
  throw new Error('Updates are not available for this operating system.');
}
