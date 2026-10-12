import {
  defaultComponentRegistry,
  type ComponentDefinition,
  type ComponentDesignerAction,
  type ComponentEventDefinition,
  type ComponentPropertyDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import type {
  ComponentNode,
  ComponentStyleModel,
  PageModel,
  ReusableElementModel,
} from '@webrad/project-model';
import {
  WEBRAD_ICON_NAMES,
  isWebRadIconName,
  type WebRadIconName,
  webRadIconLabel,
} from '@webrad/runtime/icons';
import { useContext, useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { resolvePaletteColor } from '@webrad/project-model';
import { ProjectColorPaletteContext } from '../project-color-palette';
import { Icon } from './Icon';
import { ColorInput, PaletteColorButton } from './ColorInput';
import { ComponentIcon } from './ComponentIcon';
import { IconPickerDialog } from './IconPickerDialog';
import { Panel } from './Panel';
import { responsiveLayoutPropertyReference } from '../layout-property';
import { buildInspectorSections, inspectorPropertyMatches } from './inspector-sections';

const MULTIPLE_VALUES = Symbol('multiple-values');
const MULTIPLE_VALUES_LABEL = '(multiple values)';
const MULTIPLE_OPTION_VALUE = '\u0000webrad-multiple-values';

type InspectorTab = 'properties' | 'events';

interface CategorizedItem {
  readonly category?: string;
}

interface InspectorCategory<T> {
  readonly name: string;
  readonly items: readonly T[];
}

export interface ObjectInspectorProps {
  selection: readonly ComponentNode[];
  page?: PageModel | null;
  /** Optional metadata override, primarily useful when inspecting a page root. */
  definition?: ComponentDefinition;
  availableComponents?: readonly ComponentNode[];
  availableReusableElements?: readonly ReusableElementModel[];
  onPropertyChange: (
    propertyName: string,
    value: unknown,
    definition: ComponentPropertyDefinition,
  ) => void;
  onEventChange: (
    eventName: string,
    handlerName: string | null,
    definition: ComponentEventDefinition,
  ) => void;
  onEventDoubleClick: (eventName: string, definition: ComponentEventDefinition) => void;
  /** Allows hosts that intentionally have no authored-code surface to hide events. */
  eventsEnabled?: boolean;
  /** Runs a Registry-declared design-time workflow for the selected component. */
  onDesignerAction?: (
    action: ComponentDesignerAction,
    component: ComponentNode,
    property: ComponentPropertyDefinition,
  ) => void;
  /** Keeps the application shell inert while an Inspector icon picker is open. */
  onIconPickerOpenChange?: (open: boolean) => void;
  /** Reusable styles from the open project. Only type-compatible styles are displayed. */
  styles?: readonly ComponentStyleModel[];
  onStyleChange?: (styleId: string | null) => void;
  registry?: ComponentRegistry;
}

function groupByCategory<T extends CategorizedItem>(
  items: readonly T[],
): readonly InspectorCategory<T>[] {
  const categories = new Map<string, T[]>();
  for (const item of items) {
    const categoryName = item.category?.trim() || 'General';
    const category = categories.get(categoryName) ?? [];
    category.push(item);
    categories.set(categoryName, category);
  }
  return [...categories].map(([name, categoryItems]) => ({ name, items: categoryItems }));
}

function sameOptions(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compatibleProperty(
  left: ComponentPropertyDefinition,
  right: ComponentPropertyDefinition,
): boolean {
  return (
    left.name === right.name &&
    left.type === right.type &&
    (left.source ?? 'props') === (right.source ?? 'props') &&
    sameOptions(left.options, right.options)
  );
}

function definitionsForSelection(
  selection: readonly ComponentNode[],
  explicitDefinition: ComponentDefinition | undefined,
  registry: ComponentRegistry,
): readonly ComponentDefinition[] | null {
  const definitions: ComponentDefinition[] = [];
  selection.forEach((component, index) => {
    const definition =
      index === 0 && explicitDefinition?.type === component.type
        ? explicitDefinition
        : registry.get(component.type);
    if (definition !== undefined) definitions.push(definition);
  });
  return definitions.length === selection.length ? definitions : null;
}

function commonProperties(
  definitions: readonly ComponentDefinition[],
  selection: readonly ComponentNode[],
): readonly ComponentPropertyDefinition[] {
  const first = definitions[0];
  if (first === undefined) return [];
  return first.properties
    .filter((property) =>
      definitions
        .slice(1)
        .every((definition) =>
          definition.properties.some((candidate) => compatibleProperty(property, candidate)),
        ),
    )
    .map((property) => ({
      ...property,
      readOnly: definitions.some((definition, index) => {
        const candidate = definition.properties.find((item) => compatibleProperty(property, item));
        const component = selection[index];
        return (
          candidate?.readOnly === true ||
          (component !== undefined && candidate?.readOnlyWhen?.(component.props) === true)
        );
      }),
    }));
}

function commonEvents(
  definitions: readonly ComponentDefinition[],
): readonly ComponentEventDefinition[] {
  const first = definitions[0];
  if (first === undefined) return [];
  return first.events.filter((event) =>
    definitions
      .slice(1)
      .every((definition) => definition.events.some((candidate) => candidate.name === event.name)),
  );
}

function resolveInspectedSelection(
  selection: readonly ComponentNode[],
  page: PageModel | null | undefined,
  definition: ComponentDefinition | undefined,
): readonly ComponentNode[] {
  if (selection.length > 0 || page === null || page === undefined || definition === undefined) {
    return selection;
  }

  const root = page.components.find((component) => component.id === page.rootComponentId);
  return root?.type === definition.type ? [root] : selection;
}

function reflectValue(target: object, propertyName: string): unknown {
  return Reflect.get(target, propertyName) as unknown;
}

function readPropertyValue(
  component: ComponentNode,
  property: ComponentPropertyDefinition,
  page: PageModel | null | undefined,
): unknown {
  let value: unknown;
  switch (property.source ?? 'props') {
    case 'node':
      value = reflectValue(component, property.name);
      break;
    case 'bounds':
      value = reflectValue(component.bounds, property.name);
      break;
    case 'layout-container':
    case 'layout-item': {
      const reference = responsiveLayoutPropertyReference(property);
      value =
        reference === undefined
          ? undefined
          : reflectValue(component.layout[reference.target], reference.field);
      break;
    }
    case 'page':
      value = page === null || page === undefined ? undefined : reflectValue(page, property.name);
      break;
    case 'props':
      value = component.props[property.name];
      break;
  }
  return value === undefined
    ? (property.defaultValueWhen?.(component.props) ?? property.defaultValue)
    : value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) && valuesEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

function sharedValue(values: readonly unknown[]): unknown | typeof MULTIPLE_VALUES {
  const first = values[0];
  return values.slice(1).every((value) => valuesEqual(first, value)) ? first : MULTIPLE_VALUES;
}

function editorText(value: unknown, multiple: boolean): string {
  if (multiple || value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function validPickerColor(value: string): string {
  return /^#[\da-f]{6}$/i.test(value) ? value : '#000000';
}

interface PropertyEditorProps {
  readonly id: string;
  readonly scopeId?: string;
  readonly property: ComponentPropertyDefinition;
  readonly value: unknown;
  readonly multiple: boolean;
  readonly availableComponents: readonly ComponentNode[];
  readonly availableReusableElements: readonly ReusableElementModel[];
  readonly onChange: (value: unknown) => void;
  readonly onDesignerAction?: (action: ComponentDesignerAction) => void;
  readonly onIconPickerOpenChange?: (open: boolean) => void;
}

interface IconPropertyEditorProps {
  readonly id: string;
  readonly property: ComponentPropertyDefinition;
  readonly value: unknown;
  readonly multiple: boolean;
  readonly disabled: boolean;
  readonly onChange: (value: unknown) => void;
  readonly onPickerOpenChange?: (open: boolean) => void;
}

function availableIconNames(property: ComponentPropertyDefinition): readonly WebRadIconName[] {
  const configured = (property.options ?? WEBRAD_ICON_NAMES).filter(isWebRadIconName);
  return configured.length > 0 ? configured : WEBRAD_ICON_NAMES;
}

function IconPropertyEditor({
  id,
  property,
  value,
  multiple,
  disabled,
  onChange,
  onPickerOpenChange,
}: IconPropertyEditorProps): ReactElement {
  const [open, setOpen] = useState(false);
  const icons = useMemo(() => availableIconNames(property), [property]);
  const iconName = !multiple && isWebRadIconName(value) ? value : undefined;
  const label = multiple
    ? MULTIPLE_VALUES_LABEL
    : iconName === undefined
      ? 'Choose icon'
      : webRadIconLabel(iconName);

  useEffect(
    () => () => {
      onPickerOpenChange?.(false);
    },
    [onPickerOpenChange],
  );

  const openPicker = (): void => {
    onPickerOpenChange?.(true);
    setOpen(true);
  };
  const closePicker = (): void => {
    onPickerOpenChange?.(false);
    setOpen(false);
  };

  return (
    <>
      <button
        id={id}
        type="button"
        className="wr-inspector-icon-picker"
        aria-label={property.label ?? property.name}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={openPicker}
      >
        <span className="wr-inspector-icon-picker-preview" aria-hidden="true">
          {iconName === undefined ? <span>—</span> : <Icon name={iconName} />}
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <IconPickerDialog
          icons={icons}
          selected={iconName}
          onClose={closePicker}
          onSelect={(icon) => {
            onChange(icon);
            closePicker();
          }}
        />
      )}
    </>
  );
}

function PropertyEditor({
  id,
  scopeId,
  property,
  value,
  multiple,
  availableComponents,
  availableReusableElements,
  onChange,
  onDesignerAction,
  onIconPickerOpenChange,
}: PropertyEditorProps): ReactElement {
  const colors = useContext(ProjectColorPaletteContext);
  const rawText = editorText(value, multiple);
  const text = property.type === 'color' ? resolvePaletteColor(rawText, colors) : rawText;
  const placeholder = multiple ? MULTIPLE_VALUES_LABEL : undefined;
  const disabled = property.readOnly === true;

  switch (property.type) {
    case 'video-source':
      return (
        <VideoPlayerSourceEditor
          key={`${scopeId ?? id}:${JSON.stringify(value)}`}
          id={id}
          value={value}
          disabled={disabled || multiple}
          onChange={onChange}
        />
      );
    case 'string':
      return (
        <input
          id={id}
          className="wr-inspector-input"
          type="text"
          value={text}
          placeholder={placeholder}
          readOnly={disabled}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'string-list':
      if (property.designerAction !== undefined) {
        const action = property.designerAction;
        return (
          <button
            id={id}
            type="button"
            className="wr-inspector-action"
            aria-label={`Edit ${property.label ?? property.name}…`}
            aria-haspopup="dialog"
            disabled={disabled || multiple}
            onClick={() => onDesignerAction?.(action)}
          >
            Edit {property.label ?? property.name}…
          </button>
        );
      }
      return (
        <textarea
          id={id}
          className="wr-inspector-input"
          value={multiple ? '' : Array.isArray(value) ? value.join('\n') : ''}
          placeholder={placeholder ?? 'One item per line'}
          readOnly={disabled}
          spellCheck={false}
          rows={4}
          onChange={(event) =>
            onChange(
              event.target.value
                .split('\n')
                .map((item) => item.trim())
                .filter((item) => item.length > 0),
            )
          }
        />
      );
    case 'number':
      return (
        <input
          id={id}
          className="wr-inspector-input wr-inspector-number"
          type="number"
          inputMode="decimal"
          step="any"
          value={text}
          placeholder={placeholder}
          readOnly={disabled}
          onChange={(event) => {
            if (event.target.value.trim().length === 0) {
              if (property.nullable === true) onChange(null);
              return;
            }
            const numberValue = Number(event.target.value);
            if (Number.isFinite(numberValue)) onChange(numberValue);
          }}
        />
      );
    case 'boolean':
      return (
        <label className={`wr-inspector-boolean${multiple ? ' mixed' : ''}`}>
          <input
            id={id}
            type="checkbox"
            checked={!multiple && value === true}
            disabled={disabled}
            aria-checked={multiple ? 'mixed' : value === true}
            ref={(input) => {
              if (input !== null) input.indeterminate = multiple;
            }}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{multiple ? MULTIPLE_VALUES_LABEL : value === true ? 'True' : 'False'}</span>
        </label>
      );
    case 'enum':
      return (
        <select
          id={id}
          className="wr-inspector-select"
          value={multiple ? MULTIPLE_OPTION_VALUE : text}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {multiple && (
            <option value={MULTIPLE_OPTION_VALUE} disabled>
              {MULTIPLE_VALUES_LABEL}
            </option>
          )}
          {property.options?.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
          {!multiple && property.validateValue?.(value) && !property.options?.includes(text) && (
            <option value={text}>{text}</option>
          )}
        </select>
      );
    case 'icon':
      return (
        <IconPropertyEditor
          id={id}
          property={property}
          value={value}
          multiple={multiple}
          disabled={disabled}
          onChange={onChange}
          onPickerOpenChange={onIconPickerOpenChange}
        />
      );
    case 'color':
      return (
        <div className="wr-inspector-color-control">
          <div className="wr-inspector-color-editor">
            <ColorInput
              className="wr-inspector-color-picker"
              value={validPickerColor(text)}
              disabled={disabled}
              label={`${property.label ?? property.name} color picker`}
              showPalette={false}
              onChange={onChange}
            />
            <input
              id={id}
              className="wr-inspector-input"
              type="text"
              value={text}
              placeholder={placeholder}
              readOnly={disabled}
              spellCheck={false}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
          <PaletteColorButton
            label={`${property.label ?? property.name} color picker`}
            value={rawText}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
      );
    case 'component': {
      const selectedValue = multiple ? MULTIPLE_OPTION_VALUE : text;
      const currentIsAvailable = availableComponents.some(
        (component) => component.id === selectedValue,
      );
      return (
        <select
          id={id}
          className="wr-inspector-select"
          value={selectedValue}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value.length === 0 ? null : event.target.value)
          }
        >
          {multiple && (
            <option value={MULTIPLE_OPTION_VALUE} disabled>
              {MULTIPLE_VALUES_LABEL}
            </option>
          )}
          <option value="">(none)</option>
          {!multiple && text.length > 0 && !currentIsAvailable && (
            <option value={text}>{text}</option>
          )}
          {availableComponents.map((component) => (
            <option value={component.id} key={component.id}>
              {component.name}
            </option>
          ))}
        </select>
      );
    }
    case 'reusable-element': {
      const selectedValue = multiple ? MULTIPLE_OPTION_VALUE : text;
      const currentIsAvailable = availableReusableElements.some(
        (reusableElement) => reusableElement.id === selectedValue,
      );
      return (
        <select
          id={id}
          className="wr-inspector-select"
          value={selectedValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {multiple && (
            <option value={MULTIPLE_OPTION_VALUE} disabled>
              {MULTIPLE_VALUES_LABEL}
            </option>
          )}
          {!multiple && text.length > 0 && !currentIsAvailable && (
            <option value={text}>{text}</option>
          )}
          {availableReusableElements.map((reusableElement) => (
            <option value={reusableElement.id} key={reusableElement.id}>
              {reusableElement.name}
            </option>
          ))}
        </select>
      );
    }
    case 'api-client-config': {
      const action = property.designerAction;
      return (
        <button
          id={id}
          type="button"
          className="wr-inspector-action"
          disabled={disabled || multiple || action === undefined}
          title={property.description}
          onClick={() => {
            if (action !== undefined) onDesignerAction?.(action);
          }}
        >
          Open API Client…
        </button>
      );
    }
    case 'combo-box-config':
    case 'data-grid-config': {
      const action = property.designerAction;
      const label =
        property.type === 'combo-box-config' ? 'Configure ComboBox' : 'Configure Data Grid';
      return (
        <button
          id={id}
          type="button"
          className="wr-inspector-action"
          aria-label={label}
          aria-haspopup="dialog"
          disabled={disabled || multiple || action === undefined}
          title={property.description}
          onClick={() => {
            if (action !== undefined) onDesignerAction?.(action);
          }}
        >
          {label}…
        </button>
      );
    }
  }
}

interface PropertyRowProps {
  readonly property: ComponentPropertyDefinition;
  readonly selection: readonly ComponentNode[];
  readonly page: PageModel | null | undefined;
  readonly availableComponents: readonly ComponentNode[];
  readonly availableReusableElements: readonly ReusableElementModel[];
  readonly onChange: ObjectInspectorProps['onPropertyChange'];
  readonly onDesignerAction?: ObjectInspectorProps['onDesignerAction'];
  readonly onIconPickerOpenChange?: (open: boolean) => void;
}

function PropertyRow({
  property,
  selection,
  page,
  availableComponents,
  availableReusableElements,
  onChange,
  onDesignerAction,
  onIconPickerOpenChange,
}: PropertyRowProps): ReactElement {
  const editorId = useId();
  const value = sharedValue(
    selection.map((component) => readPropertyValue(component, property, page)),
  );
  const multiple = value === MULTIPLE_VALUES;

  return (
    <div
      className={`wr-inspector-row${property.editorLayout === 'compact' ? ' wr-inspector-row-compact' : ''}`}
      title={property.description}
    >
      <label className="wr-inspector-name" htmlFor={editorId}>
        {property.label ?? property.name}
      </label>
      <div className="wr-inspector-value">
        <PropertyEditor
          id={editorId}
          scopeId={selection.map((component) => component.id).join(':')}
          property={property}
          value={multiple ? undefined : value}
          multiple={multiple}
          availableComponents={availableComponents}
          availableReusableElements={availableReusableElements}
          onChange={(nextValue) => {
            if (property.readOnly !== true) onChange(property.name, nextValue, property);
          }}
          onDesignerAction={(action) => {
            const component = selection.at(-1);
            if (component !== undefined) onDesignerAction?.(action, component, property);
          }}
          onIconPickerOpenChange={onIconPickerOpenChange}
        />
      </div>
    </div>
  );
}

interface EventRowProps {
  readonly eventDefinition: ComponentEventDefinition;
  readonly selection: readonly ComponentNode[];
  readonly onChange: ObjectInspectorProps['onEventChange'];
  readonly onDoubleClick: ObjectInspectorProps['onEventDoubleClick'];
}

function EventRow({
  eventDefinition,
  selection,
  onChange,
  onDoubleClick,
}: EventRowProps): ReactElement {
  const editorId = useId();
  const value = sharedValue(
    selection.map((component) => component.events[eventDefinition.name] ?? null),
  );
  const multiple = value === MULTIPLE_VALUES;
  const text = editorText(multiple ? undefined : value, multiple);

  return (
    <div
      className="wr-inspector-row wr-inspector-event-row"
      title={eventDefinition.description}
      onDoubleClick={() => onDoubleClick(eventDefinition.name, eventDefinition)}
    >
      <label className="wr-inspector-name" htmlFor={editorId}>
        {eventDefinition.label ?? eventDefinition.name}
      </label>
      <div className="wr-inspector-value">
        <input
          id={editorId}
          className="wr-inspector-input wr-inspector-event-input"
          type="text"
          value={text}
          placeholder={multiple ? MULTIPLE_VALUES_LABEL : 'Double-click to create'}
          spellCheck={false}
          onChange={(domEvent) =>
            onChange(
              eventDefinition.name,
              domEvent.target.value.length === 0 ? null : domEvent.target.value,
              eventDefinition,
            )
          }
        />
      </div>
    </div>
  );
}

export function ObjectInspector({
  selection,
  page,
  definition,
  availableComponents,
  availableReusableElements = [],
  onPropertyChange,
  onEventChange,
  onEventDoubleClick,
  eventsEnabled = true,
  onDesignerAction,
  onIconPickerOpenChange,
  styles = [],
  onStyleChange,
  registry = defaultComponentRegistry,
}: ObjectInspectorProps): ReactElement {
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(new Set());
  const tabId = useId();
  const inspectedSelection = useMemo(
    () => resolveInspectedSelection(selection, page, definition),
    [definition, page, selection],
  );
  const definitions = useMemo(
    () => definitionsForSelection(inspectedSelection, definition, registry),
    [definition, inspectedSelection, registry],
  );
  const propertyCategories = useMemo(
    () =>
      buildInspectorSections(
        definitions === null ? [] : commonProperties(definitions, inspectedSelection),
        searchQuery,
      ),
    [definitions, inspectedSelection, searchQuery],
  );
  const eventCategories = useMemo(
    () => groupByCategory(definitions === null ? [] : commonEvents(definitions)),
    [definitions],
  );
  const componentChoices = availableComponents ?? page?.components ?? inspectedSelection;
  const primaryComponent = inspectedSelection.at(-1);
  const primaryDefinition =
    primaryComponent === undefined
      ? definition
      : definition?.type === primaryComponent.type
        ? definition
        : registry.get(primaryComponent.type);
  const styleComponentType =
    definitions !== null &&
    definitions.length > 0 &&
    definitions.every((candidate) => candidate.visual && candidate.type === definitions[0]?.type)
      ? definitions[0]?.type
      : undefined;
  const compatibleStyles = useMemo(
    () =>
      styleComponentType === undefined
        ? []
        : styles.filter((style) => style.componentType === styleComponentType),
    [styleComponentType, styles],
  );
  const selectedStyleValue = sharedValue(
    inspectedSelection.map((component) => component.styleId ?? null),
  );
  const selectedStyleIsMultiple = selectedStyleValue === MULTIPLE_VALUES;
  const selectedStyleId =
    !selectedStyleIsMultiple &&
    typeof selectedStyleValue === 'string' &&
    compatibleStyles.some((style) => style.id === selectedStyleValue)
      ? selectedStyleValue
      : '';
  const propertiesTabId = `${tabId}-properties-tab`;
  const eventsTabId = `${tabId}-events-tab`;
  const propertiesPanelId = `${tabId}-properties-panel`;
  const eventsPanelId = `${tabId}-events-panel`;
  const activeInspectorTab: InspectorTab = eventsEnabled ? activeTab : 'properties';
  const showStyle =
    styleComponentType !== undefined &&
    onStyleChange !== undefined &&
    inspectorPropertyMatches(
      { name: 'style', label: 'Style', category: 'Appearance', type: 'enum' },
      searchQuery,
    );

  return (
    <Panel title="Object Inspector" className="wr-object-inspector">
      {primaryComponent === undefined ? (
        <div className="wr-inspector-empty">Select a component to inspect its properties.</div>
      ) : (
        <div className="wr-inspector-layout">
          <div className="wr-inspector-selection" title={primaryComponent.id}>
            <span className="wr-inspector-selection-icon" data-icon={primaryDefinition?.icon}>
              <ComponentIcon icon={primaryDefinition?.icon ?? 'component'} />
            </span>
            <div className="wr-inspector-selection-info">
              {inspectedSelection.length === 1 ? (
                <>
                  <strong>{primaryComponent.name}</strong>
                  <span>{primaryDefinition?.displayName ?? primaryComponent.type}</span>
                </>
              ) : (
                <>
                  <strong>{inspectedSelection.length} components</strong>
                  <span>Multiple selection</span>
                </>
              )}
            </div>
          </div>

          <div className="wr-inspector-tabs" role="tablist" aria-label="Inspector view">
            <button
              id={propertiesTabId}
              aria-label="Properties"
              type="button"
              role="tab"
              aria-selected={activeInspectorTab === 'properties'}
              aria-controls={propertiesPanelId}
              className={activeInspectorTab === 'properties' ? 'active' : ''}
              onClick={() => setActiveTab('properties')}
            >
              Visual
            </button>
            {eventsEnabled && (
              <button
                id={eventsTabId}
                aria-label="Events"
                type="button"
                role="tab"
                aria-selected={activeInspectorTab === 'events'}
                aria-controls={eventsPanelId}
                className={activeInspectorTab === 'events' ? 'active' : ''}
                onClick={() => setActiveTab('events')}
              >
                Interaction
              </button>
            )}
          </div>

          {activeInspectorTab === 'properties' ? (
            <div
              id={propertiesPanelId}
              className="wr-inspector-grid"
              role="tabpanel"
              aria-labelledby={propertiesTabId}
            >
              <div className="wr-inspector-search">
                <Icon name="search" />
                <input
                  type="search"
                  aria-label="Search properties"
                  placeholder="Search properties..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setSearchQuery('');
                    }
                  }}
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    aria-label="Clear property search"
                    onClick={() => setSearchQuery('')}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              {showStyle && (
                <details className="wr-inspector-category" open>
                  <summary className="wr-inspector-category-title">Style</summary>
                  <div className="wr-inspector-category-fields">
                    <div
                      className="wr-inspector-row"
                      title={`Reusable styles compatible with ${primaryDefinition?.displayName ?? styleComponentType}`}
                    >
                      <label className="wr-inspector-name" htmlFor={`${propertiesPanelId}-style`}>
                        Style
                      </label>
                      <div className="wr-inspector-value">
                        <select
                          id={`${propertiesPanelId}-style`}
                          className="wr-inspector-select"
                          value={selectedStyleIsMultiple ? MULTIPLE_OPTION_VALUE : selectedStyleId}
                          onChange={(event) =>
                            onStyleChange?.(
                              event.target.value.length === 0 ? null : event.target.value,
                            )
                          }
                        >
                          {selectedStyleIsMultiple && (
                            <option value={MULTIPLE_OPTION_VALUE} disabled>
                              {MULTIPLE_VALUES_LABEL}
                            </option>
                          )}
                          <option value="">None</option>
                          {compatibleStyles.map((style) => (
                            <option value={style.id} key={style.id}>
                              {style.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </details>
              )}
              {propertyCategories.length === 0 && !showStyle ? (
                <div className="wr-inspector-empty compact" role="status">
                  {searchQuery.trim().length > 0
                    ? 'No properties match your search.'
                    : 'No shared property metadata.'}
                </div>
              ) : (
                propertyCategories.map((category) => (
                  <details
                    className="wr-inspector-category"
                    key={`${category.name}:${searchQuery.trim().length > 0 ? 'filtered' : 'all'}`}
                    open={searchQuery.trim().length > 0 || !collapsedSections.has(category.name)}
                    onToggle={(event) => {
                      if (searchQuery.trim().length > 0) return;
                      const open = event.currentTarget.open;
                      setCollapsedSections((previous) => {
                        if (previous.has(category.name) === !open) return previous;
                        const next = new Set(previous);
                        if (open) next.delete(category.name);
                        else next.add(category.name);
                        return next;
                      });
                    }}
                  >
                    <summary className="wr-inspector-category-title">{category.name}</summary>
                    <div className="wr-inspector-category-groups">
                      {category.groups.map((group) => (
                        <div className="wr-inspector-property-group" key={group.name}>
                          {group.name.length > 0 && (
                            <div className="wr-inspector-group-title">{group.name}</div>
                          )}
                          <div className="wr-inspector-category-fields">
                            {group.items.map((property) => (
                              <PropertyRow
                                key={`${property.source ?? 'props'}:${property.name}`}
                                property={property}
                                selection={inspectedSelection}
                                page={page}
                                availableComponents={componentChoices}
                                availableReusableElements={availableReusableElements}
                                onChange={onPropertyChange}
                                onDesignerAction={onDesignerAction}
                                onIconPickerOpenChange={onIconPickerOpenChange}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          ) : (
            <div
              id={eventsPanelId}
              className="wr-inspector-grid"
              role="tabpanel"
              aria-labelledby={eventsTabId}
            >
              {eventCategories.length === 0 ? (
                <div className="wr-inspector-empty compact">No shared event metadata.</div>
              ) : (
                eventCategories.map((category) => (
                  <details className="wr-inspector-category" key={category.name} open>
                    <summary className="wr-inspector-category-title">{category.name}</summary>
                    <div className="wr-inspector-category-fields">
                      {category.items.map((eventDefinition) => (
                        <EventRow
                          key={eventDefinition.name}
                          eventDefinition={eventDefinition}
                          selection={inspectedSelection}
                          onChange={onEventChange}
                          onDoubleClick={onEventDoubleClick}
                        />
                      ))}
                    </div>
                  </details>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
import { VideoPlayerSourceEditor } from './VideoPlayerSourceEditor';
