import { RestGoApiClient, type RestGoEndpoint, type RestGoEndpointOptions } from './api';
import { RestGoAuthClient } from './auth';
import { RestGoStorageClient } from './storage';
import { RestGoTransport } from './transport';
import type { RestGoClientOptions } from './types';

export class RestGoClient {
  readonly auth: RestGoAuthClient;
  readonly storage: RestGoStorageClient;
  readonly api: RestGoApiClient;
  readonly baseUrl: string;

  constructor(baseUrl: string, options: RestGoClientOptions = {}) {
    const transport = new RestGoTransport(baseUrl, options);
    this.baseUrl = transport.baseUrl;
    this.auth = new RestGoAuthClient(transport, options);
    this.storage = new RestGoStorageClient(transport);
    this.api = new RestGoApiClient(transport);
  }

  from<T = unknown>(endpoint: string, options: RestGoEndpointOptions = {}): RestGoEndpoint<T> {
    return this.api.endpoint<T>(endpoint, options);
  }
}

export function createClient(baseUrl: string, options: RestGoClientOptions = {}): RestGoClient {
  return new RestGoClient(baseUrl, options);
}
