import { createHash } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { get as getHttps } from 'node:https';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { UpdateTarget } from './update-release';

const updateHosts = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
]);

/** Every redirect is checked, not only the initial release URL. No cookies or tokens. */
export function validateUpdateUrl(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    !updateHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new Error('Update download is outside the trusted GitHub release hosts.');
  }
  return url;
}

async function responseFor(
  input: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<IncomingMessage> {
  const url = validateUpdateUrl(input);
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    // Keep the transport explicit: no renderer session, proxy credentials or auth headers.
    const request = getHttps(
      url,
      { signal, headers: { 'User-Agent': 'WebRad-Updater', 'Cache-Control': 'no-cache' } },
      resolve,
    );
    request.on('error', reject);
    request.setTimeout(30_000, () => request.destroy(new Error('Update connection timed out.')));
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
    response.resume();
    if (redirects >= 5 || !response.headers.location) throw new Error('Invalid update redirect.');
    return responseFor(new URL(response.headers.location, url).href, signal, redirects + 1);
  }
  if (response.statusCode !== 200) {
    response.resume();
    if (response.statusCode === 404) throw new Error('No public WebRad release is available yet.');
    throw new Error(`Update server returned HTTP ${String(response.statusCode)}.`);
  }
  return response;
}

export async function readUpdateManifest(url: string): Promise<unknown> {
  const response = await responseFor(url, AbortSignal.timeout(60_000));
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response) {
    const buffer = Buffer.from(chunk as Uint8Array);
    bytes += buffer.length;
    if (bytes > 128 * 1024) {
      response.destroy();
      throw new Error('Update manifest is too large.');
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function downloadUpdateArtifact(
  url: string,
  destination: string,
  target: UpdateTarget,
  progress: (percent: number) => void,
): Promise<void> {
  let created = false;
  const hash = createHash('sha256');
  let received = 0;
  try {
    const response = await responseFor(url, AbortSignal.timeout(15 * 60_000));
    const verifier = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > target.size)
          return callback(new Error('Update download exceeds the published size.'));
        hash.update(chunk);
        progress(Math.floor((received / target.size) * 100));
        callback(null, chunk);
      },
    });
    await pipeline(
      response,
      verifier,
      createWriteStream(destination, { flags: 'wx', mode: 0o644 }).once('open', () => {
        created = true;
      }),
    );
    if (received !== target.size || hash.digest('hex') !== target.sha256) {
      throw new Error('Update integrity check failed. Please download again.');
    }
  } catch (error) {
    if (created) await fs.rm(destination, { force: true });
    throw error;
  }
}
