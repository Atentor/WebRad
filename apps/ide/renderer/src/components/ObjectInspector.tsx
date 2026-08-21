import {
  defaultComponentRegistry,
  type ComponentDefinition,
  type ComponentEventDefinition,
  type ComponentPropertyDefinition,
  type ComponentRegistry,
} from '@webrad/component-registry';
import type { ComponentNode, PageModel } from '@webrad/project-model';
import { useId, useMemo, useState, type ReactElement } from 'react';
import { Panel } from './Panel';

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
): readonly ComponentPropertyDefinition[] {
  const first = definitions[0];
  if (first === undefined) return [];
  return first.properties.filter((property) =>
    definitions
      .slice(1)
      .every((definition) =>
        definition.properties.some((candidate) => compatibleProperty(property, candidate)),
      ),
  );
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
    case 'page':
      value = page === null || page === undefined ? undefined : reflectValue(page, property.name);
      break;
    case 'props':
      value = component.props[property.name];
      break;
  }
  return value === undefined ? property.defaultValue : value;
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
  readonly property: ComponentPropertyDefinition;
  readonly value: unknown;
  readonly multiple: boolean;
  readonly availableComponents: readonly ComponentNode[];
  readonly onChange: (value: unknown) => void;
}

function PropertyEditor({
  id,
  property,
  value,
  multiple,
  availableComponents,
  onChange,
}: PropertyEditorProps): ReactElement {
  const text = editorText(value, multiple);
  const placeholder = multiple ? MULTIPLE_VALUES_LABEL : undefined;
  const disabled = property.readOnly === true;

  switch (property.type) {
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
            if (event.target.value.trim().length === 0) return;
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
        </select>
      );
    case 'color':
      return (
        <div className="wr-inspector-color-editor">
          <input
            className="wr-inspector-color-picker"
            type="color"
            value={validPickerColor(text)}
            disabled={disabled}
            aria-label={`${property.label ?? property.name} color picker`}
            onChange={(event) => onChange(event.target.value)}
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
  }
}

interface PropertyRowProps {
  readonly property: ComponentPropertyDefinition;
  readonly selection: readonly ComponentNode[];
  readonly page: PageModel | null | undefined;
  readonly availableComponents: readonly ComponentNode[];
  readonly onChange: ObjectInspectorProps['onPropertyChange'];
}

function PropertyRow({
  property,
  selection,
  page,
  availableComponents,
  onChange,
}: PropertyRowProps): ReactElement {
  const editorId = useId();
  const value = sharedValue(
    selection.map((component) => readPropertyValue(component, property, page)),
  );
  const multiple = value === MULTIPLE_VALUES;

  return (
    <div className="wr-inspector-row" title={property.description}>
      <label className="wr-inspector-name" htmlFor={editorId}>
        {property.label ?? property.name}
      </label>
      <div className="wr-inspector-value">
        <PropertyEditor
          id={editorId}
          property={property}
          value={multiple ? undefined : value}
          multiple={multiple}
          availableComponents={availableComponents}
          onChange={(nextValue) => onChange(property.name, nextValue, property)}
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
    <div className="wr-inspector-row wr-inspector-event-row" title={eventDefinition.description}>
      <label className="wr-inspector-name" htmlFor={editorId}>
        {eventDefinition.label ?? eventDefinition.name}
      </label>
      <div
        className="wr-inspector-value"
        onDoubleClick={() => onDoubleClick(eventDefinition.name, eventDefinition)}
      >
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
  onPropertyChange,
  onEventChange,
  onEventDoubleClick,
  registry = defaultComponentRegistry,
}: ObjectInspectorProps): ReactElement {
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties');
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
    () => groupByCategory(definitions === null ? [] : commonProperties(definitions)),
    [definitions],
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
  const propertiesTabId = `${tabId}-properties-tab`;
  const eventsTabId = `${tabId}-events-tab`;
  const propertiesPanelId = `${tabId}-properties-panel`;
  const eventsPanelId = `${tabId}-events-panel`;

  return (
    <Panel title="Object Inspector" className="wr-object-inspector">
      {primaryComponent === undefined ? (
        <div className="wr-inspector-empty">Select a component to inspect its properties.</div>
      ) : (
        <div className="wr-inspector-layout">
          <div className="wr-inspector-selection" title={primaryComponent.id}>
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

          <div className="wr-inspector-tabs" role="tablist" aria-label="Inspector view">
            <button
              id={propertiesTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === 'properties'}
              aria-controls={propertiesPanelId}
              className={activeTab === 'properties' ? 'active' : ''}
              onClick={() => setActiveTab('properties')}
            >
              Properties
            </button>
            <button
              id={eventsTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === 'events'}
              aria-controls={eventsPanelId}
              className={activeTab === 'events' ? 'active' : ''}
              onClick={() => setActiveTab('events')}
            >
              Events
            </button>
          </div>

          {activeTab === 'properties' ? (
            <div
              id={propertiesPanelId}
              className="wr-inspector-grid"
              role="tabpanel"
              aria-labelledby={propertiesTabId}
            >
              {propertyCategories.length === 0 ? (
                <div className="wr-inspector-empty compact">No shared property metadata.</div>
              ) : (
                propertyCategories.map((category) => (
                  <section className="wr-inspector-category" key={category.name}>
                    <h3>{category.name}</h3>
                    {category.items.map((property) => (
                      <PropertyRow
                        key={`${property.source ?? 'props'}:${property.name}`}
                        property={property}
                        selection={inspectedSelection}
                        page={page}
                        availableComponents={componentChoices}
                        onChange={onPropertyChange}
                      />
                    ))}
                  </section>
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
                  <section className="wr-inspector-category" key={category.name}>
                    <h3>{category.name}</h3>
                    {category.items.map((eventDefinition) => (
                      <EventRow
                        key={eventDefinition.name}
                        eventDefinition={eventDefinition}
                        selection={inspectedSelection}
                        onChange={onEventChange}
                        onDoubleClick={onEventDoubleClick}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
