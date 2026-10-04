import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REST_GO_PROJECT_SETTINGS,
  RestGoProjectSettingsSchema,
  createProject,
  deserializeProject,
  deserializeProjectManifest,
  projectToManifest,
  safeParseProject,
  serializeProject,
  serializeProjectManifest,
  updateProjectSettings,
} from '../src/index.js';

describe('native RestGO project settings', () => {
  it('persists a public connection and session policy in aggregate and disk manifest', () => {
    const project = createProject('Portal');
    const restGo = {
      ...project.settings.restGo,
      enabled: true,
      baseUrl: 'https://api.example.test/restgo',
      apiVersion: 2,
      defaultDatabase: 'clientes',
      persistSession: true,
      sessionStorage: 'session' as const,
      storageKey: 'portal-session',
    };
    const updated = updateProjectSettings(project, { restGo });
    expect(deserializeProject(serializeProject(updated)).settings.restGo).toEqual(restGo);
    const manifest = projectToManifest(updated);
    expect(deserializeProjectManifest(serializeProjectManifest(manifest)).settings.restGo).toEqual(
      restGo,
    );
    expect(project.settings.restGo).toEqual(DEFAULT_REST_GO_PROJECT_SETTINGS);
    expect(updated.id).toBe(project.id);
    expect(updated.pages).toEqual(project.pages);
  });

  it('materializes independent defaults for existing v2 aggregates and manifests', () => {
    const project = createProject('Portal');
    const aggregate = JSON.parse(serializeProject(project)) as {
      settings: Record<string, unknown>;
    };
    delete aggregate.settings.restGo;
    const restored = deserializeProject(JSON.stringify(aggregate));
    expect(restored.settings.restGo).toEqual(DEFAULT_REST_GO_PROJECT_SETTINGS);
    expect(restored.settings.restGo).not.toBe(DEFAULT_REST_GO_PROJECT_SETTINGS);
    expect(deserializeProject(serializeProject(restored))).toEqual(restored);

    const manifest = JSON.parse(serializeProjectManifest(projectToManifest(project))) as {
      settings: Record<string, unknown>;
    };
    delete manifest.settings.restGo;
    expect(deserializeProjectManifest(JSON.stringify(manifest)).settings.restGo).toEqual(
      DEFAULT_REST_GO_PROJECT_SETTINGS,
    );
  });

  it('normalizes public settings without persisting credentials', () => {
    expect(
      RestGoProjectSettingsSchema.parse({
        ...DEFAULT_REST_GO_PROJECT_SETTINGS,
        enabled: true,
        baseUrl: ' https://api.example.test/proxy/ ',
        defaultDatabase: ' clientes ',
        storageKey: ' portal-session ',
      }),
    ).toMatchObject({
      baseUrl: 'https://api.example.test/proxy/',
      defaultDatabase: 'clientes',
      storageKey: 'portal-session',
    });
    for (const credential of ['masterToken', 'apiToken', 'password']) {
      const project = createProject('Portal');
      expect(
        safeParseProject({
          ...project,
          settings: {
            ...project.settings,
            restGo: { ...project.settings.restGo, [credential]: 'secret' },
          },
        }).success,
      ).toBe(false);
    }
  });

  it.each([
    '',
    'api.example.test',
    'ftp://api.example.test',
    'https://user:password@api.example.test',
    'https://user@api.example.test',
    'https://api.example.test?token=secret',
    'https://api.example.test?',
    'https://api.example.test#section',
    'https://api.example.test#',
    'https://api.example.test\\proxy',
    'https://api.example.test/path with spaces',
  ])('rejects invalid enabled instance URL %j', (baseUrl) => {
    expect(
      RestGoProjectSettingsSchema.safeParse({
        ...DEFAULT_REST_GO_PROJECT_SETTINGS,
        enabled: true,
        baseUrl,
      }).success,
    ).toBe(false);
  });

  it.each([
    { apiVersion: 0 },
    { apiVersion: 1.5 },
    { apiVersion: Number.MAX_SAFE_INTEGER + 1 },
    { apiVersion: Number.NaN },
    { defaultDatabase: '../private' },
    { defaultDatabase: 'database?token=secret' },
    { defaultDatabase: 'a'.repeat(129) },
    { storageKey: '' },
    { storageKey: 'a'.repeat(201) },
    { storageKey: 'invalid\u0001key' },
    { sessionStorage: 'disk' },
  ])('rejects invalid connection or session value %j', (patch) => {
    expect(
      RestGoProjectSettingsSchema.safeParse({ ...DEFAULT_REST_GO_PROJECT_SETTINGS, ...patch })
        .success,
    ).toBe(false);
  });
});
