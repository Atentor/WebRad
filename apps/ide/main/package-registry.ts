import { z } from 'zod';
import type { PackageSearchRequest, PackageSearchResult } from '../shared/package-contracts';

const registryPackageSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  links: z.object({ homepage: z.string().optional() }).optional(),
});

export async function registryJson(url: URL, signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
  } catch (error) {
    if (signal.aborted) throw new Error('NPM registry request cancelled.', { cause: error });
    throw new Error(
      `Unable to connect to the NPM registry. Check your network connection and proxy settings. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (!response.ok) {
    if (response.status === 404)
      throw new Error('The package or version does not exist in the NPM registry.');
    throw new Error(
      `The NPM registry returned HTTP ${response.status}. Try again after checking your connection.`,
    );
  }
  if (Number(response.headers.get('content-length') ?? 0) > 2_000_000)
    throw new Error('The NPM registry response is too large.');
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('The NPM registry returned an empty response.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error('The NPM registry response is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function searchNpmRegistry(
  request: PackageSearchRequest,
  signal: AbortSignal,
): Promise<PackageSearchResult> {
  const offset = request.offset ?? 0;
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', request.query);
  url.searchParams.set('from', String(offset));
  url.searchParams.set('size', '20');
  const response = z
    .object({ objects: z.array(z.object({ package: registryPackageSchema })), total: z.number() })
    .parse(await registryJson(url, signal));
  return {
    offset,
    total: response.total,
    packages: response.objects.map(({ package: pkg }) => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description ?? '',
      homepage: pkg.homepage ?? pkg.links?.homepage,
      license: pkg.license,
    })),
  };
}

const latest = new Map<string, { version: string; timestamp: number }>();
export async function latestPackageVersion(
  name: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const cached = latest.get(name);
  if (cached !== undefined && Date.now() - cached.timestamp < 300_000) return cached.version;
  try {
    const pkg = registryPackageSchema.parse(
      await registryJson(
        new URL(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`),
        signal,
      ),
    );
    latest.set(name, { version: pkg.version, timestamp: Date.now() });
    while (latest.size > 1000) {
      const first = latest.keys().next().value;
      if (first !== undefined) latest.delete(first);
    }
    return pkg.version;
  } catch {
    return undefined;
  }
}
