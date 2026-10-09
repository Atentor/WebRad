import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  MAX_PROJECT_ASSET_BYTES,
  ProjectAssetSchema,
  type ProjectAsset,
} from '@webrad/project-model';

const mediaTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.css': 'text/css',
};

/** Called only with the path returned by the main process native file picker. */
export async function readSelectedProjectAsset(filePath: string): Promise<ProjectAsset> {
  const file = await fs.open(filePath, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Select a regular asset file.');
    if (stat.size > MAX_PROJECT_ASSET_BYTES) throw new Error('Assets must be at most 20 MB.');
    const content = await file.readFile();
    if (content.length > MAX_PROJECT_ASSET_BYTES) throw new Error('Assets must be at most 20 MB.');
    return ProjectAssetSchema.parse({
      id: randomUUID(),
      fileName: path.basename(filePath),
      mediaType: mediaTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      base64: content.toString('base64'),
    });
  } finally {
    await file.close();
  }
}
