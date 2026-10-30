import {
  createClient,
  type RestGoClient,
  type RestGoSessionStorageAdapter,
} from '@webrad/restgo-sdk';
import { setPageEventBinder } from './page-event-hooks.js';
import { bindPageRestGoEvents } from './restgo-page-events.js';
import { bindRestGoEmailConfirmation } from './restgo-email-confirmation.js';

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
let disposeEmailConfirmation: (() => void) | undefined;

/** Internal browser credential projection; never contains an IDE administrator token. */
export function getRestGoApplicationToken(): string {
  getRestGoClient();
  return applicationApiToken;
}

/** Creates the one shared client before authored page lifecycle handlers run. */
export function configureRestGo(configuration: RestGoRuntimeConfiguration): RestGoClient | null {
  setPageEventBinder(bindPageRestGoEvents);
  disposeEmailConfirmation?.();
  disposeEmailConfirmation = undefined;
  projectClient?.dispose();
  applicationApiToken = '';
  const storageRequest: {
    baseUrl: string;
    storageKey: string;
    storage?: RestGoSessionStorageAdapter;
  } = {
    baseUrl: configuration.baseUrl,
    storageKey: configuration.storageKey,
  };
  if (
    configuration.enabled &&
    configuration.persistSession &&
    configuration.sessionStorage === 'local' &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new CustomEvent('webrad:restgo-storage', { detail: storageRequest }));
  projectClient = configuration.enabled
    ? createClient(configuration.baseUrl, {
        apiToken: configuration.apiToken,
        apiVersion: configuration.apiVersion,
        defaultDatabase: configuration.defaultDatabase,
        persistSession: configuration.persistSession,
        sessionStorage: configuration.sessionStorage,
        storageKey: configuration.storageKey,
        ...(storageRequest.storage ? { storage: storageRequest.storage } : {}),
      })
    : null;
  applicationApiToken = projectClient === null ? '' : (configuration.apiToken ?? '');
  if (projectClient !== null && typeof window !== 'undefined')
    disposeEmailConfirmation = bindRestGoEmailConfirmation(projectClient, window);
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
