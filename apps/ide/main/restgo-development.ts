import { createClient, type RestGoClient, type RestGoSession } from '@webrad/restgo-sdk';
import { z } from 'zod';
import type { RestGoAdminTarget } from '../shared/restgo-admin';
import type { RestGoDevelopmentLogin, RestGoDevelopmentStatus } from '../shared/restgo-development';
import type { RestGoAdminCredentials } from './restgo-admin-credentials';

const targetSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .transform((value) => {
        const url = new URL(value);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          value.includes('\\') ||
          [...value].some(
            (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
          )
        ) {
          throw new Error(
            'Use a RestGo HTTP or HTTPS instance URL without credentials, query or fragment.',
          );
        }
        return url.href.replace(/\/+$/u, '');
      }),
  })
  .strict();
const loginSchema = targetSchema
  .extend({
    email: z.email().max(320),
    password: z.string().min(1).max(4096),
    remember: z.boolean(),
  })
  .strict();
const savedSchema = z
  .object({
    token: z.string().min(1).max(8192),
    expiresAt: z.iso.datetime({ offset: true }),
    refreshToken: z.string().min(1).max(8192).optional(),
    refreshExpiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Bound auth responses, refuse redirects and never attach administrative credentials. */
const authFetch: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, {
    ...init,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]),
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536) throw new Error('RestGo authentication response is too large.');
      chunks.push(chunk.value);
    }
  } finally {
    await reader?.cancel();
  }
  return new Response(response.status === 204 ? null : Buffer.concat(chunks), {
    status: response.status,
    headers: response.headers,
  });
};

/** Serialize rotation across IDE windows, with a separate encrypted vault from administration. */
export class RestGoDevelopmentService {
  private readonly queues = new Map<string, Promise<unknown>>();

  public constructor(private readonly credentials: RestGoAdminCredentials) {}

  private async exclusive<T>(baseUrl: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(baseUrl) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(baseUrl, next);
    try {
      return await next;
    } finally {
      if (this.queues.get(baseUrl) === next) this.queues.delete(baseUrl);
    }
  }

  private client(baseUrl: string): RestGoClient {
    return createClient(baseUrl, { persistSession: false, fetch: authFetch });
  }

  private async save(
    owner: number,
    baseUrl: string,
    session: RestGoSession,
    remember: boolean,
  ): Promise<void> {
    // Explicit allowlist: never persist the password or user/server metadata.
    const serialized = JSON.stringify({
      token: session.token,
      expiresAt: session.expiresAt,
      ...(session.refreshToken
        ? { refreshToken: session.refreshToken, refreshExpiresAt: session.refreshExpiresAt }
        : {}),
    });
    savedSchema.parse(JSON.parse(serialized));
    if (serialized.length > 8192)
      throw new Error('RestGo session exceeds the credential storage limit.');
    await this.credentials.set(owner, baseUrl, serialized, remember);
  }

  private async restore(
    owner: number,
    baseUrl: string,
    client: RestGoClient,
  ): Promise<RestGoSession | null> {
    const stored = await this.credentials.get(owner, baseUrl);
    if (!stored) return null;
    let parsed: z.infer<typeof savedSchema>;
    try {
      parsed = savedSchema.parse(JSON.parse(stored.token));
    } catch {
      await this.credentials.forget(baseUrl);
      return null;
    }
    await client.auth.ready;
    const result = await client.auth.setSession(parsed);
    if (result.error) {
      if (result.error.status === 401) {
        await this.credentials.forget(baseUrl);
        return null;
      }
      throw new Error(
        'Could not validate the development login. Check the RestGo instance and connection.',
      );
    }
    await this.save(owner, baseUrl, result.data, stored.storage === 'encrypted');
    return result.data;
  }

  public async status(owner: number, input: RestGoAdminTarget): Promise<RestGoDevelopmentStatus> {
    const { baseUrl } = targetSchema.parse(input);
    return this.exclusive(baseUrl, async () => {
      const client = this.client(baseUrl);
      try {
        const session = await this.restore(owner, baseUrl, client);
        return {
          ...(await this.credentials.status(owner, baseUrl)),
          email: session?.user.email ?? null,
        };
      } finally {
        client.dispose();
      }
    });
  }

  public async login(
    owner: number,
    input: RestGoDevelopmentLogin,
  ): Promise<RestGoDevelopmentStatus> {
    const { baseUrl, email, password, remember } = loginSchema.parse(input);
    return this.exclusive(baseUrl, async () => {
      const client = this.client(baseUrl);
      try {
        await client.auth.ready;
        const result = await client.login(email, password, remember);
        if (result.error)
          throw new Error(
            result.error.status === 401 || result.error.status === 400
              ? 'Development login failed. Check the email and password.'
              : 'Could not sign in. Check the RestGo instance, network and account status.',
          );
        await this.save(owner, baseUrl, result.data, remember);
        return {
          ...(await this.credentials.status(owner, baseUrl)),
          email: result.data.user.email,
        };
      } finally {
        client.dispose();
      }
    });
  }

  public async token(owner: number, input: RestGoAdminTarget): Promise<string> {
    const { baseUrl } = targetSchema.parse(input);
    return this.exclusive(baseUrl, async () => {
      const client = this.client(baseUrl);
      try {
        const session = await this.restore(owner, baseUrl, client);
        if (!session)
          throw new Error(
            'Sign in under RestGo connection > Development login, or enter a temporary Test JWT.',
          );
        return session.token;
      } finally {
        client.dispose();
      }
    });
  }

  public async logout(owner: number, input: RestGoAdminTarget): Promise<void> {
    const { baseUrl } = targetSchema.parse(input);
    return this.exclusive(baseUrl, async () => {
      const client = this.client(baseUrl);
      try {
        const session = await this.restore(owner, baseUrl, client);
        if (session) {
          const result = await client.logout();
          if (result.error && result.error.status !== 401)
            throw new Error('Could not revoke the server session.');
        }
      } catch {
        throw new Error(
          'Development login removed from this device. The server session could not be revoked.',
        );
      } finally {
        client.dispose();
        await this.credentials.forget(baseUrl);
      }
    });
  }
}
