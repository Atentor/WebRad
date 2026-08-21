import type { ComponentNode } from '@webrad/project-model';
import {
  projectComponentVisual,
  readBooleanProperty,
  readIntegerProperty,
  readStringListProperty,
  readStringProperty,
} from '@webrad/runtime/visual';
import type { CSSProperties, ReactElement } from 'react';

export type ComponentEventName =
  'OnClick' | 'OnChange' | 'OnInput' | 'OnFocus' | 'OnBlur' | 'OnMouseEnter' | 'OnMouseLeave';

export interface ComponentViewProps {
  node: ComponentNode;
  designTime?: boolean;
  onEvent?: (eventName: ComponentEventName, node: ComponentNode) => void;
}

type ComponentRenderer = (props: ComponentViewProps) => ReactElement;

function sharedAttributes(
  node: ComponentNode,
  designTime = false,
): {
  className: string;
  style: CSSProperties;
  hidden: boolean;
  'aria-disabled': boolean;
  'data-component-id': string;
  'data-component-type': string;
  title?: string;
  tabIndex?: number;
} {
  const visual = projectComponentVisual(node, 'fill');
  return {
    className: visual.classNames.join(' '),
    style: visual.style,
    hidden: !visual.visible,
    'aria-disabled': !visual.enabled,
    'data-component-id': node.id,
    'data-component-type': node.type,
    ...(visual.title === undefined ? {} : { title: visual.title }),
    ...(designTime
      ? { tabIndex: -1 }
      : visual.tabIndex === undefined
        ? {}
        : { tabIndex: visual.tabIndex }),
  };
}

const renderers: Readonly<Record<string, ComponentRenderer>> = Object.freeze({
  WebPage: ({ node, designTime }) => (
    <section
      {...sharedAttributes(node, designTime)}
      aria-label={readStringProperty(node, 'caption', node.name)}
    />
  ),
  WebPanel: ({ node, designTime }) => (
    <section
      {...sharedAttributes(node, designTime)}
      aria-label={readStringProperty(node, 'caption', node.name)}
    />
  ),
  WebLabel: ({ node, designTime }) => (
    <span {...sharedAttributes(node, designTime)}>
      {readStringProperty(node, 'caption', 'Label')}
    </span>
  ),
  WebEdit: ({ node, designTime, onEvent }) => (
    <input
      {...sharedAttributes(node, designTime)}
      aria-label={readStringProperty(node, 'placeholder', node.name)}
      value={readStringProperty(node, 'value')}
      disabled={!readBooleanProperty(node, 'enabled', true)}
      placeholder={readStringProperty(node, 'placeholder')}
      readOnly={readBooleanProperty(node, 'readOnly')}
      type={readStringProperty(node, 'inputType', 'text')}
      onChange={() => onEvent?.('OnChange', node)}
      onFocus={() => onEvent?.('OnFocus', node)}
      onBlur={() => onEvent?.('OnBlur', node)}
    />
  ),
  WebTextArea: ({ node, designTime, onEvent }) => (
    <textarea
      {...sharedAttributes(node, designTime)}
      aria-label={readStringProperty(node, 'placeholder', node.name)}
      value={readStringProperty(node, 'value')}
      disabled={!readBooleanProperty(node, 'enabled', true)}
      placeholder={readStringProperty(node, 'placeholder')}
      readOnly={readBooleanProperty(node, 'readOnly')}
      rows={Math.max(1, readIntegerProperty(node, 'rows', 4))}
      onChange={() => onEvent?.('OnChange', node)}
    />
  ),
  WebButton: ({ node, designTime, onEvent }) => (
    <button
      {...sharedAttributes(node, designTime)}
      type="button"
      disabled={!readBooleanProperty(node, 'enabled', true)}
      onClick={() => onEvent?.('OnClick', node)}
    >
      {readStringProperty(node, 'caption', 'Button')}
    </button>
  ),
  WebCheckBox: ({ node, designTime, onEvent }) => (
    <label {...sharedAttributes(node, designTime)}>
      <input
        type="checkbox"
        checked={readBooleanProperty(node, 'checked')}
        disabled={!readBooleanProperty(node, 'enabled', true)}
        tabIndex={designTime ? -1 : undefined}
        onChange={() => onEvent?.('OnChange', node)}
      />
      <span>{readStringProperty(node, 'caption', 'CheckBox')}</span>
    </label>
  ),
  WebComboBox: ({ node, designTime, onEvent }) => {
    const items = readStringListProperty(node, 'items');
    const selectedIndex = readIntegerProperty(node, 'selectedIndex', -1);
    return (
      <select
        {...sharedAttributes(node, designTime)}
        aria-label={node.name}
        value={items[selectedIndex] ?? readStringProperty(node, 'value')}
        disabled={!readBooleanProperty(node, 'enabled', true)}
        onChange={() => onEvent?.('OnChange', node)}
      >
        {items.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    );
  },
  WebImage: ({ node, designTime }) => {
    const source = readStringProperty(node, 'src');
    const attributes = sharedAttributes(node, designTime);
    return source ? (
      <img
        {...attributes}
        alt={readStringProperty(node, 'alt', node.name)}
        draggable={false}
        src={source}
        style={{
          ...attributes.style,
          objectFit: readStringProperty(node, 'objectFit', 'contain') as CSSProperties['objectFit'],
        }}
      />
    ) : (
      <div {...attributes} role="img" aria-label={`${node.name}: no image`}>
        Image
      </div>
    );
  },
  WebListBox: ({ node, designTime, onEvent }) => {
    const items = readStringListProperty(node, 'items');
    const selectedIndex = readIntegerProperty(node, 'selectedIndex', -1);
    const multiple = readBooleanProperty(node, 'multiple');
    const selectedValue = items[selectedIndex] ?? readStringProperty(node, 'value');
    return (
      <select
        {...sharedAttributes(node, designTime)}
        aria-label={node.name}
        value={multiple ? (selectedValue.length > 0 ? [selectedValue] : []) : selectedValue}
        multiple={multiple}
        size={4}
        disabled={!readBooleanProperty(node, 'enabled', true)}
        onChange={() => onEvent?.('OnChange', node)}
      >
        {items.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    );
  },
});

export function ComponentView(props: ComponentViewProps): ReactElement {
  const renderer = renderers[props.node.type];
  if (!renderer) {
    return (
      <div {...sharedAttributes(props.node, props.designTime)} role="alert">
        Unknown component: {props.node.type}
      </div>
    );
  }
  return renderer(props);
}

// Utility export is intentionally colocated with the renderer registry.
// eslint-disable-next-line react-refresh/only-export-components
export function hasComponentRenderer(type: string): boolean {
  return Object.hasOwn(renderers, type);
}
