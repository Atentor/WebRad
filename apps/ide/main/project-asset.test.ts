import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PROJECT_ASSET_BYTES } from '@webrad/project-model';
import { readSelectedProjectAsset } from './project-asset';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('native selected asset reader', () => {
  it('captures exact bytes and a portable filename without exposing the selected filesystem path', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-asset-reader-'));
    directories.push(directory);
    const file = path.join(directory, 'Logo.PNG');
    await fs.writeFile(file, Buffer.from([0, 255, 1]));
    const asset = await readSelectedProjectAsset(file);
    expect(asset).toMatchObject({ fileName: 'Logo.PNG', mediaType: 'image/png', base64: 'AP8B' });
    expect(JSON.stringify(asset)).not.toContain(directory);
    await fs.truncate(file, MAX_PROJECT_ASSET_BYTES + 1);
    await expect(readSelectedProjectAsset(file)).rejects.toThrow('20 MB');
  });
});
