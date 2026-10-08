import { createClient, type RestGoClient } from '@webrad/restgo-sdk';

/** Browser-safe projection of the RestGO integration saved in the Project Model. */
export interface RestGoRuntimeConfiguration {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly apiToken?: string;
  readonly apiVersion: number;
  readonly defaultDatabase: string;
  readonly persistSession: boolean;
  readonly sessionStorage: 'local' | 'session' | 'memory';
  readonly storageKey: string;
}

export class RestGoNotConfiguredError extends Error {
  public constructor() {
    super('Enable and configure RestGO in RestGo integration > Connection before using RestGO.');
    this.name = 'RestGoNotConfiguredError';
  }
}

let projectClient: RestGoClient | null = null;
let applicationApiToken = '';

/** Internal browser credential projection; never contains an IDE administrator token. */
export function getRestGoApplicationToken(): string {
  getRestGoClient();
  return applicationApiToken;
}

/** Creates the one shared client before authored page lifecycle handlers run. */
export function configureRestGo(configuration: RestGoRuntimeConfiguration): RestGoClient | null {
  projectClient?.dispose();
  applicationApiToken = '';
  projectClient = configuration.enabled
    ? createClient(configuration.baseUrl, {
        apiToken: configuration.apiToken,
        apiVersion: configuration.apiVersion,
        defaultDatabase: configuration.defaultDatabase,
        persistSession: configuration.persistSession,
        sessionStorage: configuration.sessionStorage,
        storageKey: configuration.storageKey,
      })
    : null;
  applicationApiToken = projectClient === null ? '' : (configuration.apiToken ?? '');
  return projectClient;
}

/** Returns the project client, with an actionable error for disabled integration. */
export function getRestGoClient(): RestGoClient {
  if (projectClient === null) throw new RestGoNotConfiguredError();
  return projectClient;
}

/**
 * Stable facade used by both imports and the generated application's global.
 * SDK services retain their identity and methods execute on the actual client.
 */
export const RestGO: RestGoClient = new Proxy({} as RestGoClient, {
  get(_target, property: string | symbol): unknown {
    const client = getRestGoClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
