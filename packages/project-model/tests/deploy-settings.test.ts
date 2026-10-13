import { describe, expect, it } from 'vitest';
import {
  ProjectBuildSettingsSchema,
  ProjectPwaSettingsSchema,
  createProject,
  deserializeProject,
  deserializeProjectManifest,
  projectToManifest,
  serializeProject,
  serializeProjectManifest,
  updateProjectSettings,
} from '../src/index.js';

describe('deploy and PWA project settings', () => {
  it('creates explicit production delivery and disabled PWA defaults', () => {
    const { settings } = createProject('Portal');
    expect(settings.build).toEqual({
      deployDirectory: '',
      environment: 'production',
      minify: true,
      sourceMaps: false,
    });
    expect(settings.pwa).toEqual({
      enabled: false,
      shortName: '',
      display: 'standalone',
      orientation: 'any',
      themeColor: '#2563eb',
      backgroundColor: '#ffffff',
      offline: true,
    });
  });

  it('persists build destination and PWA metadata in project and disk manifest', () => {
    const initial = createProject('Portal');
    const build = {
      ...initial.settings.build,
      deployDirectory: 'C:\\Hosting\\Portal',
      sourceMaps: true,
    };
    const pwa = {
      ...initial.settings.pwa,
      enabled: true,
      shortName: 'Portal',
      themeColor: '#123456',
    };
    const updated = updateProjectSettings(initial, { build, pwa });
    const settings = deserializeProject(serializeProject(updated)).settings;
    const manifestSettings = deserializeProjectManifest(
      serializeProjectManifest(projectToManifest(updated)),
    ).settings;
    expect(settings.build).toEqual(build);
    expect(settings.pwa).toEqual(pwa);
    expect(manifestSettings.build).toEqual(build);
    expect(manifestSettings.pwa).toEqual(pwa);
    expect(initial.settings.pwa.enabled).toBe(false);
  });

  it.each([
    '',
    'hosting/portal',
    '/var/www/portal',
    'C:\\Hosting\\Portal',
    'C:/Hosting/Portal',
    '\\\\server\\hosting\\portal',
  ])('accepts a deploy destination %j', (deployDirectory) => {
    const { build } = createProject('Portal').settings;
    expect(ProjectBuildSettingsSchema.safeParse({ ...build, deployDirectory }).success).toBe(true);
  });

  it.each([
    '../hosting',
    'hosting/../portal',
    './hosting',
    'C:Hosting',
    'hosting\u0000portal',
    'hosting\nportal',
  ])('rejects unsafe deploy destination %j', (deployDirectory) => {
    const { build } = createProject('Portal').settings;
    expect(ProjectBuildSettingsSchema.safeParse({ ...build, deployDirectory }).success).toBe(false);
  });

  it('normalizes user-entered names and destination whitespace', () => {
    const { build, pwa } = createProject('Portal').settings;
    expect(
      ProjectBuildSettingsSchema.parse({ ...build, deployDirectory: '  hosting/portal  ' })
        .deployDirectory,
    ).toBe('hosting/portal');
    expect(ProjectPwaSettingsSchema.parse({ ...pwa, shortName: '  Portal  ' }).shortName).toBe(
      'Portal',
    );
  });

  it.each([
    { display: 'browser' },
    { orientation: 'diagonal' },
    { themeColor: 'red' },
    { backgroundColor: '#abc' },
    { shortName: 'x'.repeat(33) },
    { offline: 'true' },
  ])('rejects unsupported PWA configuration %j', (patch) => {
    expect(
      ProjectPwaSettingsSchema.safeParse({ ...createProject('Portal').settings.pwa, ...patch })
        .success,
    ).toBe(false);
  });
});
