// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  configureRestGo,
  getRestGoClient,
  RestGO,
  RestGoNotConfiguredError,
  type RestGoRuntimeConfiguration,
} from '../src/restgo.js';

const configuration: RestGoRuntimeConfiguration = {
  enabled: true,
  baseUrl: 'https://restgo.example.test',
  apiVersion: 2,
  defaultDatabase: 'clientes',
  persistSession: false,
  sessionStorage: 'memory',
  storageKey: 'runtime-restgo-test',
};

afterEach(() => {
  configureRestGo({ ...configuration, enabled: false });
});

describe('native RestGO project client', () => {
  it('shares SDK service instances across imported and global facade access', () => {
    const client = configureRestGo(configuration);
    expect(getRestGoClient()).toBe(client);
    expect(RestGO.auth).toBe(client?.auth);
    expect(RestGO.storage).toBe(client?.storage);
    expect(RestGO.auth).toBe(RestGO.auth);
  });

  it('reports disabled integration before any service operation can run', () => {
    expect(configureRestGo({ ...configuration, enabled: false })).toBeNull();
    expect(() => getRestGoClient()).toThrow(RestGoNotConfiguredError);
    expect(() => RestGO.auth).toThrow('Project Settings > APIs and integrations');
  });

  it('reconfigures the stable facade without retaining the previous services', () => {
    const firstClient = configureRestGo(configuration);
    const nextClient = configureRestGo({ ...configuration, baseUrl: 'https://next.example.test' });
    expect(nextClient).not.toBe(firstClient);
    expect(RestGO.auth).toBe(nextClient?.auth);
    expect(RestGO.storage).not.toBe(firstClient?.storage);
  });
});
