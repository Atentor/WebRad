import type {
  ProjectApplicationIcon,
  ProjectApplicationIconMediaType,
  ProjectEnvironment,
  ProjectEnvironmentVariable,
  ProjectSocialImage,
  ProjectSocialImageMediaType,
  ProjectSettings,
} from '@webrad/project-model';
import type { WebRadIconName } from '@webrad/runtime/icons';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from './Icon';

interface ProjectSettingsDialogProps {
  readonly projectName: string;
  readonly settings: ProjectSettings;
  readonly onClose: () => void;
  readonly onSave: (settings: ProjectSettings) => void;
}

type ProjectSettingsSectionId =
  | 'general'
  | 'environment'
  | 'icons'
  | 'seo'
  | 'build'
  | 'pwa'
  | 'authentication'
  | 'cors'
  | 'headers'
  | 'integrations'
  | 'observability';

interface ProjectSettingsSection {
  readonly id: ProjectSettingsSectionId;
  readonly group: 'Project' | 'Security' | 'Platform';
  readonly label: string;
  readonly icon: WebRadIconName;
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
}

const SETTINGS_SECTIONS = [
  {
    id: 'general',
    group: 'Project',
    label: 'General',
    icon: 'settings',
    title: 'General settings',
    description: 'Identity, default behavior, and preferences for this web project.',
    items: [
      'Application name and description',
      'Language, time zone, and region',
      'Designer settings',
    ],
  },
  {
    id: 'environment',
    group: 'Project',
    label: 'Environment variables',
    icon: 'terminal',
    title: 'Environment variables',
    description: 'Values separated by environment for development and production.',
    items: [
      'Public keys and service URLs',
      'Development and production environments',
      'References to secrets without exposing them in the client',
    ],
  },
  {
    id: 'icons',
    group: 'Project',
    label: 'Icons',
    icon: 'image',
    title: 'Application icons',
    description: 'Visual assets used by the browser, shortcuts, and application installation.',
    items: [
      'Favicon and tab icons',
      'Icons for shortcuts and devices',
      'Light, dark, and adaptive variants',
    ],
  },
  {
    id: 'seo',
    group: 'Project',
    label: 'SEO and sharing',
    icon: 'globe',
    title: 'SEO and social sharing',
    description: 'Metadata for search engines and the previews shown when a public link is shared.',
    items: [
      'Canonical URL and search indexing',
      'Open Graph and Twitter cards',
      'Share title, description, and image',
    ],
  },
  {
    id: 'authentication',
    group: 'Security',
    label: 'Authentication and JWT',
    icon: 'key-round',
    title: 'Authentication and JWT',
    description: 'Session policies and integration with identity providers.',
    items: [
      'Authentication provider',
      'Session expiration, renewal, and storage',
      'JWT issuer, audience, and permissions',
    ],
  },
  {
    id: 'cors',
    group: 'Security',
    label: 'CORS and origins',
    icon: 'shield-check',
    title: 'CORS and trusted origins',
    description: 'Origins allowed for calls between the application and web services.',
    items: [
      'Origins by environment',
      'Allowed methods and headers',
      'Cross-origin cookies and credentials',
    ],
  },
  {
    id: 'headers',
    group: 'Security',
    label: 'Headers and CSP',
    icon: 'shield',
    title: 'Headers and Content Security Policy',
    description: 'Directives that reduce attack surfaces in the browser.',
    items: ['Content Security Policy', 'Security headers and HTTPS', 'Browser feature permissions'],
  },
  {
    id: 'build',
    group: 'Platform',
    label: 'Build and publishing',
    icon: 'upload-cloud',
    title: 'Build and publishing',
    description: 'Options for browser output and application delivery.',
    items: ['Output directory and build profile', 'Publishing environment', 'Static asset caching'],
  },
  {
    id: 'pwa',
    group: 'Platform',
    label: 'PWA and metadata',
    icon: 'smartphone',
    title: 'PWA and metadata',
    description: 'Information for installation, sharing, and presentation in the browser.',
    items: [
      'Manifest and splash screen',
      'Theme, colors, and installable icons',
      'Title, description, and social metadata',
    ],
  },
  {
    id: 'integrations',
    group: 'Platform',
    label: 'APIs and integrations',
    icon: 'link',
    title: 'APIs and integrations',
    description: 'Shared settings for external services and webhooks.',
    items: [
      'Endpoints and gateways',
      'Webhooks and integration keys',
      'Timeout and retry policies',
    ],
  },
  {
    id: 'observability',
    group: 'Platform',
    label: 'Logs and monitoring',
    icon: 'chart-line',
    title: 'Logs and monitoring',
    description: 'Observability for identifying errors and tracking application use.',
    items: [
      'Log level and destination',
      'Error monitoring',
      'Performance and availability metrics',
    ],
  },
] as const satisfies readonly ProjectSettingsSection[];

