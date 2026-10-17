import { z } from 'zod';
import type {
  RestGoAdminCatalog,
  RestGoAdminConnectRequest,
  RestGoAdminEndpoint,
  RestGoAdminPublication,
  RestGoAdminRecordRequest,
  RestGoAdminSaveEndpointRequest,
  RestGoAdminSavePublicationRequest,
  RestGoAdminStateRequest,
  RestGoAdminStatus,
  RestGoAdminTarget,
} from '../shared/restgo-admin';
import type { RestGoAdminCredentials } from './restgo-admin-credentials';

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const recordId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const httpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    hasControlCharacters(value) ||
    value.includes('\\')
  ) {
    throw new Error(
      'Use a RestGo HTTP or HTTPS instance URL without credentials, query or fragment.',
    );
  }
  return url.href.replace(/\/+$/u, '');
}

const targetSchema = z
  .object({ baseUrl: z.string().min(1).max(2_048).transform(normalizedBaseUrl) })
  .strict();
const tokenSchema = z
  .string()
  .min(1)
  .max(8_192)
  .refine((token) => !hasControlCharacters(token));
const connectSchema = targetSchema.extend({ token: tokenSchema, remember: z.boolean() }).strict();
const recordSchema = targetSchema.extend({ id: recordId }).strict();
const stateSchema = recordSchema.extend({ active: z.boolean() }).strict();
const endpointInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[a-zA-Z0-9_-]+$/u),
    script: z.string().max(1_000_000),
    metodo: httpMethod,
    versao: recordId.max(2_147_483_647),
    tipo: z.enum(['normal', 'operation']),
    idoperacao: recordId.nullable(),
  })
  .strict()
  .superRefine((endpoint, context) => {
    if (endpoint.tipo === 'operation' && (endpoint.idoperacao === null || endpoint.script.trim())) {
      context.addIssue({
        code: 'custom',
        message: 'An operation endpoint requires an API Operation and cannot contain SQL.',
      });
    }
    if (endpoint.tipo === 'normal' && endpoint.idoperacao !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A SQL endpoint cannot select an API Operation.',
      });
    }
  });
const saveEndpointSchema = targetSchema
  .extend({ id: recordId.optional(), endpoint: endpointInputSchema })
  .strict();
const publicationInputSchema = z
  .object({
    idbanco: recordId,
    idendpoint: recordId,
    requiresAuthentication: z.boolean(),
    isPublic: z.boolean(),
  })
  .strict()
  .refine((publication) => !(publication.isPublic && publication.requiresAuthentication), {
    message: 'A public publication cannot require user authentication.',
  });
const savePublicationSchema = targetSchema
  .extend({ id: recordId.optional(), publication: publicationInputSchema })
  .strict();

// Response schemas retain RestGo's public field spelling while discarding unrelated data.
const endpointSchema = z.object({
  id: recordId,
  ativo: z.boolean(),
  slug: z.string(),
  script: z.string(),
  metodo: httpMethod,
  versao: recordId,
  tipo: z.enum(['normal', 'operation']).default('normal'),
  idoperacao: recordId.nullable().default(null),
});
const databaseSchema = z.object({
  id: recordId,
  ativo: z.boolean(),
  slug: z.string(),
  host: z.string(),
  port: z.number().int().min(1).max(65_535),
  database: z.string(),
  descri: z.string(),
  sslMode: z.string(),
});
const publicationSchema = z.object({
  id: recordId,
  ativo: z.boolean(),
  idbanco: recordId,
  idendpoint: recordId.nullable().default(null),
  requiresAuthentication: z.boolean(),
  isPublic: z.boolean().default(false),
  bancoSlug: z.string().default(''),
  endpointSlug: z.string().default(''),
  versao: z.number().int().min(0),
});
const operationSchema = z.object({
  id: recordId,
  ativo: z.boolean(),
  nome: z.string(),
  parametrosEntrada: z
    .array(
      z.object({
        nome: z.string(),
        tipo: z.enum(['string', 'numeric', 'data', 'boolean', '']).optional(),
        valorTeste: z.json().optional(),
      }),
    )
    .nullable()
    .optional()
    .transform((parameters) => parameters ?? []),
});

