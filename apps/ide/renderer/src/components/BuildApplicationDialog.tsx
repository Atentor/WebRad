import {
  getDefaultNativeBundleFormat,
  getNativeArchitectures,
  getNativeBundleFormats,
  DEFAULT_NATIVE_APPLICATION_SETTINGS,
  NativeApplicationSettingsSchema,
  type NativeApplicationSettings,
  type NativeBundleFormat,
  type NativeTargetArchitecture,
  type NativeTargetPlatform,
} from '@webrad/project-model';
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import type { BuildApplicationController } from '../use-build-application';
import { buildRequirementsKey, useBuildRequirements } from '../use-build-requirements';
import { BuildRequirements } from './BuildRequirements';
import { BuildStatusPanel } from './BuildStatusPanel';
import { Icon } from './Icon';

const PLATFORMS: readonly (readonly [NativeTargetPlatform, string])[] = [
  ['web', 'Web/PWA'],
  ['windows', 'Windows'],
  ['linux', 'Linux'],
  ['macos', 'macOS'],
  ['android', 'Android'],
  ['ios', 'iOS'],
];

const FORMAT_LABELS: Record<NativeBundleFormat, string> = {
  web: 'Web/PWA files',
  exe: 'EXE application executable',
  nsis: 'NSIS / EXE installer',
  msi: 'MSI installer',
  deb: 'DEB package',
  rpm: 'RPM package',
  appimage: 'AppImage',
  app: 'APP application bundle',
  dmg: 'DMG disk image',
  apk: 'APK for installation',
  aab: 'AAB for distribution',
  'ios-app': 'iOS application bundle',
  ipa: 'IPA export (requires signing)',
};

const ARCHITECTURE_LABELS: Record<NativeTargetArchitecture, string> = {
  host: 'Host architecture',
  x64: 'x64',
  arm64: 'ARM64',
  x86: 'x86',
  armv7: 'ARMv7',
  universal: 'Universal (Intel + Apple Silicon)',
  'arm64-simulator': 'ARM64 iOS simulator',
};

interface BuildApplicationDialogProps {
  readonly settings: NativeApplicationSettings;
  readonly build: BuildApplicationController;
  readonly hostPlatform: string;
  readonly onChooseDirectory: () => Promise<string | null>;
}

