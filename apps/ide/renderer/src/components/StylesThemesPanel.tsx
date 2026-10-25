import { useState, type ReactElement } from 'react';
import {
  DEFAULT_PROJECT_THEMES,
  THEME_COLOR_NAMES,
  ProjectThemeSettingsSchema,
  resolveProjectColor,
  type ProjectThemeSettings,
  type ProjectThemeColor,
  type ThemeColorName,
  type ThemeMode,
} from '@webrad/project-model';
import { ProjectThemeContext } from '../project-theme';
import { ColorInput } from './ColorInput';

interface StylesThemesPanelProps {
  readonly themes: ProjectThemeSettings;
  readonly onSave: (themes: ProjectThemeSettings, linkDefaults: boolean) => void;
  readonly onClose: () => void;
}

export function StylesThemesPanel({
  themes,
  onSave,
  onClose,
}: StylesThemesPanelProps): ReactElement {
  const [draft, setDraft] = useState(themes);
  const [error, setError] = useState<string | null>(null);
  const [linkDefaults, setLinkDefaults] = useState(false);
  const [fixed, setFixed] = useState(
    () =>
      new Set(
        [
          ...THEME_COLOR_NAMES.map((id) => ({ key: `role:${id}`, pair: themes.colors[id] })),
          ...themes.customColors.map((entry) => ({ key: `custom:${entry.id}`, pair: entry })),
        ]
          .filter(
            ({ pair }) =>
              /^#[a-f0-9]{6}$/iu.test(pair.light) &&
              pair.light.toLowerCase() === pair.dark.toLowerCase(),
          )
          .map(({ key }) => key),
      ),
  );
  const rows = [
    ...THEME_COLOR_NAMES.map((id) => ({
      id,
      key: `role:${id}`,
      name: id,
      pair: draft.colors[id],
      builtin: true,
    })),
    ...draft.customColors.map((entry) => ({
      id: entry.id,
      key: `custom:${entry.id}`,
      name: entry.name,
      pair: entry,
      builtin: false,
    })),
  ];
  const update = (
    id: string,
    builtin: boolean,
    patch: Partial<ProjectThemeColor> & { name?: string },
  ): void => {
    setDraft((current) =>
      builtin
        ? {
            ...current,
            colors: {
              ...current.colors,
              [id]: { ...current.colors[id as ThemeColorName], ...patch },
            },
          }
        : {
            ...current,
            customColors: current.customColors.map((entry) =>
              entry.id === id ? { ...entry, ...patch } : entry,
            ),
          },
    );
    setError(null);
  };
  const save = (): void => {
    const parsed = ProjectThemeSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid themes.');
      return;
    }
    try {
      onSave(parsed.data, linkDefaults);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Themes could not be saved.');
    }
  };
  return (
    <section className="wr-styles-themes-panel" aria-label="Project themes">
      <h2>Themes</h2>
      <p>
        Manage all project colors here. Use different Light and Dark values, or the same color in
        both themes.
      </p>
      <div className="wr-themes-options">
        <label>
          Initial theme
          <select
            aria-label="Initial application theme"
            value={draft.initialMode}
            onChange={(event) =>
              setDraft({ ...draft, initialMode: event.target.value as ThemeMode })
            }
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="Remember application theme"
            checked={draft.rememberChoice}
            onChange={(event) => setDraft({ ...draft, rememberChoice: event.target.checked })}
          />
          Remember user choice
        </label>
        <button
          type="button"
          disabled={draft.customColors.length >= 100}
          onClick={() => {
            const id = `color-${crypto.randomUUID()}`;
            setDraft({
              ...draft,
              customColors: [
                ...draft.customColors,
                {
                  id,
                  name: `Color ${draft.customColors.length + 1}`,
                  light: '#334155',
                  dark: '#334155',
                },
              ],
            });
            setFixed((current) => new Set([...current, `custom:${id}`]));
            setError(null);
          }}
        >
          Add color
        </button>
      </div>
      <div className="wr-theme-colors-table" role="table" aria-label="Theme colors">
        <div className="wr-theme-color-row" role="row">
          <strong role="columnheader">Color</strong>
          <strong role="columnheader">Light</strong>
          <strong role="columnheader">Dark</strong>
          <strong role="columnheader">Same</strong>
          <span role="columnheader" aria-label="Actions" />
        </div>
        {rows.map((row) => (
          <div
            className="wr-theme-color-row"
            role="row"
            key={row.key}
            data-theme-role={row.builtin ? row.id : undefined}
            data-custom-theme-color={row.builtin ? undefined : row.id}
          >
            <span role="cell">
              {row.builtin ? (
                row.name
              ) : (
                <input
                  type="text"
                  aria-label={`Color ${row.id} name`}
                  value={row.name}
                  maxLength={40}
                  onChange={(event) => update(row.id, false, { name: event.target.value })}
                />
              )}
            </span>
            {(['light', 'dark'] as const).map((mode) => {
              const disabled = mode === 'dark' && fixed.has(row.key);
              const change = (value: string): void => {
                if (fixed.has(row.key)) {
                  const color = resolveProjectColor(value, draft, 'light');
                  update(row.id, row.builtin, { light: color, dark: color });
                } else update(row.id, row.builtin, { [mode]: value });
              };
              return (
                <ProjectThemeContext.Provider value={{ themes: draft, mode }} key={mode}>
                  <div role="cell" className="wr-theme-color-value">
                    <ColorInput
                      label={`${mode} ${row.id}`}
                      value={row.pair[mode]}
                      disabled={disabled}
                      showThemeColors={row.builtin && !disabled}
                      includeRoles={false}
                      onChange={change}
                    />
                    <input
                      type="text"
                      aria-label={`${mode} ${row.id} value`}
                      value={row.pair[mode]}
                      disabled={disabled}
                      spellCheck={false}
                      onChange={(event) => change(event.target.value)}
                    />
                  </div>
                </ProjectThemeContext.Provider>
              );
            })}
            <span role="cell">
              <input
                type="checkbox"
                aria-label={`Use same color in both themes for ${row.id}`}
                checked={fixed.has(row.key)}
                onChange={(event) => {
                  const same = event.target.checked;
                  setFixed((current) => {
                    const next = new Set(current);
                    if (same) next.add(row.key);
                    else next.delete(row.key);
                    return next;
                  });
                  if (same) {
                    const color = resolveProjectColor(row.pair.light, draft, 'light');
                    update(row.id, row.builtin, { light: color, dark: color });
                  }
                }}
              />
            </span>
            <span role="cell">
              {!row.builtin && (
                <button
                  type="button"
                  aria-label={`Remove theme color ${row.id}`}
                  title="Remove color"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      customColors: draft.customColors.filter((entry) => entry.id !== row.id),
                    });
                    setError(null);
                  }}
                >
                  ×
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="wr-themes-options">
        <button
          type="button"
          onClick={() => {
            setDraft({ ...draft, colors: DEFAULT_PROJECT_THEMES.colors });
            setFixed(
              (current) =>
                new Set(
                  [...current]
                    .filter((key) => key.startsWith('custom:'))
                    .concat(
                      THEME_COLOR_NAMES.filter(
                        (id) =>
                          DEFAULT_PROJECT_THEMES.colors[id].light ===
                          DEFAULT_PROJECT_THEMES.colors[id].dark,
                      ).map((id) => `role:${id}`),
                    ),
                ),
            );
            setError(null);
          }}
        >
          Restore Aurora theme colors
        </button>
        <label>
          <input
            type="checkbox"
            aria-label="Link Default styles and scrollbars"
            checked={linkDefaults}
            onChange={(event) => setLinkDefaults(event.target.checked)}
          />
          Link Default styles and scrollbars when saving
        </label>
      </div>
      <p>
        Custom colors keep their links when renamed. Unlink adaptive colors before removing them.
        Linking Default styles preserves custom styles and component color overrides.
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <div className="wr-styles-theme-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" onClick={save}>
          Save themes
        </button>
      </div>
    </section>
  );
}
