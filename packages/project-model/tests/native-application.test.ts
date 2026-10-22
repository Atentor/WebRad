import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NATIVE_APPLICATION_SETTINGS,
  NativeApplicationSettingsSchema,
  createProject,
  deserializeProject,
  deserializeProjectManifest,
  getNativeArchitectures,
  getNativeBundleFormats,
  projectToManifest,
  safeParseProject,
  serializeProject,
  serializeProjectManifest,
  updateProjectSettings,
} from '../src/index.js';

describe('native application project settings', () => {
  it('persists metadata, window/mobile preferences and signing references without changing project identity', () => {
    const project = createProject('Portal');
    const nativeApplication = {
      ...project.settings.nativeApplication,
      identifier: 'com.example.portal',
      version: '2.3.4',
      desktop: { ...project.settings.nativeApplication.desktop, width: 1440 },
      mobile: { ...project.settings.nativeApplication.mobile, orientation: 'portrait' as const },
      security: { networkOrigins: ['https://api.example.test', 'wss://events.example.test'] },
      signing: {
        ...project.settings.nativeApplication.signing,
        androidKeystorePasswordEnvironmentVariable: 'ANDROID_KEYSTORE_PASSWORD',
      },
    };
    const updated = updateProjectSettings(project, { nativeApplication });
    expect(deserializeProject(serializeProject(updated)).settings.nativeApplication).toEqual(
      nativeApplication,
    );
    expect(
      deserializeProjectManifest(serializeProjectManifest(projectToManifest(updated))).settings
        .nativeApplication,
    ).toEqual(nativeApplication);
    expect(updated.id).toBe(project.id);
    expect(updated.pages).toEqual(project.pages);
    expect(project.settings.nativeApplication.applicationName).toBe('Portal');
  });

  it('loads existing v2 aggregate and manifest files with independent defaults and no format bump', () => {
    const project = createProject('Legacy Portal');
    for (const [serialized, deserialize] of [
      [serializeProject(project), deserializeProject],
      [serializeProjectManifest(projectToManifest(project)), deserializeProjectManifest],
    ] as const) {
      const old = JSON.parse(serialized) as { settings: Record<string, unknown> };
      delete old.settings.nativeApplication;
      const restored = deserialize(JSON.stringify(old));
      expect(restored.formatVersion).toBe(project.formatVersion);
      expect(restored.settings.nativeApplication).toEqual({
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
        applicationName: 'Legacy Portal',
      });
      expect(restored.settings.nativeApplication.desktop).not.toBe(
        DEFAULT_NATIVE_APPLICATION_SETTINGS.desktop,
      );
      expect(restored.settings.nativeApplication.security.networkOrigins).not.toBe(
        DEFAULT_NATIVE_APPLICATION_SETTINGS.security.networkOrigins,
      );
    }
  });

  it('materializes omitted nested native options while rejecting malformed and unknown secret fields', () => {
    const project = createProject('Portal');
    const result = safeParseProject({
      ...project,
      settings: {
        ...project.settings,
        nativeApplication: { identifier: 'com.example.portal', desktop: { width: 1280 } },
      },
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.settings.nativeApplication.desktop).toEqual({
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS.desktop,
        width: 1280,
      });
    for (const nativeApplication of [
      null,
      [],
      { signing: { password: 'secret' } },
      { desktop: null },
      { security: { networkOrigins: 'https://example.test' } },
    ]) {
      expect(
        safeParseProject({ ...project, settings: { ...project.settings, nativeApplication } })
          .success,
      ).toBe(false);
    }
  });

  it.each([
    'application',
    'com.example.my-app',
    'com.2example.app',
    'com.example.app/path',
    'com.example.app\0',
  ])('rejects a non-portable application identifier %s', (identifier) => {
    expect(
      NativeApplicationSettingsSchema.safeParse({
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
        identifier,
      }).success,
    ).toBe(false);
  });

  it.each(['1.0', 'v1.0.0', '1.0.0-beta', '01.0.0', '-1.0.0'])(
    'rejects invalid application version %s',
    (version) => {
      expect(
        NativeApplicationSettingsSchema.safeParse({
          ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
          version,
        }).success,
      ).toBe(false);
    },
  );

  it('validates platform, architecture, executable versus installer, and IPA device constraints', () => {
    expect(getNativeBundleFormats('windows')).toEqual(['nsis', 'msi', 'exe']);
    expect(getNativeArchitectures('ios')).toEqual(['arm64', 'arm64-simulator', 'x64']);
    const base = DEFAULT_NATIVE_APPLICATION_SETTINGS;
    for (const build of [
      { ...base.build, platform: 'linux', bundleFormat: 'msi' },
      { ...base.build, platform: 'windows', architecture: 'universal' },
      { ...base.build, platform: 'android', architecture: 'host', bundleFormat: 'apk' },
      { ...base.build, platform: 'ios', architecture: 'arm64-simulator', bundleFormat: 'ipa' },
    ])
      expect(NativeApplicationSettingsSchema.safeParse({ ...base, build }).success).toBe(false);
    expect(
      NativeApplicationSettingsSchema.safeParse({
        ...base,
        build: { ...base.build, platform: 'ios', architecture: 'arm64', bundleFormat: 'ipa' },
      }).success,
    ).toBe(true);
  });

  it('permits exact network origins and environment names but rejects credentials and unrestricted origins', () => {
    for (const origin of [
      '*',
      'https://*.example.test',
      'https://user:password@example.test',
      'https://example.test/api',
      'file:///tmp',
      'https://example.test?token=x',
      'https://example.test#page',
    ]) {
      expect(
        NativeApplicationSettingsSchema.safeParse({
          ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
          security: { networkOrigins: [origin] },
        }).success,
      ).toBe(false);
    }
    expect(
      NativeApplicationSettingsSchema.parse({
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
        security: { networkOrigins: ['https://example.test/'] },
      }).security.networkOrigins,
    ).toEqual(['https://example.test']);
    for (const reference of ['actual private value', 'password123!', 'C:\\private\\key.jks']) {
      expect(
        NativeApplicationSettingsSchema.safeParse({
          ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
          signing: {
            ...DEFAULT_NATIVE_APPLICATION_SETTINGS.signing,
            androidKeystorePasswordEnvironmentVariable: reference,
          },
        }).success,
      ).toBe(false);
    }
  });

  it('rejects impossible desktop dimensions', () => {
    expect(
      NativeApplicationSettingsSchema.safeParse({
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
        desktop: { ...DEFAULT_NATIVE_APPLICATION_SETTINGS.desktop, minWidth: 2000 },
      }).success,
    ).toBe(false);
  });
});
