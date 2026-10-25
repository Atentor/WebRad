import { defaultComponentRegistry, type ComponentRegistry } from '@webrad/component-registry';
import { Icon } from './Icon';
import {
  createStylePropertyGroups,
  type StylePropertyGroup,
  type StylePropertyView,
} from '@webrad/designer';
import {
  COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS,
  COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  LINEAR_GRADIENT_DIRECTIONS,
  type BackgroundGradientValue,
  type ComponentStyleProperties,
  type ComponentStylePropertyDefinition,
  type ComponentStylePropertyName,
  type ComponentStyleStateName,
  type LinearGradientDirection,
  type StyleLengthUnit,
  type StyleLengthValue,
  type StylePropertyValue,
  paletteColorId,
  themeColorId,
  customThemeColorId,
} from '@webrad/project-model';
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useProjectColorResolver } from '../project-theme';
import { ColorInput, ThemeColorButton } from './ColorInput';

interface VisualStyleEditorProps {
  readonly componentType: string;
  readonly stateName: ComponentStyleStateName;
  readonly properties: ComponentStyleProperties;
  readonly onChange: (properties: ComponentStyleProperties) => void;
  readonly definitions?: readonly ComponentStylePropertyDefinition[];
  readonly registry?: ComponentRegistry;
}

interface PropertyControlProps {
  readonly definition: ComponentStylePropertyDefinition;
  readonly value: StylePropertyValue;
  readonly onChange: (value: StylePropertyValue) => void;
}

interface PropertyRowProps extends PropertyControlProps {
  readonly configured: boolean;
  readonly onClear: () => void;
  readonly onEnable: () => void;
}

type PropertyCategory = StylePropertyGroup;

interface CollapsiblePropertyCategoryProps {
  readonly category: PropertyCategory;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}

const HEX_COLOR = /^#[\da-f]{6}$/i;

function isLengthValue(value: StylePropertyValue): value is StyleLengthValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    'unit' in value &&
    (value.unit === 'px' ||
      value.unit === 'rem' ||
      value.unit === '%' ||
      value.unit === 'vw' ||
      value.unit === 'vh')
  );
}

function isLinearGradientValue(value: StylePropertyValue): value is BackgroundGradientValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'linear' &&
    'direction' in value &&
    typeof value.direction === 'string' &&
    'from' in value &&
    typeof value.from === 'string' &&
    (HEX_COLOR.test(value.from) ||
      paletteColorId(value.from) !== undefined ||
      customThemeColorId(value.from) !== undefined ||
      themeColorId(value.from) !== undefined) &&
    'to' in value &&
    typeof value.to === 'string' &&
    (HEX_COLOR.test(value.to) ||
      paletteColorId(value.to) !== undefined ||
      customThemeColorId(value.to) !== undefined ||
      themeColorId(value.to) !== undefined)
  );
}

function clamp(value: number, minimum: number | undefined, maximum: number | undefined): number {
  return Math.min(
    maximum ?? Number.POSITIVE_INFINITY,
    Math.max(minimum ?? Number.NEGATIVE_INFINITY, value),
  );
}

function CollapsiblePropertyCategory({
  category,
  expanded,
  onToggle,
  children,
}: CollapsiblePropertyCategoryProps): ReactElement {
  const contentId = useId();
  return (
    <section className="wr-style-property-category">
      <button
        type="button"
        className="wr-style-category-summary"
        aria-label={
          category.name +
          ', ' +
          String(category.configuredCount) +
          ' configured, ' +
          String(category.definitions.length) +
          ' properties'
        }
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span>
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
          {category.name}
        </span>
        {category.configuredCount > 0 && (
          <span>
            <strong>{category.configuredCount} set</strong>
          </span>
        )}
      </button>
      {expanded && (
        <div id={contentId} className="wr-style-category-properties">
          {children}
        </div>
      )}
    </section>
  );
}