const SETTINGS_GROUPS = ['Project', 'Security', 'Platform'] as const;

const LOCALE_OPTIONS = [
  ['pt-BR', 'Portuguese (Brazil)'],
  ['en-US', 'English (United States)'],
  ['es-ES', 'Spanish (Spain)'],
] as const;

const TIME_ZONE_OPTIONS = [
  ['America/Sao_Paulo', 'São Paulo (GMT-03:00)'],
  ['America/New_York', 'New York (GMT-05:00)'],
  ['Europe/Lisbon', 'Lisbon (GMT±00:00)'],
  ['Europe/London', 'London (GMT±00:00)'],
  ['Europe/Madrid', 'Madrid (GMT+01:00)'],
  ['UTC', 'UTC (GMT±00:00)'],
] as const;

const GRID_SIZE_OPTIONS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

const ENVIRONMENT_OPTIONS = [
  ['development', 'Development'],
  ['production', 'Production'],
] as const satisfies readonly (readonly [ProjectEnvironment, string])[];

const ENVIRONMENT_VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;
const MAX_APPLICATION_ICON_BYTES = 1_000_000;
const MAX_SOCIAL_IMAGE_BYTES = 5_000_000;

function isAbsoluteHttpUrl(value: string): boolean {
  if (value.length === 0) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function applicationIconMediaType(file: File): ProjectApplicationIconMediaType | null {
  const fileName = file.name.toLowerCase();
  if (file.type === 'image/svg+xml' || fileName.endsWith('.svg')) return 'image/svg+xml';
  if (file.type === 'image/png' || fileName.endsWith('.png')) return 'image/png';
  return null;
}

function socialImageMediaType(file: File): ProjectSocialImageMediaType | null {
  const fileName = file.name.toLowerCase();
  if (file.type === 'image/png' || fileName.endsWith('.png')) return 'image/png';
  if (file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  return null;
}

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The icon could not be read.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The icon could not be read.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function includesOption(options: readonly (readonly [string, string])[], value: string): boolean {
  return options.some(([optionValue]) => optionValue === value);
}

function settingsChanged(left: ProjectSettings, right: ProjectSettings): boolean {
  return (
    left.applicationName !== right.applicationName ||
    left.applicationDescription !== right.applicationDescription ||
    left.locale !== right.locale ||
    left.timeZone !== right.timeZone ||
    left.applicationIcon?.fileName !== right.applicationIcon?.fileName ||
    left.applicationIcon?.mediaType !== right.applicationIcon?.mediaType ||
    left.applicationIcon?.dataUrl !== right.applicationIcon?.dataUrl ||
    left.seo.canonicalUrl !== right.seo.canonicalUrl ||
    left.seo.keywords !== right.seo.keywords ||
    left.seo.allowIndexing !== right.seo.allowIndexing ||
    left.seo.socialTitle !== right.seo.socialTitle ||
    left.seo.socialDescription !== right.seo.socialDescription ||
    left.seo.socialImage?.fileName !== right.seo.socialImage?.fileName ||
    left.seo.socialImage?.mediaType !== right.seo.socialImage?.mediaType ||
    left.seo.socialImage?.dataUrl !== right.seo.socialImage?.dataUrl ||
    left.environment !== right.environment ||
    left.gridSize !== right.gridSize ||
    left.snapToGrid !== right.snapToGrid ||
    left.showGrid !== right.showGrid ||
    left.environmentVariables.length !== right.environmentVariables.length ||
    left.environmentVariables.some((variable, index) => {
      const other = right.environmentVariables[index];
      return (
        other === undefined ||
        variable.name !== other.name ||
        variable.values.development !== other.values.development ||
        variable.values.production !== other.values.production
      );
    })
  );
}

export function ProjectSettingsDialog({
  projectName,
  settings,
  onClose,
  onSave,
}: ProjectSettingsDialogProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const socialImageInputRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [activeSectionId, setActiveSectionId] = useState<ProjectSettingsSectionId>('general');
  const [draft, setDraft] = useState<ProjectSettings>(settings);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [socialImageError, setSocialImageError] = useState<string | null>(null);
  const activeSection =
    SETTINGS_SECTIONS.find((section) => section.id === activeSectionId) ?? SETTINGS_SECTIONS[0];
  const isGeneralSection = activeSection.id === 'general';
  const isEnvironmentSection = activeSection.id === 'environment';
  const isIconsSection = activeSection.id === 'icons';
  const isSeoSection = activeSection.id === 'seo';
  const isEditableSection =
    isGeneralSection || isEnvironmentSection || isIconsSection || isSeoSection;
  const hasChanges = settingsChanged(settings, draft);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"]')?.focus();
    const returnFocus = returnFocusRef.current;
    return () => {
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  const updateDraft = (patch: Partial<ProjectSettings>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveError(null);
  };

  const updateEnvironmentVariable = (
    index: number,
    update: (variable: ProjectEnvironmentVariable) => ProjectEnvironmentVariable,
  ): void => {
    setDraft((current) => ({
      ...current,
      environmentVariables: current.environmentVariables.map((variable, variableIndex) =>
        variableIndex === index ? update(variable) : variable,
      ),
    }));
    setSaveError(null);
  };

  const addEnvironmentVariable = (): void => {
    if (draft.environmentVariables.length >= 100) return;
    setDraft((current) => ({
      ...current,
      environmentVariables: [
        ...current.environmentVariables,
        {
          name: '',
          values: { development: '', production: '' },
        },
      ],
    }));
    setSaveError(null);
  };

  const removeEnvironmentVariable = (index: number): void => {
    setDraft((current) => ({
      ...current,
      environmentVariables: current.environmentVariables.filter(
        (_variable, variableIndex) => variableIndex !== index,
      ),
    }));
    setSaveError(null);
  };

  const selectApplicationIcon = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    const mediaType = applicationIconMediaType(file);
    if (mediaType === null) {
      setIconError('Choose an SVG or PNG image.');
      return;
    }
    if (file.size === 0 || file.size > MAX_APPLICATION_ICON_BYTES) {
      setIconError('Choose an icon between 1 byte and 1 MB.');
      return;
    }
    try {
      const dataUrl = await readImageDataUrl(file);
      const applicationIcon: ProjectApplicationIcon = {
        fileName: file.name,
        mediaType,
        dataUrl,
      };
      updateDraft({ applicationIcon });
      setIconError(null);
    } catch (error) {
      setIconError(error instanceof Error ? error.message : 'The icon could not be read.');
    }
  };

  const selectSocialImage = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    const mediaType = socialImageMediaType(file);
    if (mediaType === null) {
      setSocialImageError('Choose a PNG or JPEG image.');
      return;
    }
    if (file.size === 0 || file.size > MAX_SOCIAL_IMAGE_BYTES) {
      setSocialImageError('Choose an image between 1 byte and 5 MB.');
      return;
    }
    try {
      const dataUrl = await readImageDataUrl(file);
      const socialImage: ProjectSocialImage = {
        fileName: file.name,
        mediaType,
        dataUrl,
      };
      updateDraft({ seo: { ...draft.seo, socialImage } });
      setSocialImageError(null);
    } catch (error) {
      setSocialImageError(error instanceof Error ? error.message : 'The image could not be read.');
    }
  };

  const save = (): void => {
    const applicationName = draft.applicationName.trim();
    if (applicationName.length === 0) {
      setSaveError('Enter an application name.');
      return;
    }
    const seo = {
      ...draft.seo,
      canonicalUrl: draft.seo.canonicalUrl.trim(),
      keywords: draft.seo.keywords.trim(),
      socialTitle: draft.seo.socialTitle.trim(),
      socialDescription: draft.seo.socialDescription.trim(),
    };
    if (!isAbsoluteHttpUrl(seo.canonicalUrl)) {
      setSaveError('Enter an absolute HTTP(S) canonical URL, or leave it empty.');
      return;
    }
    const environmentVariables = draft.environmentVariables.map((variable) => ({
      ...variable,
      name: variable.name.trim(),
    }));
    const variableNames = new Set<string>();
    for (const variable of environmentVariables) {
      if (!ENVIRONMENT_VARIABLE_NAME.test(variable.name)) {
        setSaveError('Use uppercase variable names, such as API_BASE_URL.');
        return;
      }
      if (variableNames.has(variable.name)) {
        setSaveError(`Variable ${variable.name} is listed more than once.`);
        return;
      }
      variableNames.add(variable.name);
    }
    onSave({
      ...draft,
      applicationName,
      applicationDescription: draft.applicationDescription.trim(),
      seo,
      environmentVariables,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="wr-modal-backdrop" role="presentation" onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="wr-modal wr-project-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="wr-modal-header">
          <div>
            <span className="wr-modal-eyebrow">Project / Settings</span>
            <h2 id={titleId}>Settings for {projectName}</h2>
          </div>
          <button
            type="button"
            className="wr-modal-close"
            aria-label="Close project settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="wr-project-settings-content">
          <p id={descriptionId} className="wr-modal-description">
            General settings, environment variables, application icons, and SEO metadata are saved
            in the project and applied to the generated output. Other areas remain available for
            planning.
          </p>
          <div className="wr-project-settings-layout">
            <nav
              className="wr-project-settings-nav"
              role="tablist"
              aria-label="Project settings sections"
            >
              {SETTINGS_GROUPS.map((group) => (
                <div className="wr-project-settings-nav-group" key={group}>
                  <span>{group}</span>
                  {SETTINGS_SECTIONS.filter((section) => section.group === group).map((section) => (
                    <button
                      key={section.id}
                      id={`project-settings-tab-${section.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeSection.id === section.id}
                      aria-controls={`project-settings-panel-${section.id}`}
                      className={activeSection.id === section.id ? 'active' : ''}
                      onClick={() => setActiveSectionId(section.id)}
                    >
                      <Icon name={section.icon} />
                      <span>{section.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <section
              id={`project-settings-panel-${activeSection.id}`}
              className="wr-project-settings-panel"
              role="tabpanel"
              aria-labelledby={`project-settings-tab-${activeSection.id}`}
            >
              <div className="wr-project-settings-panel-heading">
                <Icon name={activeSection.icon} />
                <div>
                  <span>{isEditableSection ? 'Applied to project' : 'Configuration planning'}</span>
                  <h3>{activeSection.title}</h3>
                </div>
              </div>
              {isGeneralSection ? (
                <>
                  <p>{activeSection.description}</p>
                  <div className="wr-project-settings-fields">
                    <label className="wr-project-settings-field full-width">
                      <span>Application name</span>
                      <input
                        type="text"
                        value={draft.applicationName}
                        maxLength={120}
                        aria-invalid={saveError !== null}
                        aria-describedby={saveError === null ? undefined : `${descriptionId}-error`}
                        onChange={(event) =>
                          updateDraft({ applicationName: event.currentTarget.value })
                        }
                      />
                      <small>
                        Used in the browser tab title and generated application metadata.
                      </small>
                    </label>
                    <label className="wr-project-settings-field full-width">
                      <span>Description</span>
                      <textarea
                        value={draft.applicationDescription}
                        rows={3}
                        maxLength={500}
                        onChange={(event) =>
                          updateDraft({ applicationDescription: event.currentTarget.value })
                        }
                      />
                      <small>Optional. Published as the page description.</small>
                    </label>
                    <label className="wr-project-settings-field">
                      <span>Language and region</span>
                      <select
                        value={draft.locale}
                        onChange={(event) => updateDraft({ locale: event.currentTarget.value })}
                      >
                        {!includesOption(LOCALE_OPTIONS, draft.locale) && (
                          <option value={draft.locale}>{draft.locale}</option>
                        )}
                        {LOCALE_OPTIONS.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <small>Sets the language attribute of the HTML document.</small>
                    </label>
                    <label className="wr-project-settings-field">
                      <span>Default time zone</span>
                      <select
                        value={draft.timeZone}
                        onChange={(event) => updateDraft({ timeZone: event.currentTarget.value })}
                      >
                        {!includesOption(TIME_ZONE_OPTIONS, draft.timeZone) && (
                          <option value={draft.timeZone}>{draft.timeZone}</option>
                        )}
                        {TIME_ZONE_OPTIONS.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <small>Exposed in the generated application as a project preference.</small>
                    </label>
                  </div>
                  <fieldset className="wr-project-settings-designer-options">
                    <legend>Designer</legend>
                    <p>Preferences used while placing and editing components in this project.</p>
                    <div className="wr-project-settings-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.showGrid}
                          onChange={(event) =>
                            updateDraft({ showGrid: event.currentTarget.checked })
                          }
                        />
                        <span>Show grid in Designer</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.snapToGrid}
                          onChange={(event) =>
                            updateDraft({ snapToGrid: event.currentTarget.checked })
                          }
                        />
                        <span>Snap components to grid</span>
                      </label>
                    </div>
                    <label className="wr-project-settings-field grid-size">
                      <span>Grid size</span>
                      <select
                        value={String(draft.gridSize)}
                        onChange={(event) =>
                          updateDraft({ gridSize: Number(event.currentTarget.value) })
                        }
                      >
                        {!GRID_SIZE_OPTIONS.includes(
                          draft.gridSize as (typeof GRID_SIZE_OPTIONS)[number],
                        ) && <option value={draft.gridSize}>{draft.gridSize} px</option>}
                        {GRID_SIZE_OPTIONS.map((size) => (
                          <option value={size} key={size}>
                            {size} px
                          </option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                  {saveError !== null && (
                    <div
                      className="wr-project-settings-error"
                      id={`${descriptionId}-error`}
                      role="alert"
                    >
                      {saveError}
                    </div>
                  )}
                </>
              ) : isEnvironmentSection ? (
                <>
                  <p>{activeSection.description}</p>
                  <label className="wr-project-settings-field full-width">
                    <span>Environment used for Preview and Build</span>
                    <select
                      value={draft.environment}
                      onChange={(event) =>
                        updateDraft({
                          environment: event.currentTarget.value as ProjectEnvironment,
                        })
                      }
                    >
                      {ENVIRONMENT_OPTIONS.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <small>
                      The value from this environment is exposed as Env.NAME in the browser.
                    </small>
                  </label>
                  <div className="wr-project-settings-environment-heading">
                    <div>
                      <h4>Variables</h4>
                      <p>Use uppercase names with underscores, such as API_BASE_URL.</p>
                    </div>
                    <button
                      type="button"
                      className="wr-project-settings-add-variable"
                      disabled={draft.environmentVariables.length >= 100}
                      onClick={addEnvironmentVariable}
                    >
                      Add variable
                    </button>
                  </div>
                  <div className="wr-project-settings-security-note" role="note">
                    Values are embedded in browser JavaScript. Never use passwords, private tokens,
                    or other secrets here.
                  </div>
                  {draft.environmentVariables.length === 0 ? (
                    <div className="wr-project-settings-empty-environment">
                      No variables are configured. Add one to use it in code as
                      <code>Env.NOME_DA_VARIAVEL</code>.
                    </div>
                  ) : (
                    <div className="wr-project-settings-environment-list">
                      {draft.environmentVariables.map((variable, index) => (
                        <div className="wr-project-settings-environment-row" key={index}>
                          <label className="wr-project-settings-field">
                            <span>Variable name</span>
                            <input
                              type="text"
                              value={variable.name}
                              maxLength={80}
                              placeholder="API_BASE_URL"
                              spellCheck={false}
                              onChange={(event) => {
                                const name = event.currentTarget.value;
                                updateEnvironmentVariable(index, (current) => ({
                                  ...current,
                                  name,
                                }));
                              }}
                            />
                          </label>
                          <label className="wr-project-settings-field">
                            <span>
                              Value for{' '}
                              {
                                ENVIRONMENT_OPTIONS.find(
                                  ([value]) => value === draft.environment,
                                )?.[1]
                              }
                            </span>
                            <input
                              type="text"
                              value={variable.values[draft.environment]}
                              maxLength={10_000}
                              spellCheck={false}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateEnvironmentVariable(index, (current) => ({
                                  ...current,
                                  values: {
                                    ...current.values,
                                    [draft.environment]: value,
                                  },
                                }));
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="wr-project-settings-remove-variable"
                            aria-label={`Remove ${variable.name || `variable ${String(index + 1)}`}`}
                            onClick={() => removeEnvironmentVariable(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {saveError !== null && (
                    <div
                      className="wr-project-settings-error"
                      id={`${descriptionId}-error`}
                      role="alert"
                    >
                      {saveError}
                    </div>
                  )}
                </>
              ) : isIconsSection ? (
                <>
                  <p>{activeSection.description}</p>
                  <div className="wr-project-settings-icon-card">
                    <div className="wr-project-settings-icon-preview">
                      {draft.applicationIcon === null ? (
                        <Icon name="image" />
                      ) : (
                        <img src={draft.applicationIcon.dataUrl} alt="Application icon preview" />
                      )}
                    </div>
                    <div className="wr-project-settings-icon-details">
                      <h4>Browser icon</h4>
                      <p>
                        {draft.applicationIcon === null
                          ? 'No icon selected. Choose an SVG or PNG file up to 1 MB.'
                          : `${draft.applicationIcon.fileName} · ${draft.applicationIcon.mediaType}`}
                      </p>
                      <div className="wr-project-settings-icon-upload">
                        <button type="button" onClick={() => iconInputRef.current?.click()}>
                          {draft.applicationIcon === null ? 'Choose SVG or PNG' : 'Replace icon'}
                        </button>
                        <span>SVG or PNG · 1 MB max</span>
                        <input
                          ref={iconInputRef}
                          type="file"
                          accept="image/svg+xml,image/png,.svg,.png"
                          className="wr-project-settings-icon-file-input"
                          data-testid="application-icon-input"
                          tabIndex={-1}
                          aria-hidden="true"
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = '';
                            void selectApplicationIcon(file);
                          }}
                        />
                      </div>
                      {draft.applicationIcon !== null && (
                        <button
                          type="button"
                          className="wr-project-settings-remove-icon"
                          onClick={() => {
                            updateDraft({ applicationIcon: null });
                            setIconError(null);
                          }}
                        >
                          Remove icon
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="wr-project-settings-security-note" role="note">
                    The icon is saved with the project, shown in Preview, and emitted as the
                    generated application's favicon.
                  </div>
                  {iconError !== null && (
                    <div className="wr-project-settings-error" role="alert">
                      {iconError}
                    </div>
                  )}
                </>
              ) : isSeoSection ? (
                <>
                  <p>{activeSection.description}</p>
                  <fieldset className="wr-project-settings-seo-options">
                    <legend>Search engines</legend>
                    <p>
                      These values are included in the generated HTML. A canonical URL is optional
                      until the application has a public address.
                    </p>
                    <div className="wr-project-settings-fields">
                      <label className="wr-project-settings-field full-width">
                        <span>Canonical URL</span>
                        <input
                          type="url"
                          value={draft.seo.canonicalUrl}
                          maxLength={2048}
                          placeholder="https://www.example.com"
                          spellCheck={false}
                          onChange={(event) =>
                            updateDraft({
                              seo: { ...draft.seo, canonicalUrl: event.currentTarget.value },
                            })
                          }
                        />
                        <small>
                          Optional public URL used by canonical and shared-link metadata.
                        </small>
                      </label>
                      <label className="wr-project-settings-field full-width">
                        <span>Keywords</span>
                        <input
                          type="text"
                          value={draft.seo.keywords}
                          maxLength={500}
                          placeholder="customer portal, accounts, support"
                          onChange={(event) =>
                            updateDraft({
                              seo: { ...draft.seo, keywords: event.currentTarget.value },
                            })
                          }
                        />
                        <small>Optional comma-separated terms for search metadata.</small>
                      </label>
                    </div>
                    <div className="wr-project-settings-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.seo.allowIndexing}
                          onChange={(event) =>
                            updateDraft({
                              seo: { ...draft.seo, allowIndexing: event.currentTarget.checked },
                            })
                          }
                        />
                        <span>Allow search engines to index this application</span>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="wr-project-settings-seo-options">
                    <legend>Social sharing</legend>
                    <p>
                      Open Graph and Twitter card values fall back to the application name and
                      description when left empty.
                    </p>
                    <div className="wr-project-settings-fields">
                      <label className="wr-project-settings-field full-width">
                        <span>Share title</span>
                        <input
                          type="text"
                          value={draft.seo.socialTitle}
                          maxLength={120}
                          placeholder={draft.applicationName}
                          onChange={(event) =>
                            updateDraft({
                              seo: { ...draft.seo, socialTitle: event.currentTarget.value },
                            })
                          }
                        />
                        <small>Optional title displayed in link previews.</small>
                      </label>
                      <label className="wr-project-settings-field full-width">
                        <span>Share description</span>
                        <textarea
                          value={draft.seo.socialDescription}
                          rows={3}
                          maxLength={500}
                          placeholder={draft.applicationDescription || 'Describe the shared page.'}
                          onChange={(event) =>
                            updateDraft({
                              seo: { ...draft.seo, socialDescription: event.currentTarget.value },
                            })
                          }
                        />
                        <small>Optional description displayed in link previews.</small>
                      </label>
                    </div>
                    <div className="wr-project-settings-social-image-card">
                      <div className="wr-project-settings-social-image-preview">
                        {draft.seo.socialImage === null ? (
                          <Icon name="image" />
                        ) : (
                          <img
                            src={draft.seo.socialImage.dataUrl}
                            alt="Social share image preview"
                          />
                        )}
                      </div>
                      <div className="wr-project-settings-icon-details">
                        <h4>Share image</h4>
                        <p>
                          {draft.seo.socialImage === null
                            ? 'No image selected. Choose a local PNG or JPEG image.'
                            : `${draft.seo.socialImage.fileName} · ${draft.seo.socialImage.mediaType}`}
                        </p>
                        <div className="wr-project-settings-icon-upload">
                          <button
                            type="button"
                            onClick={() => socialImageInputRef.current?.click()}
                          >
                            {draft.seo.socialImage === null
                              ? 'Choose PNG or JPEG'
                              : 'Replace image'}
                          </button>
                          <span>Recommended: 1200 × 630 px · PNG or JPEG · 5 MB max</span>
                          <input
                            ref={socialImageInputRef}
                            type="file"
                            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                            className="wr-project-settings-icon-file-input"
                            data-testid="social-image-input"
                            tabIndex={-1}
                            aria-hidden="true"
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = '';
                              void selectSocialImage(file);
                            }}
                          />
                        </div>
                        {draft.seo.socialImage !== null && (
                          <button
                            type="button"
                            className="wr-project-settings-remove-icon"
                            onClick={() => {
                              updateDraft({ seo: { ...draft.seo, socialImage: null } });
                              setSocialImageError(null);
                            }}
                          >
                            Remove image
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="wr-project-settings-security-note" role="note">
                      The image is saved with the project, embedded in Preview, and emitted to
                      <code>assets/images/</code> in the generated application.
                    </div>
                  </fieldset>
                  {socialImageError !== null && (
                    <div className="wr-project-settings-error" role="alert">
                      {socialImageError}
                    </div>
                  )}
                  {saveError !== null && (
                    <div
                      className="wr-project-settings-error"
                      id={`${descriptionId}-error`}
                      role="alert"
                    >
                      {saveError}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>{activeSection.description}</p>
                  <h4>Planned options</h4>
                  <ul>
                    {activeSection.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="wr-project-settings-note" role="note">
                    Data structures and editing controls will be added when these settings are
                    implemented.
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
        <footer className="wr-modal-actions wr-project-settings-actions">
          {isEditableSection ? (
            <>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={!hasChanges} onClick={save}>
                Save changes
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={onClose}>
              Close
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
