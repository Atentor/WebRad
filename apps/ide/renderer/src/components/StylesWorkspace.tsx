import {
  defaultComponentRegistry,
  type ComponentDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import { ComponentView, SharedComponentStyles } from '@webrad/components';
import {
  createDefaultDataGridConfiguration,
  portableFileNameKey,
  type ComponentStyleModel,
  type ComponentStyleStateName,
} from '@webrad/project-model';
import { resolveComponentStylePreviewClassName } from '@webrad/runtime/visual';
import { useId, useMemo, useState, type FormEvent, type ReactElement } from 'react';
import { Icon } from './Icon';
import { VisualStyleEditor } from './VisualStyleEditor';

interface StyleStateDefinition {
  readonly key: ComponentStyleStateName;
  readonly label: string;
}

const STYLE_STATES: readonly StyleStateDefinition[] = [
  {
    key: 'base',
    label: 'Base',
  },
  {
    key: 'hover',
    label: 'Hover',
  },
  {
    key: 'focus',
    label: 'Focus',
  },
  {
    key: 'active',
    label: 'Active',
  },
  {
    key: 'disabled',
    label: 'Disabled',
  },
] as const;

const DEFAULT_STYLE_STATE = STYLE_STATES[0]!;

function createPreviewProps(
  componentType: string,
  activeState: ComponentStyleStateName,
): Record<string, unknown> {
  const props: Record<string, unknown> = { enabled: activeState !== 'disabled' };
  if (componentType !== 'WebDataGrid') return props;

  const dataGridConfig = createDefaultDataGridConfiguration();
  return {
    ...props,
    dataGridConfig: {
      ...dataGridConfig,
      showFooter: true,
      columns: dataGridConfig.columns.map((column, index) => ({
        ...column,
        footer: `Footer ${String(index + 1)}`,
      })),
    },
  };
}

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
  const occupied = new Set(styles.map((style) => portableFileNameKey(style.name)));
  if (!occupied.has(portableFileNameKey(base))) return base;
  let sequence = 2;
  while (occupied.has(portableFileNameKey(`${base} ${String(sequence)}`))) sequence += 1;
  return `${base} ${String(sequence)}`;
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
        candidate.id !== style.id &&
        portableFileNameKey(candidate.name) === portableFileNameKey(name),
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
  const [activeState, setActiveState] = useState<ComponentStyleStateName>('base');
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
            props: createPreviewProps(selectedStyle.componentType, activeState),
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
    if (styles.some((style) => portableFileNameKey(style.name) === portableFileNameKey(name))) {
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
    if (selectedStyle.preset === 'default') return;
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

      <div className="wr-styles-body">
        <aside className="wr-style-library" aria-label="Style library">
          <div className="wr-style-section-heading">
            <div>
              <span>Project</span>
              <h2>Style library</h2>
            </div>
            <button type="button" onClick={beginCreate} disabled={visualDefinitions.length === 0}>
              <Icon name="add" />
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
                <Icon name="layers" />
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
                        <small>
                          {style.preset === 'default' ? 'Default · ' : ''}
                          {definition?.displayName ?? style.componentType}
                        </small>
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
              <Icon name="style" />
              <h2>Create your first component style</h2>
              <p>
                Choose a component type, customize its visual states, then assign the style from the
                Object Inspector.
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
                    disabled={selectedStyle.preset === 'default'}
                    title={
                      selectedStyle.preset === 'default'
                        ? 'Default styles cannot be deleted.'
                        : 'Delete style'
                    }
                    aria-label={
                      selectedStyle.preset === 'default'
                        ? `${selectedStyle.name} is a protected default style`
                        : `Delete ${selectedStyle.name}`
                    }
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              </div>

              <div className="wr-style-state-strip" role="tablist" aria-label="Style states">
                {STYLE_STATES.map((state) => (
                  <button
                    type="button"
                    role="tab"
                    aria-label={state.label}
                    aria-selected={activeState === state.key}
                    className={activeState === state.key ? 'active' : ''}
                    key={state.key}
                    onClick={() => setActiveState(state.key)}
                  >
                    {state.label}
                    {Object.keys(selectedStyle.states[state.key]).length > 0 && (
                      <span title={`${state.label} configured`} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>

              <div className="wr-style-editor-layout">
                <VisualStyleEditor
                  key={`${selectedStyle.id}-${activeState}`}
                  componentType={selectedStyle.componentType}
                  stateName={activeState}
                  properties={selectedStyle.states[activeState]}
                  onChange={(properties) =>
                    onUpdateStyle({
                      ...selectedStyle,
                      states: {
                        ...selectedStyle.states,
                        [activeState]: properties,
                      },
                    })
                  }
                />

                <section
                  className="wr-style-component-preview"
                  aria-label="Component style preview"
                >
                  <div className="wr-style-preview-heading">
                    <div>
                      <span>Live preview</span>
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
                          styleClassName={resolveComponentStylePreviewClassName(
                            selectedStyle,
                            activeState,
                          )}
                        />
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
