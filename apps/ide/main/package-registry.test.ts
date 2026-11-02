import { afterEach, describe, expect, it, vi } from 'vitest';
import { registryJson, searchNpmRegistry } from './package-registry';

afterEach(() => vi.unstubAllGlobals());
describe('official NPM registry transport', () => {
  it('uses the official paged endpoint and reports metadata with its offset', async () => {
    const fetch = vi.fn<(url: URL) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            objects: [
              {
                package: {
                  name: 'dayjs',
                  version: '1.11.13',
                  description: 'Dates',
                  links: { homepage: 'https://day.js.org' },
                },
              },
            ],
            total: 45,
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await searchNpmRegistry(
      { requestId: 'page', query: 'date helpers', offset: 20 },
      new AbortController().signal,
    );
    const url = fetch.mock.calls[0]?.[0] as URL | undefined;
    expect(url?.origin).toBe('https://registry.npmjs.org');
    expect(url?.pathname).toBe('/-/v1/search');
    expect(url?.searchParams.get('text')).toBe('date helpers');
    expect(url?.searchParams.get('from')).toBe('20');
    expect(url?.searchParams.get('size')).toBe('20');
    expect(result).toMatchObject({
      total: 45,
      offset: 20,
      packages: [{ name: 'dayjs', homepage: 'https://day.js.org' }],
    });
  });
  it('reports network and missing-package failures without claiming success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network unreachable');
      }),
    );
    await expect(
      registryJson(
        new URL('https://registry.npmjs.org/dayjs/latest'),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unable to connect');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    await expect(
      registryJson(
        new URL('https://registry.npmjs.org/no-package/latest'),
        new AbortController().signal,
      ),
    ).rejects.toThrow('does not exist');
  });
  it('cancels the fetch through AbortSignal and rejects oversized metadata', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: URL, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            }),
          ),
      ),
    );
    const pending = searchNpmRegistry({ requestId: 'cancel', query: 'dayjs' }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: { 'content-length': '3000000' } })),
    );
    await expect(
      registryJson(new URL('https://registry.npmjs.org'), new AbortController().signal),
    ).rejects.toThrow('too large');
  });
});