export function BuildApplicationDialog({
  settings,
  build,
  hostPlatform,
  onChooseDirectory,
}: BuildApplicationDialogProps): ReactElement {
  const [draft, setDraft] = useState(settings);
  const [appliedOutputRequestId, setAppliedOutputRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [submittedRequirementsKey, setSubmittedRequirementsKey] = useState<string | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const state = build.state;
  const { platform, architecture, bundleFormat, configuration } = draft.build;
  const signing = draft.signing;
  // Tool detection is independent from incomplete identity/output edits in this form.
  const inspectionSettings = useMemo(
    () => ({
      ...DEFAULT_NATIVE_APPLICATION_SETTINGS,
      build: {
        ...DEFAULT_NATIVE_APPLICATION_SETTINGS.build,
        platform,
        architecture,
        bundleFormat,
        configuration,
      },
      signing,
    }),
    [platform, architecture, bundleFormat, configuration, signing],
  );
  const requirements = useBuildRequirements({
    settings: inspectionSettings,
    inspect: build.inspect,
    result: state?.result,
    submittedKey: submittedRequirementsKey,
  });
  useEffect(() => {
    dialogRef.current?.focus();
    const previous = returnFocusRef.current;
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const configuredDirectory = state?.result?.configuredOutputDirectory;
  const resultRequestId = state?.result?.requestId;
  if (
    configuredDirectory !== undefined &&
    resultRequestId !== undefined &&
    appliedOutputRequestId !== resultRequestId
  ) {
    // Apply each response once so later edits remain intact, including when a new
    // build selects the same parent directory as the preceding response.
    setAppliedOutputRequestId(resultRequestId);
    setDraft((current) => ({
      ...current,
      build: { ...current.build, outputDirectory: configuredDirectory },
    }));
  }

  if (!state) return <></>;
  const requiredHost =
    platform === 'windows'
      ? 'win32'
      : platform === 'linux'
        ? 'linux'
        : platform === 'macos' || platform === 'ios'
          ? 'darwin'
          : null;
  const incompatibleHost = requiredHost !== null && requiredHost !== hostPlatform;
  const hostName =
    requiredHost === 'darwin' ? 'macOS' : requiredHost === 'win32' ? 'Windows' : 'Linux';
  const updateBuild = (update: Partial<NativeApplicationSettings['build']>): void => {
    setDraft((current) => ({ ...current, build: { ...current.build, ...update } }));
    setError(null);
  };
  const selectArchitecture = (architecture: NativeTargetArchitecture): void => {
    updateBuild({
      architecture,
      ...(platform === 'ios' && architecture !== 'arm64' && draft.build.bundleFormat === 'ipa'
        ? { bundleFormat: 'ios-app' }
        : {}),
    });
  };
  const selectFormat = (bundleFormat: NativeBundleFormat): void => {
    updateBuild({
      bundleFormat,
      ...(platform === 'ios' && bundleFormat === 'ipa' ? { architecture: 'arm64' } : {}),
    });
  };
  const selectPlatform = (nextPlatform: NativeTargetPlatform): void => {
    const architectures = getNativeArchitectures(nextPlatform);
    const formats = getNativeBundleFormats(nextPlatform);
    updateBuild({
      platform: nextPlatform,
      architecture: architectures.includes(draft.build.architecture)
        ? draft.build.architecture
        : (architectures[0] ?? 'host'),
      bundleFormat: formats.includes(draft.build.bundleFormat)
        ? draft.build.bundleFormat
        : getDefaultNativeBundleFormat(nextPlatform),
    });
  };
  const run = (exportingCi = false): void => {
    const parsed = NativeApplicationSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review the build configuration.');
      return;
    }
    setError(null);
    setSubmittedRequirementsKey(buildRequirementsKey(parsed.data));
    void build.run(parsed.data, exportingCi);
  };
  const disabled = build.busy || choosingDirectory;
  return (
    <div
      className="wr-modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (!disabled) build.close();
        }
        if (event.key === 'Tab') {
          const controls = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
            ) ?? [],
          ).filter((element) => {
            if (element.matches(':disabled')) return false;
            const closedDetails = element.closest('details:not([open])');
            return (
              closedDetails === null ||
              (element.tagName === 'SUMMARY' && element.parentElement === closedDetails)
            );
          });
          const first = controls[0];
          const last = controls.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="wr-modal wr-build-application-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wr-modal-header">
          <span className="wr-build-header-icon">
            <Icon name="layers" />
          </span>
          <div className="wr-build-header-title">
            <span className="wr-modal-eyebrow">Project</span>
            <h2 id={titleId}>Build Application</h2>
            <p>Package your application or prepare a build for CI.</p>
          </div>
          <button
            type="button"
            className="wr-build-header-close"
            disabled={disabled}
            onClick={build.close}
            aria-label="Close Build Application"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="wr-build-application-content">
          <div className="wr-build-application-grid">
            <fieldset
              disabled={disabled}
              className="wr-build-application-configuration wr-build-card"
            >
              <legend>Build Configuration</legend>
              <div className="wr-project-settings-fields">
                <label className="wr-project-settings-field">
                  <span>Target Platform</span>
                  <select
                    value={platform}
                    onChange={(event) =>
                      selectPlatform(event.currentTarget.value as NativeTargetPlatform)
                    }
                  >
                    {PLATFORMS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wr-project-settings-field">
                  <span>Application Name</span>
                  <input
                    value={draft.applicationName}
                    onChange={(event) =>
                      setDraft({ ...draft, applicationName: event.currentTarget.value })
                    }
                  />
                </label>
                <label className="wr-project-settings-field">
                  <span>Version</span>
                  <input
                    value={draft.version}
                    onChange={(event) => setDraft({ ...draft, version: event.currentTarget.value })}
                  />
                </label>
                <label className="wr-project-settings-field">
                  <span>Bundle Format</span>
                  <select
                    value={draft.build.bundleFormat}
                    onChange={(event) =>
                      selectFormat(event.currentTarget.value as NativeBundleFormat)
                    }
                  >
                    {getNativeBundleFormats(platform).map((value) => (
                      <option key={value} value={value}>
                        {FORMAT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wr-project-settings-field">
                  <span>Architecture</span>
                  <select
                    value={draft.build.architecture}
                    onChange={(event) =>
                      selectArchitecture(event.currentTarget.value as NativeTargetArchitecture)
                    }
                  >
                    {getNativeArchitectures(platform).map((value) => (
                      <option key={value} value={value}>
                        {platform === 'macos' && value === 'arm64'
                          ? 'ARM64 / Apple Silicon'
                          : platform === 'macos' && value === 'x64'
                            ? 'x64 / Intel'
                            : ARCHITECTURE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wr-project-settings-field">
                  <span>Build Configuration</span>
                  <select
                    value={draft.build.configuration}
                    onChange={(event) =>
                      updateBuild({
                        configuration: event.currentTarget.value as 'debug' | 'release',
                      })
                    }
                  >
                    <option value="debug">Debug</option>
                    <option value="release">Release</option>
                  </select>
                </label>
                <label className="wr-project-settings-field full-width">
                  <span>Output Directory</span>
                  <span className="wr-project-settings-directory">
                    <input
                      aria-label="Output Directory"
                      value={draft.build.outputDirectory}
                      onChange={(event) =>
                        updateBuild({ outputDirectory: event.currentTarget.value })
                      }
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={async () => {
                        setChoosingDirectory(true);
                        try {
                          const directory = await onChooseDirectory();
                          if (directory !== null) updateBuild({ outputDirectory: directory });
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : String(cause));
                        } finally {
                          setChoosingDirectory(false);
                        }
                      }}
                    >
                      <Icon name="folder-open" />
                      Choose folder
                    </button>
                  </span>
                </label>
              </div>
              <p className="wr-build-configuration-help">
                <Icon name="settings" />
                Identity, icons and signing: Project Settings → Native Application
              </p>
            </fieldset>
            <BuildRequirements
              report={requirements.report}
              checking={requirements.checking}
              error={requirements.error}
              disabled={build.busy}
              onRefresh={requirements.refresh}
            />
            <BuildStatusPanel state={state} build={build} />
          </div>
          {incompatibleHost && (
            <p className="wr-project-settings-note">
              Local builds for {PLATFORMS.find(([value]) => value === platform)?.[1]} require{' '}
              {hostName}. Export a CI project to build on a compatible GitHub Actions runner.
            </p>
          )}
          {error && (
            <p className="wr-project-settings-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="wr-modal-actions">
          <span className="wr-build-footer-target">
            <Icon name="layers" />
            {PLATFORMS.find(([value]) => value === platform)?.[1]}
            <span>·</span>
            {configuration === 'release' ? 'Release' : 'Debug'}
          </span>
          {build.busy ? (
            <button type="button" disabled={state.cancelling} onClick={() => void build.cancel()}>
              Cancel Build
            </button>
          ) : (
            <>
              {state.result?.success && (
                <button type="button" onClick={() => void build.openOutput()}>
                  Open Output Folder
                </button>
              )}
              <button
                type="button"
                disabled={disabled || platform === 'web'}
                onClick={() => run(true)}
              >
                Export for GitHub Actions
              </button>
              <button type="button" disabled={disabled} onClick={build.close}>
                Close
              </button>
              <button
                type="button"
                className="primary"
                disabled={disabled || incompatibleHost}
                onClick={() => run()}
              >
                {state.result?.success ? 'Build Again' : 'Build'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
