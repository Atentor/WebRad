import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestGoAdminCredentials } from './restgo-admin-credentials';
import { RestGoAdminService } from './restgo-admin';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    getSelectedStorageBackend: vi.fn(() => 'basic_text'),
  },
}));

const baseUrl = 'https://restgo.example.test/backend';
const token = 'rgo.administrative-secret';
const endpoint = {
  id: 7,
  ativo: true,
  slug: 'customers',
  script: 'SELECT * FROM customers',
  metodo: 'GET' as const,
  versao: 2,
  tipo: 'normal' as const,
  idoperacao: null,
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RestGo design-time administration', () => {
  const fetcher = vi.fn<typeof fetch>();
  let credentials: RestGoAdminCredentials;
  let service: RestGoAdminService;

  beforeEach(() => {
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    credentials = new RestGoAdminCredentials();
    service = new RestGoAdminService(credentials);
  });

  afterEach(() => vi.unstubAllGlobals());

  async function connect(): Promise<void> {
    fetcher.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    await service.connect(11, { baseUrl, token, remember: false });
  }

  it('verifies administrative permission before retaining a token and redacts server echoes', async () => {
    fetcher.mockResolvedValueOnce(jsonResponse({ error: `Rejected ${token}` }, 403));
    await expect(service.connect(11, { baseUrl, token, remember: true })).rejects.toThrow(
      'RestGo HTTP 403: Rejected [credential]',
    );
    expect(await service.status(11, { baseUrl })).toMatchObject({
      connected: false,
      storage: 'none',
    });
  });

  it('sends the exact raw administrative Authorization only to fixed routes and refuses redirects', async () => {
    await connect();
    fetcher.mockResolvedValueOnce(jsonResponse(endpoint));
    await service.getEndpoint(11, { baseUrl: `${baseUrl}/`, id: 7 });
    const call = fetcher.mock.calls[1];
    expect(String(call?.[0])).toBe(`${baseUrl}/endpoints/7`);
    expect(call?.[1]).toMatchObject({
      method: 'GET',
      headers: { Authorization: token },
      redirect: 'error',
      credentials: 'omit',
    });
    await expect(service.getEndpoint(11, { baseUrl, id: -1 })).rejects.toThrow();
    await expect(
      service.status(11, { baseUrl: 'https://user:secret@restgo.example.test' }),
    ).rejects.toThrow();
    await expect(service.status(11, { baseUrl: `${baseUrl}?route=/auth/users` })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('collects current paginated catalogs and normalizes omitted optional fields', async () => {
    await connect();
    fetcher.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/endpoints')) {
        return url.searchParams.get('page') === '1'
          ? jsonResponse({ data: [endpoint], has_more: true })
          : jsonResponse({ data: [{ ...endpoint, id: 8, metodo: 'POST' }], has_more: false });
      }
      if (url.pathname.endsWith('/api-operations')) {
        return jsonResponse({
          data: [{ id: 4, ativo: true, nome: 'CreateCustomer' }],
          has_more: false,
        });
      }
      return jsonResponse({ data: [], has_more: false });
    });
    const catalog = await service.catalog(11, { baseUrl });
    expect(catalog.endpoints.map((item) => item.id)).toEqual([7, 8]);
    expect(catalog.operations[0]?.parametrosEntrada).toEqual([]);
    expect(catalog.bancos).toEqual([]);
    expect(
      fetcher.mock.calls.every(
        (call) => new URL(String(call[0])).searchParams.get('page_size') === '200',
      ),
    ).toBe(true);
  });

  it('reads persisted publication state after save because RestGo update omits ativo', async () => {
    await connect();
    const publication = {
      idbanco: 3,
      idendpoint: 7,
      requiresAuthentication: false,
      isPublic: true,
    };
    fetcher.mockResolvedValueOnce(jsonResponse({ id: 9, ...publication, versao: 2 }));
    fetcher.mockResolvedValueOnce(jsonResponse({ id: 9, ...publication, ativo: false, versao: 2 }));
    const saved = await service.savePublication(11, { baseUrl, id: 9, publication });
    expect(saved.ativo).toBe(false);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(`${baseUrl}/endpoints-bancos/9`);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('GET');
  });

  it('keeps unavailable OS encryption session-only, isolates windows and forgets credentials', async () => {
    fetcher.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    const status = await service.connect(11, { baseUrl, token, remember: true });
    expect(status).toMatchObject({
      connected: true,
      storage: 'session',
      encryptionAvailable: false,
    });
    expect(JSON.stringify(status)).not.toContain(token);
    expect(await service.status(12, { baseUrl })).toMatchObject({ connected: false });
    credentials.release(11);
    expect(await service.status(11, { baseUrl })).toMatchObject({ connected: false });
    await connect();
    await service.disconnect(11, { baseUrl });
    await expect(service.getEndpoint(11, { baseUrl, id: 7 })).rejects.toThrow(
      'Connect an administrative',
    );
  });

  it('rejects unsafe endpoint/publication inputs without a network mutation', async () => {
    await connect();
    const { id, ativo, ...input } = endpoint;
    void id;
    void ativo;
    await expect(
      service.saveEndpoint(11, {
        baseUrl,
        endpoint: { ...input, tipo: 'operation', idoperacao: 4 },
      }),
    ).rejects.toThrow('cannot contain SQL');
    await expect(
      service.savePublication(11, {
        baseUrl,
        publication: { idbanco: 3, idendpoint: 7, requiresAuthentication: true, isPublic: true },
      }),
    ).rejects.toThrow('public publication');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('invalidates a rejected administrative token while preserving a newer connection', async () => {
    await connect();
    fetcher.mockResolvedValueOnce(jsonResponse({ error: 'authentication required' }, 401));
    await expect(service.getEndpoint(11, { baseUrl, id: 7 })).rejects.toThrow(
      'Administrative access expired or was rejected',
    );
    expect(await service.status(11, { baseUrl })).toMatchObject({
      connected: false,
      storage: 'none',
    });
    await expect(service.catalog(11, { baseUrl })).rejects.toThrow('Connect an administrative');
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    await service.connect(11, { baseUrl, token: 'rgo.new-administrative-token', remember: false });
    credentials.reject(baseUrl, token);
    expect(await service.status(11, { baseUrl })).toMatchObject({ connected: true });
  });

  it('preserves administrative credentials after transient server failures', async () => {
    await connect();
    fetcher.mockResolvedValueOnce(jsonResponse({ error: 'temporary failure' }, 503));
    await expect(service.getEndpoint(11, { baseUrl, id: 7 })).rejects.toThrow('RestGo HTTP 503');
    expect(await service.status(11, { baseUrl })).toMatchObject({ connected: true });
  });
});