type CatalogResource = 'endpoints' | 'bancos' | 'endpoints-bancos' | 'api-operations';
type MutationResource = 'endpoints' | 'endpoints-bancos';

/** Only fixed administration routes are reachable through the preload capability. */
export class RestGoAdminService {
  public constructor(private readonly credentials: RestGoAdminCredentials) {}

  private async request(
    baseUrl: string,
    token: string,
    resource: CatalogResource,
    method: 'GET' | 'POST' | 'PUT',
    options: {
      readonly id?: number;
      readonly active?: boolean;
      readonly page?: number;
      readonly body?: unknown;
    } = {},
  ): Promise<unknown> {
    let route = resource;
    if (options.id !== undefined) route += `/${options.id}`;
    if (options.active !== undefined) route += options.active ? '/activate' : '/deactivate';
    const url = new URL(`${baseUrl}/${route}`);
    if (options.page !== undefined) {
      url.searchParams.set('page', String(options.page));
      url.searchParams.set('page_size', '200');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: token,
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'error',
      });
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader !== undefined) {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_RESPONSE_BYTES) {
              await reader.cancel();
              throw new Error('RestGo response exceeds the 16 MB administration limit.');
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      if (response.status === 401) {
        this.credentials.reject(baseUrl, token);
        throw new Error(
          'RestGo HTTP 401: Administrative access expired or was rejected. Reconnect with an administrative API token.',
        );
      }
      const bytes = Buffer.concat(chunks);
      let result: unknown;
      try {
        result = bytes.length === 0 ? null : JSON.parse(bytes.toString('utf8'));
      } catch {
        throw new Error(`RestGo returned an invalid JSON response (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        const failure = z.object({ error: z.string() }).safeParse(result);
        if (
          response.status === 403 &&
          failure.success &&
          failure.data.error === 'administrator permission required'
        ) {
          this.credentials.reject(baseUrl, token);
          throw new Error(
            'RestGo HTTP 403: This token has no administrative permission. Connect an administrative API token.',
          );
        }
        const reason = (failure.success ? failure.data.error : response.statusText)
          .split(token)
          .join('[credential]');
        throw new Error(`RestGo HTTP ${response.status}: ${reason.slice(0, 1_000)}`);
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('RestGo administration request timed out after 30 seconds.', {
          cause: error,
        });
      if (error instanceof TypeError) {
        throw new Error(
          'Could not reach RestGo. Check the instance URL, network and TLS certificate; redirects are refused.',
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async token(ownerId: number, baseUrl: string): Promise<string> {
    const credential = await this.credentials.get(ownerId, baseUrl);
    if (credential === undefined)
      throw new Error('Connect an administrative RestGo API Token first.');
    return credential.token;
  }

  private async list<T>(
    baseUrl: string,
    token: string,
    resource: CatalogResource,
    schema: z.ZodType<T>,
  ): Promise<T[]> {
    const entries: T[] = [];
    let size = 0;
    const pageSchema = z.object({ data: z.array(schema), has_more: z.boolean() });
    for (let page = 1; page <= 100; page++) {
      const result = await this.request(baseUrl, token, resource, 'GET', { page });
      size += JSON.stringify(result).length;
      if (size > MAX_CATALOG_BYTES)
        throw new Error('The RestGo catalog exceeds the 32 MB administration limit.');
      // Accept legacy RestGo list responses as well as the current paginated response.
      if (Array.isArray(result)) return z.array(schema).parse(result);
      const current = pageSchema.parse(result);
      entries.push(...current.data);
      if (!current.has_more) return entries;
      if (current.data.length === 0)
        throw new Error('RestGo returned an inconsistent catalog page.');
    }
    throw new Error(
      'The RestGo catalog exceeds 20,000 records. Narrow the instance catalog before importing it.',
    );
  }

  public async status(ownerId: number, input: RestGoAdminTarget): Promise<RestGoAdminStatus> {
    const request = targetSchema.parse(input);
    return this.credentials.status(ownerId, request.baseUrl);
  }

  public async connect(
    ownerId: number,
    input: RestGoAdminConnectRequest,
  ): Promise<RestGoAdminStatus> {
    const request = connectSchema.parse(input);
    const result = await this.request(request.baseUrl, request.token, 'endpoints', 'GET', {
      page: 1,
    });
    if (Array.isArray(result)) z.array(endpointSchema).parse(result);
    else z.object({ data: z.array(endpointSchema), has_more: z.boolean() }).parse(result);
    return this.credentials.set(ownerId, request.baseUrl, request.token, request.remember);
  }

  public async disconnect(_ownerId: number, input: RestGoAdminTarget): Promise<void> {
    const request = targetSchema.parse(input);
    await this.credentials.forget(request.baseUrl);
  }

  public async catalog(ownerId: number, input: RestGoAdminTarget): Promise<RestGoAdminCatalog> {
    const request = targetSchema.parse(input);
    const token = await this.token(ownerId, request.baseUrl);
    const [endpoints, bancos, publications, operations] = await Promise.all([
      this.list(request.baseUrl, token, 'endpoints', endpointSchema),
      this.list(request.baseUrl, token, 'bancos', databaseSchema),
      this.list(request.baseUrl, token, 'endpoints-bancos', publicationSchema),
      this.list(request.baseUrl, token, 'api-operations', operationSchema),
    ]);
    return { endpoints, bancos, publications, operations };
  }

  public async getEndpoint(
    ownerId: number,
    input: RestGoAdminRecordRequest,
  ): Promise<RestGoAdminEndpoint> {
    const request = recordSchema.parse(input);
    const token = await this.token(ownerId, request.baseUrl);
    return endpointSchema.parse(
      await this.request(request.baseUrl, token, 'endpoints', 'GET', { id: request.id }),
    );
  }

  public async saveEndpoint(
    ownerId: number,
    input: RestGoAdminSaveEndpointRequest,
  ): Promise<RestGoAdminEndpoint> {
    const request = saveEndpointSchema.parse(input);
    const token = await this.token(ownerId, request.baseUrl);
    return endpointSchema.parse(
      await this.request(
        request.baseUrl,
        token,
        'endpoints',
        request.id === undefined ? 'POST' : 'PUT',
        { id: request.id, body: request.endpoint },
      ),
    );
  }

  public async savePublication(
    ownerId: number,
    input: RestGoAdminSavePublicationRequest,
  ): Promise<RestGoAdminPublication> {
    const request = savePublicationSchema.parse(input);
    const token = await this.token(ownerId, request.baseUrl);
    const result = await this.request(
      request.baseUrl,
      token,
      'endpoints-bancos',
      request.id === undefined ? 'POST' : 'PUT',
      { id: request.id, body: request.publication },
    );
    // RestGo's update response omits ativo; get the actual persisted state afterwards.
    const id = z.object({ id: recordId }).parse(result).id;
    return publicationSchema.parse(
      await this.request(request.baseUrl, token, 'endpoints-bancos', 'GET', { id }),
    );
  }

  private async setActive(
    ownerId: number,
    input: RestGoAdminStateRequest,
    resource: MutationResource,
  ): Promise<void> {
    const request = stateSchema.parse(input);
    const token = await this.token(ownerId, request.baseUrl);
    await this.request(request.baseUrl, token, resource, 'POST', {
      id: request.id,
      active: request.active,
    });
  }

  public async setEndpointActive(ownerId: number, input: RestGoAdminStateRequest): Promise<void> {
    await this.setActive(ownerId, input, 'endpoints');
  }

  public async setPublicationActive(
    ownerId: number,
    input: RestGoAdminStateRequest,
  ): Promise<void> {
    await this.setActive(ownerId, input, 'endpoints-bancos');
  }
}
