import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { app } from 'electron';
import { downloadUpdateArtifact } from './update-network';
import { releaseAssetUrl, type UpdateManifest, type UpdateTarget } from './update-release';

/** Serve only the verified ARM package to the local Squirrel updater. */
export async function createWindowsArmUpdateFeed(
  repository: string,
  manifest: UpdateManifest,
  target: UpdateTarget,
  progress: (percent: number) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  if (!target.file.startsWith('arm64-') || !target.file.endsWith('-full.nupkg')) {
    throw new Error('Invalid Windows ARM64 update package name.');
  }
  const packageName = target.file.slice('arm64-'.length);
  const directory = await fs.mkdtemp(path.join(app.getPath('temp'), 'webrad-arm-update-'));
  const packagePath = path.join(directory, packageName);
  try {
    await downloadUpdateArtifact(
      releaseAssetUrl(repository, manifest.version, target.file),
      packagePath,
      target,
      progress,
    );
    const hash = createHash('sha1');
    for await (const chunk of createReadStream(packagePath)) hash.update(chunk);
    const releases = `${hash.digest('hex')} ${packageName} ${String(target.size)}\n`;
    const token = randomBytes(24).toString('hex');
    const prefix = `/${token}/`;
    const server = createServer((request, response) => {
      const pathname = (request.url ?? '/').split('?')[0];
      if (request.method !== 'GET') {
        response.writeHead(405).end();
      } else if (pathname === `${prefix}RELEASES`) {
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        response.end(releases);
      } else if (pathname === `${prefix}${encodeURIComponent(packageName)}`) {
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': target.size,
        });
        const stream = createReadStream(packagePath);
        stream.on('error', () => response.destroy());
        stream.pipe(response);
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Unable to start the local update feed.');
    }
    return {
      url: `http://127.0.0.1:${String(address.port)}${prefix.slice(0, -1)}`,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
        await fs.rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}