function EnumControl({ definition, value, onChange }: PropertyControlProps): ReactElement {
  if (definition.editor.kind !== 'enum') throw new Error('Expected an enum style editor.');
  return (
    <select
      aria-label={definition.label}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    >
      {definition.editor.options.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ColorControl({ definition, value, onChange }: PropertyControlProps): ReactElement {
  const resolveColor = useProjectColorResolver();
  if (definition.editor.kind !== 'color') throw new Error('Expected a color style editor.');
  const linked =
    themeColorId(value) !== undefined ||
    customThemeColorId(value) !== undefined ||
    paletteColorId(value) !== undefined;
  const custom = typeof value === 'string' && (HEX_COLOR.test(value) || linked);
  return (
    <div className="wr-style-color-control">
      <select
        aria-label={`${definition.label} type`}
        value={linked ? 'theme' : custom ? 'custom' : String(value)}
        onChange={(event) =>
          onChange(
            event.target.value === 'custom'
              ? linked
                ? resolveColor(String(value))
                : '#000000'
              : event.target.value,
          )
        }
      >
        <option value="custom">Custom color</option>
        {linked && (
          <option value="theme" disabled>
            Theme color
          </option>
        )}
        {definition.editor.keywords.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {custom && (
        <div className="wr-style-color-picker">
          <ColorInput
            label={definition.label}
            value={value}
            showThemeColors={false}
            onChange={onChange}
          />
          <span>{resolveColor(String(value)).toUpperCase()}</span>
        </div>
      )}
      <ThemeColorButton label={definition.label} value={String(value)} onChange={onChange} />
    </div>
  );
}

function gradientDirection(
  value: string,
  fallback: LinearGradientDirection,
): LinearGradientDirection {
  return LINEAR_GRADIENT_DIRECTIONS.find((direction) => direction === value) ?? fallback;
}

function exclusivePropertyName(
  name: ComponentStylePropertyName,
): ComponentStylePropertyName | undefined {
  const pair = COMPONENT_STYLE_PROPERTY_EXCLUSIVE_PAIRS.find(
    ([first, second]) => first === name || second === name,
  );
  if (pair === undefined) return undefined;
  return pair[0] === name ? pair[1] : pair[0];
}

function GradientControl({ definition, value, onChange }: PropertyControlProps): ReactElement {
  const resolveColor = useProjectColorResolver();
  if (definition.editor.kind !== 'gradient') throw new Error('Expected a gradient style editor.');
  const editor = definition.editor;
  const fallbackDirection = gradientDirection(editor.directions[0]?.value ?? '', 'to-right');
  const defaultGradient: BackgroundGradientValue = isLinearGradientValue(definition.defaultValue)
    ? definition.defaultValue
    : {
        kind: 'linear',
        direction: fallbackDirection,
        from: '#2563eb',
        to: '#7c3aed',
      };
  const gradient: BackgroundGradientValue = isLinearGradientValue(value) ? value : defaultGradient;
  const changeGradient = (
    patch: Partial<Pick<BackgroundGradientValue, 'direction' | 'from' | 'to'>>,
  ): void => {
    onChange({ ...gradient, ...patch });
  };

  return (
    <div className="wr-style-gradient-control">
      <select
        aria-label={`${definition.label} direction`}
        value={gradient.direction}
        onChange={(event) =>
          changeGradient({ direction: gradientDirection(event.target.value, gradient.direction) })
        }
      >
        {editor.directions.map((direction) => (
          <option value={direction.value} key={direction.value}>
            {direction.label}
          </option>
        ))}
      </select>
      <div className="wr-style-gradient-colors">
        <div className="wr-style-gradient-color-field">
          <div className="wr-style-gradient-color-picker">
            <span>From</span>
            <ColorInput
              label={`${definition.label} from color`}
              value={gradient.from}
              showThemeColors={false}
              onChange={(from) => changeGradient({ from })}
            />
            <code>{resolveColor(gradient.from).toUpperCase()}</code>
          </div>
          <ThemeColorButton
            label={`${definition.label} from color`}
            value={gradient.from}
            onChange={(from) => changeGradient({ from })}
          />
        </div>
        <div className="wr-style-gradient-color-field">
          <div className="wr-style-gradient-color-picker">
            <span>To</span>
            <ColorInput
              label={`${definition.label} to color`}
              value={gradient.to}
              showThemeColors={false}
              onChange={(to) => changeGradient({ to })}
            />
            <code>{resolveColor(gradient.to).toUpperCase()}</code>
          </div>
          <ThemeColorButton
            label={`${definition.label} to color`}
            value={gradient.to}
            onChange={(to) => changeGradient({ to })}
          />
        </div>
      </div>
    </div>
  );
}

function LengthControl({ definition, value, onChange }: PropertyControlProps): ReactElement {
  if (definition.editor.kind !== 'length') throw new Error('Expected a length style editor.');
  const editor = definition.editor;
  const custom = isLengthValue(value);
  const fallbackUnit = editor.units[0] ?? 'px';
  const customValue = custom ? value : { value: 0, unit: fallbackUnit };
  const minimum = editor.min ?? (editor.allowNegative === true ? undefined : 0);

  return (
    <div className="wr-style-length-control">
      {((editor.keywords !== undefined && editor.keywords.length > 0) || !custom) && (
        <select
          aria-label={`${definition.label} mode`}
          value={custom ? 'custom' : String(value)}
          onChange={(event) => {
            if (event.target.value === 'custom') {
              onChange({ value: customValue.value, unit: customValue.unit });
              return;
            }
            onChange(event.target.value);
          }}
        >
          <option value="custom">Custom size</option>
          {editor.keywords?.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {custom && (
        <div className="wr-style-value-with-unit">
          <input
            type="number"
            aria-label={`${definition.label} value`}
            value={customValue.value}
            min={minimum}
            max={editor.max}
            step={editor.step ?? 0.25}
            onChange={(event) => {
              const next = event.target.valueAsNumber;
              if (!Number.isFinite(next)) return;
              onChange({
                value: clamp(next, minimum, editor.max),
                unit: customValue.unit,
              });
            }}
          />
          <select
            aria-label={`${definition.label} unit`}
            value={customValue.unit}
            onChange={(event) =>
              onChange({
                value: customValue.value,
                unit: event.target.value as StyleLengthUnit,
              })
            }
          >
            {editor.units.map((unit) => (
              <option value={unit} key={unit}>
                {unit}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function NumberControl({ definition, value, onChange }: PropertyControlProps): ReactElement {
  if (definition.editor.kind !== 'number') throw new Error('Expected a number style editor.');
  const editor = definition.editor;
  const numericValue = typeof value === 'number' ? value : editor.min;
  const update = (next: number): void => {
    if (!Number.isFinite(next)) return;
    const bounded = clamp(next, editor.min, editor.max);
    onChange(editor.integer === true ? Math.round(bounded) : bounded);
  };

  return (
    <div className="wr-style-number-control">
      <input
        type="range"
        aria-label={`${definition.label} slider`}
        value={numericValue}
        min={editor.min}
        max={editor.max}
        step={editor.step}
        onChange={(event) => update(event.target.valueAsNumber)}
      />
      <div className="wr-style-number-field">
        <input
          type="number"
          aria-label={definition.label}
          value={numericValue}
          min={editor.min}
          max={editor.max}
          step={editor.step}
          onChange={(event) => update(event.target.valueAsNumber)}
        />
        {editor.suffix !== undefined && <span>{editor.suffix}</span>}
      </div>
    </div>
  );
}

function PropertyControl(props: PropertyControlProps): ReactElement {
  switch (props.definition.editor.kind) {
    case 'enum':
      return <EnumControl {...props} />;
    case 'length':
      return <LengthControl {...props} />;
    case 'color':
      return <ColorControl {...props} />;
    case 'gradient':
      return <GradientControl {...props} />;
    case 'number':
      return <NumberControl {...props} />;
  }
}

function PropertyRow({
  definition,
  value,
  configured,
  onChange,
  onClear,
  onEnable,
}: PropertyRowProps): ReactElement {
  const controlId = useId();
  return (
    <div className={configured ? 'wr-style-property-row configured' : 'wr-style-property-row'}>
      <div className="wr-style-property-label">
        <input
          id={controlId}
          type="checkbox"
          aria-label={'Configure ' + definition.label}
          checked={configured}
          onChange={(event) => (event.target.checked ? onEnable() : onClear())}
        />
        <label htmlFor={controlId} title={definition.description}>
          <strong>{definition.label}</strong>
        </label>
      </div>
      {configured ? (
        <div className="wr-style-property-editor">
          <PropertyControl definition={definition} value={value} onChange={onChange} />
          <button
            type="button"
            onClick={onClear}
            aria-label={'Clear ' + definition.label}
            title={'Use component default for ' + definition.label}
          >
            Clear
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="wr-style-property-default"
          onClick={onEnable}
          aria-label={'Set ' + definition.label}
        >
          Default
        </button>
      )}
    </div>
  );
}

/** Metadata-driven editor for one interaction state of a reusable component style. */
export function VisualStyleEditor({
  componentType,
  stateName,
  properties,
  onChange,
  definitions = COMPONENT_STYLE_PROPERTY_DEFINITIONS,
  registry = defaultComponentRegistry,
}: VisualStyleEditorProps): ReactElement {
  const searchId = useId();
  const hintId = useId();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<StylePropertyView>('essential');
  const [openCategoryName, setOpenCategoryName] = useState<string | null | undefined>(undefined);
  const [collapsedCategories, setCollapsedCategories] = useState<readonly string[]>([]);
  const autoExpand = search.trim().length > 0 || view === 'configured';
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const definition = registry.get(componentType);
  const essentialProperties = definition?.styleEditor?.essentialProperties;
  const categories = useMemo(
    () =>
      createStylePropertyGroups({
        definitions,
        componentType,
        stateName,
        properties,
        essentialProperties,
        view,
        search,
      }),
    [definitions, componentType, stateName, properties, essentialProperties, view, search],
  );
  const configuredCount = Object.keys(properties).length;
  const resultCount = categories.reduce(
    (total, category) => total + category.definitions.length,
    0,
  );

  const changeProperty = (
    name: ComponentStylePropertyName,
    value: StylePropertyValue | undefined,
  ): void => {
    const next: Partial<Record<ComponentStylePropertyName, StylePropertyValue>> = { ...properties };
    if (value === undefined) delete next[name];
    else {
      next[name] = value;
      const exclusiveProperty = exclusivePropertyName(name);
      if (exclusiveProperty !== undefined) delete next[exclusiveProperty];
    }
    onChange(next);
  };
  const changeView = (nextView: StylePropertyView): void => {
    setView(nextView);
    setOpenCategoryName(undefined);
    setSearch('');
    setCollapsedCategories([]);
  };
  const hint =
    normalizedSearch.length > 0
      ? String(resultCount) + ' matches across all properties'
      : view === 'essential'
        ? 'Common properties for ' + (definition?.displayName ?? componentType)
        : view === 'configured'
          ? 'Only properties set in this state'
          : 'Complete property catalog';

  return (
    <section className="wr-style-visual-editor" aria-label="Visual style properties">
      <header className="wr-style-visual-editor-heading">
        <h2>Style properties</h2>
        <span>{configuredCount} configured</span>
      </header>
      <div className="wr-style-property-toolbar">
        <div className="wr-style-property-views" role="group" aria-label="Property view">
          <button
            type="button"
            aria-pressed={view === 'essential'}
            onClick={() => changeView('essential')}
          >
            Essential
          </button>
          <button type="button" aria-pressed={view === 'all'} onClick={() => changeView('all')}>
            All properties
          </button>
          <button
            type="button"
            aria-label="Configured"
            aria-pressed={view === 'configured'}
            onClick={() => changeView('configured')}
          >
            Configured <span>{configuredCount}</span>
          </button>
        </div>
        <div className="wr-style-property-search">
          <input
            id={searchId}
            aria-label="Search properties"
            aria-describedby={hintId}
            type="search"
            value={search}
            placeholder="Search all properties..."
            onChange={(event) => {
              setSearch(event.target.value);
              setCollapsedCategories([]);
            }}
          />
          {search.length > 0 && (
            <button type="button" onClick={() => setSearch('')}>
              Clear search
            </button>
          )}
        </div>
        <p id={hintId} className="wr-style-property-hint" aria-live="polite">
          {hint}
        </p>
      </div>
      <div className="wr-style-property-categories">
        {categories.map((category) => (
          <CollapsiblePropertyCategory
            category={category}
            key={category.name}
            expanded={
              autoExpand
                ? !collapsedCategories.includes(category.name)
                : openCategoryName === undefined
                  ? categories[0]?.name === category.name
                  : openCategoryName === category.name
            }
            onToggle={() => {
              if (autoExpand) {
                setCollapsedCategories((current) =>
                  current.includes(category.name)
                    ? current.filter((name) => name !== category.name)
                    : [...current, category.name],
                );
              } else {
                setOpenCategoryName((current) =>
                  (current === undefined ? categories[0]?.name : current) === category.name
                    ? null
                    : category.name,
                );
              }
            }}
          >
            {category.definitions.map((propertyDefinition) => {
              const value = properties[propertyDefinition.name];
              return (
                <PropertyRow
                  key={propertyDefinition.name}
                  definition={propertyDefinition}
                  configured={value !== undefined}
                  value={value ?? propertyDefinition.defaultValue}
                  onEnable={() =>
                    changeProperty(propertyDefinition.name, propertyDefinition.defaultValue)
                  }
                  onClear={() => changeProperty(propertyDefinition.name, undefined)}
                  onChange={(nextValue) => changeProperty(propertyDefinition.name, nextValue)}
                />
              );
            })}
          </CollapsiblePropertyCategory>
        ))}
        {categories.length === 0 && (
          <div className="wr-style-property-no-results">
            <strong>
              {normalizedSearch.length === 0 && view === 'configured'
                ? 'No configured properties'
                : 'No matching properties'}
            </strong>
            <span>
              {normalizedSearch.length === 0 && view === 'configured'
                ? 'This state uses the component defaults.'
                : 'Try another name or category.'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
