import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadUpdateArtifact, readUpdateManifest } from './update-network';

const transport = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('node:https', () => ({ get: transport.get }));
const roots: string[] = [];

function respond(body: string, statusCode = 200, location?: string): void {
  transport.get.mockImplementationOnce(
    (_url: URL, _options: unknown, callback: (response: IncomingMessage) => void) => {
      const request = Object.assign(new EventEmitter(), { setTimeout: vi.fn() });
      const response = Object.assign(Readable.from([Buffer.from(body)]), {
        statusCode,
        headers: location ? { location } : {},
      });
      queueMicrotask(() => callback(response as unknown as IncomingMessage));
      return request;
    },
  );
}
afterEach(async () => {
  transport.get.mockReset();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('update download integrity', () => {
  it('follows trusted GitHub redirects and rejects an external redirect before connecting', async () => {
    respond('', 302, 'https://release-assets.githubusercontent.com/asset');
    respond('{"version":"0.2.0"}');
    expect(
      await readUpdateManifest(
        'https://github.com/Atentor/WebRad/releases/latest/download/webrad-update.json',
      ),
    ).toEqual({ version: '0.2.0' });
    expect(transport.get).toHaveBeenCalledTimes(2);
    transport.get.mockClear();
    respond('', 302, 'https://evil.example/installer');
    await expect(readUpdateManifest('https://github.com/asset')).rejects.toThrow('trusted');
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
  it('accepts a complete matching artifact and removes truncated, oversized and corrupted files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-update-network-'));
    roots.push(root);
    const data = 'verified update';
    const target = {
      platform: 'linux' as const,
      arch: 'x64' as const,
      kind: 'deb' as const,
      file: 'update.deb',
      size: Buffer.byteLength(data),
      sha256: createHash('sha256').update(data).digest('hex'),
      signed: false,
    };
    const progress = vi.fn();
    respond(data);
    const destination = path.join(root, 'valid.deb');
    await downloadUpdateArtifact('https://github.com/asset', destination, target, progress);
    expect(await fs.readFile(destination, 'utf8')).toBe(data);
    expect(progress).toHaveBeenLastCalledWith(100);
    respond(data);
    await expect(
      downloadUpdateArtifact('https://github.com/asset', destination, target, progress),
    ).rejects.toThrow();
    expect(await fs.readFile(destination, 'utf8')).toBe(data);
    for (const [name, body] of [
      ['truncated', data.slice(1)],
      ['oversized', data + 'x'],
      ['corrupted', data.toUpperCase()],
    ] as const) {
      respond(body);
      const file = path.join(root, `${name}.deb`);
      await expect(
        downloadUpdateArtifact('https://github.com/asset', file, target, progress),
      ).rejects.toThrow();
      await expect(fs.access(file)).rejects.toThrow();
    }
  });
  it('bounds manifest size and distinguishes a missing public release', async () => {
    respond('x'.repeat(128 * 1024 + 1));
    await expect(readUpdateManifest('https://github.com/asset')).rejects.toThrow('too large');
    respond('', 404);
    await expect(readUpdateManifest('https://github.com/asset')).rejects.toThrow(
      'No public WebRad release',
    );
  });
});
