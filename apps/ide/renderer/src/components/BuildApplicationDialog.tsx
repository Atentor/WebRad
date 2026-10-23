import {
  getDefaultNativeBundleFormat,
  getNativeArchitectures,
  getNativeBundleFormats,
  NativeApplicationSettingsSchema,
  type NativeApplicationSettings,
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

interface BuildApplicationDialogProps {
  readonly settings: NativeApplicationSettings;
  readonly build: BuildApplicationController;
  readonly hostPlatform: string;
}

export function BuildApplicationDialog({
  settings,
  build,
  hostPlatform,
}: BuildApplicationDialogProps): ReactElement {
  const [selectedPlatform, setSelectedPlatform] = useState(settings.build.platform);
  const draft = useMemo(() => {
    const architectures = getNativeArchitectures(selectedPlatform);
    const formats = getNativeBundleFormats(selectedPlatform);
    return {
      ...settings,
      build: {
        ...settings.build,
        platform: selectedPlatform,
        architecture: architectures.includes(settings.build.architecture)
          ? settings.build.architecture
          : (architectures[0] ?? 'host'),
        bundleFormat: formats.includes(settings.build.bundleFormat)
          ? settings.build.bundleFormat
          : getDefaultNativeBundleFormat(selectedPlatform),
      },
    };
  }, [settings, selectedPlatform]);

  const [error, setError] = useState<string | null>(null);

  const [submittedRequirementsKey, setSubmittedRequirementsKey] = useState<string | null>(null);
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const state = build.state;
  const { platform, configuration } = draft.build;

  const inspectionSettings = draft;
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

  const selectPlatform = (platform: NativeTargetPlatform): void => {
    setSelectedPlatform(platform);
    setError(null);
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
  const disabled = build.busy;
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
              <legend>Export Platform</legend>
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
              </div>
              <p className="wr-build-configuration-help">
                <Icon name="settings" />
                All build settings are managed in Project Settings.
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
