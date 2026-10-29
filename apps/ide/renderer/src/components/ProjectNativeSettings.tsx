import { SettingsField } from './SettingsField';
import {
  getDefaultNativeBundleFormat,
  getNativeArchitectures,
  getNativeBundleFormats,
  NATIVE_TARGET_PLATFORMS,
  NativeApplicationSettingsSchema,
  type NativeApplicationSettings,
  type NativeTargetPlatform,
  type ProjectApplicationIcon,
} from '@webrad/project-model';
import { useId, useState, type ReactElement } from 'react';
import { Icon } from './Icon';
import './native-settings.css';

interface ProjectNativeSettingsProps {
  readonly value: NativeApplicationSettings;
  readonly onChange: (value: NativeApplicationSettings) => void;
  readonly onChooseDirectory?: () => Promise<string | null>;
}

function TextField({
  path,
  label,
  value,
  onChange,
  help,
}: {
  readonly path: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
}): ReactElement {
  return (
    <SettingsField path={path} className="wr-project-settings-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        maxLength={4096}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {help !== undefined && <small>{help}</small>}
    </SettingsField>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactElement {
  return (
    <label>
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function NativeImage({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: ProjectApplicationIcon | null;
  readonly onChange: (value: ProjectApplicationIcon | null) => void;
}): ReactElement {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const select = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    const mediaType =
      file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
        ? 'image/png'
        : file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
          ? 'image/svg+xml'
          : null;
    if (mediaType === null || file.size === 0 || file.size > 1_000_000) {
      setError('Choose an SVG or PNG image between 1 byte and 1 MB.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Image could not be read.'));
        reader.onerror = () => reject(new Error('Image could not be read.'));
        reader.readAsDataURL(file);
      });
      onChange({ fileName: file.name, mediaType, dataUrl });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Image could not be read.');
    }
  };
  return (
    <div className="wr-project-settings-field full-width wr-native-image">
      <span>{label}</span>
      <div className="wr-native-image-card">
        <div className="wr-native-image-preview">
          {value === null ? (
            <Icon name="image" />
          ) : (
            <img src={value.dataUrl} alt={`${label} preview`} width={48} height={48} />
          )}
        </div>
        <div className="wr-native-image-content">
          <span className="wr-native-image-name">
            {value?.fileName ?? 'Default application icon'}
          </span>
          <small>SVG or PNG, up to 1 MB. Platform sizes are generated automatically.</small>
          <div className="wr-native-image-actions">
            <input
              id={id}
              type="file"
              accept="image/png,image/svg+xml,.png,.svg"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void select(file);
              }}
              aria-label={label}
              className="wr-native-image-input"
            />
            <label className="wr-native-image-choose" htmlFor={id}>
              <Icon name="upload-cloud" />
              Choose image
            </label>
            {value !== null && (
              <button type="button" aria-label={`Remove ${label}`} onClick={() => onChange(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {error !== null && (
        <div className="wr-project-settings-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

const PLATFORM_LABELS: Readonly<Record<NativeTargetPlatform, string>> = {
  web: 'Web/PWA',
  windows: 'Windows',
  linux: 'Linux',
  macos: 'macOS',
  android: 'Android',
  ios: 'iOS',
};
const FORMAT_LABELS: Readonly<Record<string, string>> = {
  web: 'Web/PWA',
  exe: 'Executable (EXE)',
  nsis: 'NSIS installer (EXE)',
  msi: 'MSI',
  deb: 'DEB',
  rpm: 'RPM',
  appimage: 'AppImage',
  app: 'APP',
  dmg: 'DMG',
  apk: 'APK',
  aab: 'AAB',
  'ios-app': 'iOS application',
  ipa: 'IPA',
};

export function ProjectNativeSettings({
  value,
  onChange,
  onChooseDirectory,
}: ProjectNativeSettingsProps): ReactElement {
  const [originsText, setOriginsText] = useState(value.security.networkOrigins.join('\n'));
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const patch = (change: Partial<NativeApplicationSettings>): void =>
    onChange({ ...value, ...change });
  const chooseDirectory = async (): Promise<void> => {
    if (onChooseDirectory === undefined || choosingDirectory) return;
    setChoosingDirectory(true);
    setDirectoryError(null);
    try {
      const directory = await onChooseDirectory();
      if (directory !== null) patch({ build: { ...value.build, outputDirectory: directory } });
    } catch (reason) {
      setDirectoryError(
        reason instanceof Error ? reason.message : 'The directory could not be selected.',
      );
    } finally {
      setChoosingDirectory(false);
    }
  };
  const selectPlatform = (platform: NativeTargetPlatform): void => {
    const architectures = getNativeArchitectures(platform);
    patch({
      build: {
        ...value.build,
        platform,
        architecture: architectures.includes(value.build.architecture)
          ? value.build.architecture
          : (architectures[0] ?? 'host'),
        bundleFormat: getDefaultNativeBundleFormat(platform),
      },
    });
  };
  const validation = NativeApplicationSettingsSchema.safeParse(value);

  return (
    <div className="wr-native-settings">
      <p className="wr-native-settings-intro">
        Configure application identity, packaging and platform preferences. Choose the export
        platform in Build Application.
      </p>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="layers" />
          <span>Identification</span>
        </legend>
        <p>Application details shown in the installed app and its package.</p>
        <div className="wr-project-settings-fields">
          <TextField
            path="nativeApplication.applicationName"
            label="Application Name"
            value={value.applicationName}
            onChange={(applicationName) => patch({ applicationName })}
          />
          <TextField
            path="nativeApplication.identifier"
            label="Application Identifier"
            value={value.identifier}
            onChange={(identifier) => patch({ identifier })}
            help="Reverse-DNS identifier, for example com.example.application."
          />
          <TextField
            path="nativeApplication.version"
            label="Version"
            value={value.version}
            onChange={(version) => patch({ version })}
            help="Numeric version, for example 1.0.0."
          />
          <TextField
            path="nativeApplication.publisher"
            label="Publisher"
            value={value.publisher}
            onChange={(publisher) => patch({ publisher })}
          />
          <SettingsField
            path="nativeApplication.description"
            className="wr-project-settings-field full-width"
          >
            <span>Description</span>
            <textarea
              rows={3}
              maxLength={500}
              value={value.description}
              onChange={(event) => patch({ description: event.currentTarget.value })}
            />
          </SettingsField>
          <NativeImage
            label="Application Icon"
            value={value.icon}
            onChange={(icon) => patch({ icon })}
          />
        </div>
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="settings" />
          <span>Build</span>
        </legend>
        <p>Packaging preferences used when exporting from Build Application.</p>
        <div className="wr-project-settings-fields">
          <SettingsField
            path="nativeApplication.build.platform"
            className="wr-project-settings-field"
          >
            <span>Target Platform</span>
            <select
              value={value.build.platform}
              onChange={(event) => {
                const platform = NATIVE_TARGET_PLATFORMS.find(
                  (entry) => entry === event.currentTarget.value,
                );
                if (platform !== undefined) selectPlatform(platform);
              }}
            >
              {NATIVE_TARGET_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            path="nativeApplication.build.architecture"
            className="wr-project-settings-field"
          >
            <span>Target Architecture</span>
            <select
              value={value.build.architecture}
              onChange={(event) => {
                const architecture = getNativeArchitectures(value.build.platform).find(
                  (entry) => entry === event.currentTarget.value,
                );
                if (architecture !== undefined)
                  patch({
                    build: {
                      ...value.build,
                      architecture,
                      bundleFormat:
                        value.build.platform === 'ios' && architecture !== 'arm64'
                          ? 'ios-app'
                          : value.build.bundleFormat,
                    },
                  });
              }}
            >
              {getNativeArchitectures(value.build.platform).map((architecture) => (
                <option key={architecture} value={architecture}>
                  {architecture === 'host'
                    ? 'Host architecture'
                    : architecture === 'arm64-simulator'
                      ? 'ARM64 simulator'
                      : architecture}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            path="nativeApplication.build.configuration"
            className="wr-project-settings-field"
          >
            <span>Build Configuration</span>
            <select
              value={value.build.configuration}
              onChange={(event) =>
                patch({
                  build: {
                    ...value.build,
                    configuration: event.currentTarget.value === 'debug' ? 'debug' : 'release',
                  },
                })
              }
            >
              <option value="debug">Debug</option>
              <option value="release">Release</option>
            </select>
          </SettingsField>
          <SettingsField
            path="nativeApplication.build.bundleFormat"
            className="wr-project-settings-field"
          >
            <span>Bundle Format</span>
            <select
              value={value.build.bundleFormat}
              onChange={(event) => {
                const bundleFormat = getNativeBundleFormats(value.build.platform).find(
                  (entry) => entry === event.currentTarget.value,
                );
                if (bundleFormat !== undefined) patch({ build: { ...value.build, bundleFormat } });
              }}
            >
              {getNativeBundleFormats(value.build.platform)
                .filter((format) => format !== 'ipa' || value.build.architecture === 'arm64')
                .map((format) => (
                  <option key={format} value={format}>
                    {FORMAT_LABELS[format] ?? format}
                  </option>
                ))}
            </select>
          </SettingsField>
          <SettingsField
            path="nativeApplication.build.outputDirectory"
            className="wr-project-settings-field full-width"
          >
            <span>Output Directory</span>
            <span className="wr-project-settings-directory">
              <input
                aria-label="Output Directory"
                type="text"
                value={value.build.outputDirectory}
                maxLength={4096}
                onChange={(event) =>
                  patch({ build: { ...value.build, outputDirectory: event.currentTarget.value } })
                }
              />
              {onChooseDirectory !== undefined && (
                <button
                  type="button"
                  disabled={choosingDirectory}
                  onClick={() => void chooseDirectory()}
                >
                  {choosingDirectory ? 'Choosing...' : 'Choose folder'}
                </button>
              )}
            </span>
            <small>
              Absolute path or folder relative to the project. Native build intermediates use a
              separate cache.
            </small>
          </SettingsField>
        </div>
        {directoryError !== null && (
          <div className="wr-project-settings-error" role="alert">
            {directoryError}
          </div>
        )}
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="monitor" />
          <span>Desktop</span>
        </legend>
        <p>Initial window size and behavior for desktop applications.</p>
        <div className="wr-project-settings-fields">
          {(
            [
              ['width', 'Initial Width'],
              ['height', 'Initial Height'],
              ['minWidth', 'Minimum Width'],
              ['minHeight', 'Minimum Height'],
            ] as const
          ).map(([key, label]) => (
            <SettingsField
              path={`nativeApplication.desktop.${key}`}
              key={key}
              className="wr-project-settings-field"
            >
              <span>{label}</span>
              <input
                type="number"
                min={1}
                max={32768}
                step={1}
                value={value.desktop[key]}
                onChange={(event) =>
                  patch({ desktop: { ...value.desktop, [key]: Number(event.currentTarget.value) } })
                }
              />
            </SettingsField>
          ))}
        </div>
        <div className="wr-project-settings-toggles">
          {(
            [
              ['resizable', 'Resizable'],
              ['fullscreen', 'Fullscreen'],
              ['maximizable', 'Maximizable'],
            ] as const
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              value={value.desktop[key]}
              onChange={(checked) => patch({ desktop: { ...value.desktop, [key]: checked } })}
            />
          ))}
        </div>
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="smartphone" />
          <span>Mobile</span>
        </legend>
        <p>Display preferences and application icon for Android and iOS.</p>
        <div className="wr-project-settings-fields">
          <SettingsField
            path="nativeApplication.mobile.orientation"
            className="wr-project-settings-field"
          >
            <span>Orientation</span>
            <select
              value={value.mobile.orientation}
              onChange={(event) => {
                const orientation = event.currentTarget.value;
                if (
                  orientation === 'portrait' ||
                  orientation === 'landscape' ||
                  orientation === 'auto'
                )
                  patch({ mobile: { ...value.mobile, orientation } });
              }}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
              <option value="auto">Auto</option>
            </select>
          </SettingsField>
        </div>
        <div className="wr-project-settings-toggles">
          {(
            [
              ['fullscreen', 'Mobile Fullscreen'],
              ['statusBar', 'Status Bar'],
              ['safeArea', 'Safe Area'],
            ] as const
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              value={value.mobile[key]}
              onChange={(checked) => patch({ mobile: { ...value.mobile, [key]: checked } })}
            />
          ))}
        </div>
        <div className="wr-project-settings-fields">
          <NativeImage
            label="Mobile Application Icon"
            value={value.mobile.icon}
            onChange={(icon) => patch({ mobile: { ...value.mobile, icon } })}
          />
          <div className="wr-project-settings-field full-width">
            <span>Splash Screen</span>
            <small>
              Uses the platform's default launch screen and generated application icon. Custom
              splash images are not supported.
            </small>
            {value.mobile.splashScreen !== null && (
              <>
                <div className="wr-project-settings-error" role="alert">
                  Remove the unsupported custom splash image before building.
                </div>
                <button
                  type="button"
                  onClick={() => patch({ mobile: { ...value.mobile, splashScreen: null } })}
                >
                  Remove custom splash image
                </button>
              </>
            )}
          </div>
        </div>
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="globe" />
          <span>Network</span>
        </legend>
        <p>Allow the services your application connects to.</p>
        <SettingsField
          path="nativeApplication.security.networkOrigins"
          className="wr-project-settings-field full-width"
        >
          <span>Allowed Network Origins</span>
          <textarea
            rows={4}
            value={originsText}
            placeholder="https://api.example.com"
            spellCheck={false}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setOriginsText(text);
              patch({
                security: {
                  networkOrigins: text
                    .split(/\r?\n/)
                    .map((origin) => origin.trim())
                    .filter(Boolean),
                },
              });
            }}
          />
          <small>
            One exact HTTP(S) or WS(S) origin per line. Include origins used by authored requests
            and media; no wildcard permissions.
          </small>
        </SettingsField>
      </fieldset>
      <fieldset className="wr-project-settings-seo-options">
        <legend>
          <Icon name="lock" />
          <span>Signing references</span>
        </legend>
        <p>
          Optional development builds can be unsigned. Certificates and passwords stay in the host
          certificate store, keychain or environment.
        </p>
        <div className="wr-project-settings-fields">
          {(
            [
              ['windowsCertificateThumbprint', 'Windows Certificate Thumbprint'],
              ['appleSigningIdentity', 'Apple Signing Identity'],
              ['appleTeamId', 'Apple Team ID'],
              ['appleNotarizationProfile', 'Apple Notarization Keychain Profile'],
              [
                'androidKeystorePathEnvironmentVariable',
                'Android Keystore Path Environment Variable',
              ],
              [
                'androidKeystorePasswordEnvironmentVariable',
                'Android Keystore Password Environment Variable',
              ],
              ['androidKeyAliasEnvironmentVariable', 'Android Key Alias Environment Variable'],
              [
                'androidKeyPasswordEnvironmentVariable',
                'Android Key Password Environment Variable',
              ],
            ] as const
          ).map(([key, label]) => (
            <TextField
              path={`nativeApplication.signing.${key}`}
              key={key}
              label={label}
              value={value.signing[key]}
              onChange={(text) => patch({ signing: { ...value.signing, [key]: text } })}
            />
          ))}
          <SettingsField
            path="nativeApplication.signing.iosExportMethod"
            className="wr-project-settings-field"
          >
            <span>iOS Export Method</span>
            <select
              value={value.signing.iosExportMethod}
              onChange={(event) => {
                const iosExportMethod = event.currentTarget.value;
                if (
                  iosExportMethod === 'debugging' ||
                  iosExportMethod === 'release-testing' ||
                  iosExportMethod === 'app-store-connect'
                )
                  patch({ signing: { ...value.signing, iosExportMethod } });
              }}
            >
              <option value="debugging">Debugging</option>
              <option value="release-testing">Release testing</option>
              <option value="app-store-connect">App Store Connect</option>
            </select>
          </SettingsField>
        </div>
      </fieldset>
      {!validation.success && (
        <div className="wr-project-settings-error" role="alert">
          {validation.error.issues[0]?.message ?? 'Review Native Application settings.'}
        </div>
      )}
    </div>
  );
}
