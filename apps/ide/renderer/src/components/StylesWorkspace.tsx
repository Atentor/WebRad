import {
  defaultComponentRegistry,
  type ComponentDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import { ComponentView, SharedComponentStyles } from '@webrad/components';
import type { ComponentStyleModel } from '@webrad/project-model';
import { resolveComponentStyleClassName, tokenizeTailwindClasses } from '@webrad/runtime/visual';
import { useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';

type StyleClassState = keyof ComponentStyleModel['classes'];

interface StyleStateDefinition {
  readonly key: StyleClassState;
  readonly label: string;
  readonly description: string;
  readonly example: string;
}

const STYLE_STATES: readonly StyleStateDefinition[] = [
  {
    key: 'base',
    label: 'Base',
    description: 'Utilities that are always applied to the component.',
    example: 'px-4 py-2 rounded-lg bg-blue-600 text-white shadow-sm',
  },
  {
    key: 'hover',
    label: 'Hover',
    description: 'Utilities applied while the pointer is over the component.',
    example: 'bg-blue-700 shadow-md scale-105',
  },
  {
    key: 'focus',
    label: 'Focus',
    description: 'Utilities applied when the component has keyboard focus.',
    example: 'outline-none ring-2 ring-blue-400 ring-offset-2',
  },
  {
    key: 'active',
    label: 'Active',
    description: 'Utilities applied while the component is being activated.',
    example: 'scale-95 shadow-none',
  },
  {
    key: 'disabled',
    label: 'Disabled',
    description: 'Utilities applied when the component is disabled.',
    example: 'opacity-50 cursor-not-allowed grayscale',
  },
  {
    key: 'animation',
    label: 'Animation',
    description: 'Transition and animation utilities shared by all interaction states.',
    example: 'transition-all duration-200 ease-out animate-pulse',
  },
  {
    key: 'advanced',
    label: 'Advanced',
    description: 'Complete Tailwind variants, arbitrary values, and descendant selectors.',
    example: 'dark:bg-slate-900 max-sm:w-full [&>svg]:size-4 [--accent:#2563eb]',
  },
] as const;

const DEFAULT_STYLE_STATE = STYLE_STATES[0]!;

interface StylesWorkspaceProps {
  readonly styles: readonly ComponentStyleModel[];
  readonly compiledCss?: string;
  readonly onCreateStyle: (name: string, componentType: string) => string | null;
  readonly onUpdateStyle: (style: ComponentStyleModel) => void;
  readonly onDeleteStyle: (styleId: string) => void;
  readonly registry?: ComponentRegistry;
}

interface StyleNameEditorProps {
  readonly style: ComponentStyleModel;
  readonly styles: readonly ComponentStyleModel[];
  readonly onCommit: (name: string) => void;
}

function suggestedStyleName(
  definition: ComponentDefinition | undefined,
  styles: readonly ComponentStyleModel[],
): string {
  const base = `${definition?.displayName ?? 'Component'} Style`;
  const occupied = new Set(styles.map((style) => style.name.toLowerCase()));
  if (!occupied.has(base.toLowerCase())) return base;
  let sequence = 2;
  while (occupied.has(`${base} ${String(sequence)}`.toLowerCase())) sequence += 1;
  return `${base} ${String(sequence)}`;
}

function classCount(value: string): number {
  return tokenizeTailwindClasses(value).length;
}

function componentGlyph(definition: ComponentDefinition | undefined): ReactElement {
  return (
    <span
      className="wr-style-component-glyph"
      data-icon={definition?.icon ?? 'component-unknown'}
      aria-hidden="true"
    >
      {(definition?.palette.caption ?? '?').slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}

function StyleNameEditor({ style, styles, onCommit }: StyleNameEditorProps): ReactElement {
  const [draft, setDraft] = useState(style.name);
  const [error, setError] = useState<string | null>(null);

  const commit = (): void => {
    const name = draft.trim();
    if (name.length === 0) {
      setDraft(style.name);
      setError('Style name cannot be empty.');
      return;
    }
    const duplicate = styles.some(
      (candidate) =>
        candidate.id !== style.id && candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setDraft(style.name);
      setError('A style with this name already exists.');
      return;
    }
    setError(null);
    if (name !== style.name) onCommit(name);
  };

  return (
    <div className="wr-style-name-field">
      <label htmlFor={`style-name-${style.id}`}>Style name</label>
      <input
        id={`style-name-${style.id}`}
        value={draft}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(style.name);
            setError(null);
            event.currentTarget.blur();
          }
        }}
      />
      {error !== null && <small role="alert">{error}</small>}
    </div>
  );
}

export function StylesWorkspace({
  styles,
  compiledCss = '',
  onCreateStyle,
  onUpdateStyle,
  onDeleteStyle,
  registry = defaultComponentRegistry,
}: StylesWorkspaceProps): ReactElement {
  const createNameId = useId();
  const createTypeId = useId();
  const visualDefinitions = useMemo(
    () => registry.list().filter((definition) => definition.visual),
    [registry],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftType, setDraftType] = useState(visualDefinitions[0]?.type ?? '');
  const [draftName, setDraftName] = useState(() =>
    suggestedStyleName(visualDefinitions[0], styles),
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<StyleClassState>('base');
  const selectedStyle = styles.find((style) => style.id === selectedId) ?? styles[0];
  const selectedDefinition =
    selectedStyle === undefined ? undefined : registry.get(selectedStyle.componentType);
  const activeStateDefinition =
    STYLE_STATES.find((state) => state.key === activeState) ?? DEFAULT_STYLE_STATE;
  const previewNode = useMemo(
    () =>
      selectedStyle === undefined || selectedDefinition?.visual !== true
        ? undefined
        : registry.createComponent(selectedStyle.componentType, {
            id: `style-preview-${selectedStyle.id}`,
            name: 'StylePreview',
            width: 180,
            height: 72,
            props: { enabled: activeState !== 'disabled' },
          }),
    [activeState, registry, selectedDefinition, selectedStyle],
  );

  const beginCreate = (): void => {
    const definition = registry.get(draftType) ?? visualDefinitions[0];
    const componentType = definition?.type ?? '';
    setDraftType(componentType);
    setDraftName(suggestedStyleName(definition, styles));
    setCreateError(null);
    setCreating(true);
  };

  const submitCreate = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = draftName.trim();
    if (name.length === 0) {
      setCreateError('Enter a style name.');
      return;
    }
    if (styles.some((style) => style.name.toLowerCase() === name.toLowerCase())) {
      setCreateError('A style with this name already exists.');
      return;
    }
    if (!visualDefinitions.some((definition) => definition.type === draftType)) {
      setCreateError('Choose a visual component type.');
      return;
    }
    const id = onCreateStyle(name, draftType);
    if (id === null) return;
    setSelectedId(id);
    setActiveState('base');
    setCreating(false);
    setCreateError(null);
  };

  const deleteSelectedStyle = (): void => {
    if (selectedStyle === undefined) return;
    if (
      !window.confirm(
        `Delete style "${selectedStyle.name}"? Components using it will be set to None.`,
      )
    ) {
      return;
    }
    const index = styles.findIndex((style) => style.id === selectedStyle.id);
    const nextSelection = styles[index + 1] ?? styles[index - 1];
    setSelectedId(nextSelection?.id ?? null);
    onDeleteStyle(selectedStyle.id);
  };

  return (
    <section className="wr-styles-workspace" aria-label="Styles editor">
      <style data-webrad-project-styles>{compiledCss}</style>
      <SharedComponentStyles />
      <header className="wr-styles-header">
        <span className="material-icons wr-styles-header-icon" aria-hidden="true">
          palette
        </span>
        <div>
          <h1>Styles</h1>
          <p>Create reusable Tailwind styles and assign them to compatible components.</p>
        </div>
        <span className="wr-styles-preview-badge">Tailwind CSS</span>
      </header>

      <div className="wr-styles-notice" role="note">
        <span className="material-icons" aria-hidden="true">
          info
        </span>
        <span>
          Enter Tailwind utilities separated by spaces. State prefixes are applied automatically;
          use Advanced for complete variants and arbitrary values.
        </span>
      </div>

      <div className="wr-styles-body">
        <aside className="wr-style-library" aria-label="Style library">
          <div className="wr-style-section-heading">
            <div>
              <span>Project</span>
              <h2>Style library</h2>
            </div>
            <button type="button" onClick={beginCreate} disabled={visualDefinitions.length === 0}>
              <span className="material-icons" aria-hidden="true">
                add
              </span>
              New style
            </button>
          </div>

          <div className="wr-style-library-content">
            {creating && (
              <form className="wr-style-create-form" onSubmit={submitCreate}>
                <strong>Create style</strong>
                <label htmlFor={createTypeId}>Component type</label>
                <select
                  id={createTypeId}
                  value={draftType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setDraftType(nextType);
                    setDraftName(suggestedStyleName(registry.get(nextType), styles));
                    setCreateError(null);
                  }}
                >
                  {visualDefinitions.map((definition) => (
                    <option value={definition.type} key={definition.type}>
                      {definition.displayName}
                    </option>
                  ))}
                </select>
                <label htmlFor={createNameId}>New style name</label>
                <input
                  id={createNameId}
                  value={draftName}
                  spellCheck={false}
                  autoFocus
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    setCreateError(null);
                  }}
                />
                {createError !== null && <small role="alert">{createError}</small>}
                <div className="wr-style-create-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setCreateError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit">Create</button>
                </div>
              </form>
            )}

            {styles.length === 0 && !creating ? (
              <div className="wr-style-library-empty">
                <span className="material-icons" aria-hidden="true">
                  layers
                </span>
                <strong>No styles yet</strong>
                <p>Create a reusable style for one of the visual component types.</p>
              </div>
            ) : (
              <div className="wr-style-list" role="listbox" aria-label="Project styles">
                {styles.map((style) => {
                  const definition = registry.get(style.componentType);
                  const selected = selectedStyle?.id === style.id;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? 'selected' : ''}
                      key={style.id}
                      onClick={() => {
                        setSelectedId(style.id);
                        setActiveState('base');
                      }}
                    >
                      {componentGlyph(definition)}
                      <span>
                        <strong>{style.name}</strong>
                        <small>{definition?.displayName ?? style.componentType}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="wr-style-configurator">
          {selectedStyle === undefined ? (
            <div className="wr-style-configurator-empty">
              <span className="material-icons" aria-hidden="true">
                style
              </span>
              <h2>Create your first component style</h2>
              <p>
                Choose a component type, configure its Tailwind states, then assign the style from
                the Object Inspector.
              </p>
              <button type="button" onClick={beginCreate} disabled={visualDefinitions.length === 0}>
                New style
              </button>
            </div>
          ) : (
            <>
              <div className="wr-style-configurator-heading">
                <StyleNameEditor
                  key={selectedStyle.id}
                  style={selectedStyle}
                  styles={styles}
                  onCommit={(name) => onUpdateStyle({ ...selectedStyle, name })}
                />
                <div className="wr-style-configurator-actions">
                  <span className="wr-style-component-type">
                    {componentGlyph(selectedDefinition)}
                    {selectedDefinition?.displayName ?? selectedStyle.componentType}
                  </span>
                  <button
                    type="button"
                    className="wr-style-delete-button"
                    onClick={deleteSelectedStyle}
                    title="Delete style"
                    aria-label={`Delete ${selectedStyle.name}`}
                  >
                    <span className="material-icons" aria-hidden="true">
                      delete
                    </span>
                  </button>
                </div>
              </div>

              <div className="wr-style-state-strip" role="tablist" aria-label="Style states">
                {STYLE_STATES.map((state) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeState === state.key}
                    className={activeState === state.key ? 'active' : ''}
                    key={state.key}
                    onClick={() => setActiveState(state.key)}
                  >
                    {state.label}
                    {classCount(selectedStyle.classes[state.key]) > 0 && (
                      <span aria-label={`${state.label} configured`} />
                    )}
                  </button>
                ))}
              </div>

              <section className="wr-style-class-editor" aria-label="Tailwind class editor">
                <div className="wr-style-class-editor-heading">
                  <div>
                    <span>{activeStateDefinition.label} state</span>
                    <h2>Tailwind classes</h2>
                  </div>
                  <span>{classCount(selectedStyle.classes[activeState])} utilities</span>
                </div>
                <p>{activeStateDefinition.description}</p>
                <textarea
                  aria-label={`${activeStateDefinition.label} Tailwind classes`}
                  value={selectedStyle.classes[activeState]}
                  placeholder={activeStateDefinition.example}
                  spellCheck={false}
                  rows={5}
                  onChange={(event) =>
                    onUpdateStyle({
                      ...selectedStyle,
                      classes: {
                        ...selectedStyle.classes,
                        [activeState]: event.target.value,
                      },
                    })
                  }
                />
                <div className="wr-style-class-example">
                  <span className="material-icons" aria-hidden="true">
                    lightbulb
                  </span>
                  <span>
                    <strong>Example</strong>
                    <code>{activeStateDefinition.example}</code>
                  </span>
                </div>
              </section>

              <section className="wr-style-component-preview" aria-label="Component style preview">
                <div className="wr-style-preview-heading">
                  <div>
                    <span>Preview</span>
                    <h3>{selectedDefinition?.displayName ?? selectedStyle.componentType}</h3>
                  </div>
                  <span>{activeStateDefinition.label}</span>
                </div>
                <div className="wr-style-preview-canvas">
                  <div className="wr-style-preview-frame" data-style-preview={selectedStyle.id}>
                    {previewNode === undefined ? (
                      <span className="wr-style-preview-unavailable">
                        Preview unavailable for unregistered or nonvisual component type{' '}
                        <code>{selectedStyle.componentType}</code>.
                      </span>
                    ) : (
                      <ComponentView
                        node={previewNode}
                        designTime
                        styleClassName={resolveComponentStyleClassName(selectedStyle)}
                      />
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
