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
} from '@webrad/project-model';
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react';

interface VisualStyleEditorProps {
  readonly componentType: string;
  readonly stateName: ComponentStyleStateName;
  readonly properties: ComponentStyleProperties;
  readonly onChange: (properties: ComponentStyleProperties) => void;
  readonly definitions?: readonly ComponentStylePropertyDefinition[];
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

interface PropertyCategory {
  readonly name: string;
  readonly definitions: readonly ComponentStylePropertyDefinition[];
  readonly configuredCount: number;
}

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
    HEX_COLOR.test(value.from) &&
    'to' in value &&
    typeof value.to === 'string' &&
    HEX_COLOR.test(value.to)
  );
}

function clamp(value: number, minimum: number | undefined, maximum: number | undefined): number {
  return Math.min(
    maximum ?? Number.POSITIVE_INFINITY,
    Math.max(minimum ?? Number.NEGATIVE_INFINITY, value),
  );
}

function groupDefinitions(
  definitions: readonly ComponentStylePropertyDefinition[],
  properties: ComponentStyleProperties,
): readonly PropertyCategory[] {
  const groups = new Map<string, ComponentStylePropertyDefinition[]>();
  for (const definition of definitions) {
    const group = groups.get(definition.category) ?? [];
    group.push(definition);
    groups.set(definition.category, group);
  }

  return [...groups].map(([name, group]) => {
    return {
      name,
      definitions: group,
      configuredCount: group.filter((definition) => properties[definition.name] !== undefined)
        .length,
    };
  });
}

function CollapsiblePropertyCategory({
  category,
  expanded,
  onToggle,
  children,
}: CollapsiblePropertyCategoryProps): ReactElement {
  return (
    <section
      className={`wr-style-property-category${category.name === 'Animation' ? ' wr-style-animation-category' : ''}`}
    >
      <button
        type="button"
        className="wr-style-category-summary"
        aria-label={`${category.name}, ${String(category.configuredCount)} configured, ${String(category.definitions.length)} properties`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span>{category.name}</span>
        <span>
          {category.configuredCount > 0 && <strong>{category.configuredCount} set</strong>}
          {category.definitions.length} properties
        </span>
      </button>
      {expanded && <div className="wr-style-category-properties">{children}</div>}
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
  if (definition.editor.kind !== 'color') throw new Error('Expected a color style editor.');
  const custom = typeof value === 'string' && HEX_COLOR.test(value);
  return (
    <div className="wr-style-color-control">
      <select
        aria-label={`${definition.label} type`}
        value={custom ? 'custom' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === 'custom' ? '#000000' : event.target.value)
        }
      >
        <option value="custom">Custom color</option>
        {definition.editor.keywords.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {custom && (
        <label className="wr-style-color-picker">
          <input
            type="color"
            aria-label={definition.label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>{value.toUpperCase()}</span>
        </label>
      )}
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
        <label className="wr-style-gradient-color-picker">
          <span>From</span>
          <input
            type="color"
            aria-label={`${definition.label} from color`}
            value={gradient.from}
            onChange={(event) => changeGradient({ from: event.target.value })}
          />
          <code>{gradient.from.toUpperCase()}</code>
        </label>
        <label className="wr-style-gradient-color-picker">
          <span>To</span>
          <input
            type="color"
            aria-label={`${definition.label} to color`}
            value={gradient.to}
            onChange={(event) => changeGradient({ to: event.target.value })}
          />
          <code>{gradient.to.toUpperCase()}</code>
        </label>
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
    <div className={`wr-style-property-row${configured ? ' configured' : ''}`}>
      <div className="wr-style-property-label">
        <input
          id={controlId}
          type="checkbox"
          aria-label={`Configure ${definition.label}`}
          checked={configured}
          onChange={(event) => (event.target.checked ? onEnable() : onClear())}
        />
        <label htmlFor={controlId}>
          <strong>{definition.label}</strong>
          {definition.description !== undefined && <small>{definition.description}</small>}
        </label>
      </div>
      {configured ? (
        <div className="wr-style-property-editor">
          <PropertyControl definition={definition} value={value} onChange={onChange} />
          <button type="button" onClick={onClear} aria-label={`Clear ${definition.label}`}>
            Clear
          </button>
        </div>
      ) : (
        <span className="wr-style-property-default">Component default</span>
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
}: VisualStyleEditorProps): ReactElement {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [openCategoryName, setOpenCategoryName] = useState<string | null | undefined>(undefined);
  const normalizedSearch = search.trim().toLowerCase();
  const applicableDefinitions = useMemo(
    () =>
      definitions.filter(
        (definition) =>
          (definition.componentTypes === undefined ||
            definition.componentTypes.includes(componentType)) &&
          (normalizedSearch.length === 0 ||
            definition.label.toLowerCase().includes(normalizedSearch) ||
            definition.category.toLowerCase().includes(normalizedSearch) ||
            definition.description?.toLowerCase().includes(normalizedSearch) === true),
      ),
    [componentType, definitions, normalizedSearch],
  );
  const categories = useMemo(
    () => groupDefinitions(applicableDefinitions, properties),
    [applicableDefinitions, properties],
  );
  const configuredCount = Object.keys(properties).length;

  const changeProperty = (
    name: ComponentStylePropertyName,
    value: StylePropertyValue | undefined,
  ): void => {
    const next: Partial<Record<ComponentStylePropertyName, StylePropertyValue>> = {
      ...properties,
    };
    if (value === undefined) delete next[name];
    else {
      next[name] = value;
      const exclusiveProperty = exclusivePropertyName(name);
      if (exclusiveProperty !== undefined) delete next[exclusiveProperty];
    }
    onChange(next);
  };

  return (
    <section className="wr-style-visual-editor" aria-label="Visual style properties">
      <header className="wr-style-visual-editor-heading">
        <div>
          <span>Visual properties</span>
          <h2>Customize this state</h2>
        </div>
        <span>{configuredCount} configured</span>
      </header>
      <div className="wr-style-property-toolbar">
        <label htmlFor={searchId}>Search properties</label>
        <div>
          <input
            id={searchId}
            type="search"
            value={search}
            placeholder="Color, spacing, animation…"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.length > 0 && (
            <button type="button" onClick={() => setSearch('')}>
              Clear search
            </button>
          )}
        </div>
      </div>

      <div className="wr-style-property-categories">
        {categories.map((category) => (
          <CollapsiblePropertyCategory
            category={category}
            key={`${stateName}-${category.name}-${normalizedSearch.length > 0 ? 'search' : 'all'}`}
            expanded={openCategoryName !== undefined && openCategoryName === category.name}
            onToggle={() =>
              setOpenCategoryName((current) => {
                if (current === undefined) return category.name;
                return current === category.name ? null : category.name;
              })
            }
          >
            {category.definitions.map((definition) => {
              const value = properties[definition.name];
              return (
                <PropertyRow
                  key={definition.name}
                  definition={definition}
                  configured={value !== undefined}
                  value={value ?? definition.defaultValue}
                  onEnable={() => changeProperty(definition.name, definition.defaultValue)}
                  onClear={() => changeProperty(definition.name, undefined)}
                  onChange={(nextValue) => changeProperty(definition.name, nextValue)}
                />
              );
            })}
          </CollapsiblePropertyCategory>
        ))}
        {categories.length === 0 && (
          <div className="wr-style-property-no-results">
            <strong>No matching properties</strong>
            <span>Try another name or category.</span>
          </div>
        )}
      </div>
    </section>
  );
}
