import type { ComponentNode } from '@webrad/project-model';
import { normalizeDataGridConfiguration } from '@webrad/project-model';
import {
  projectComponentVisual,
  readBooleanProperty,
  readIntegerProperty,
  readStringListProperty,
  readStringProperty,
  tokenizeTailwindClasses,
} from '@webrad/runtime/visual';
import { getWebRadIconShapes, isWebRadIconName, type WebRadIconShape } from '@webrad/runtime/icons';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

export type ComponentEventName =
  'OnClick' | 'OnChange' | 'OnInput' | 'OnFocus' | 'OnBlur' | 'OnMouseEnter' | 'OnMouseLeave';

export interface ComponentViewProps {
  node: ComponentNode;
  designTime?: boolean;
  /** Tailwind classes resolved from the node's selected project style. */
  styleClassName?: string;
  /** Visual descendants for container components such as WebPage and WebPanel. */
  children?: ReactNode;
  onEvent?: (eventName: ComponentEventName, node: ComponentNode) => void;
}

type ComponentRenderer = (props: ComponentViewProps) => ReactElement;

function sharedAttributes(
  node: ComponentNode,
  designTime = false,
  styleClassName?: string,
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
    className: [...visual.classNames, ...tokenizeTailwindClasses(styleClassName ?? '')].join(' '),
    style:
      styleClassName === undefined
        ? visual.style
        : { width: visual.style.width, height: visual.style.height },
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

function renderWebRadIconShape(shape: WebRadIconShape, index: number): ReactElement {
  if (shape.kind === 'path') {
    return (
      <path
        d={shape.d}
        fill={shape.fill}
        key={`${shape.kind}-${String(index)}`}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
      />
    );
  }
  return (
    <circle
      cx={shape.cx}
      cy={shape.cy}
      fill={shape.fill}
      key={`${shape.kind}-${String(index)}`}
      r={shape.r}
      stroke={shape.stroke}
      strokeWidth={shape.strokeWidth}
    />
  );
}

function ButtonIcon({ name }: { readonly name: string }): ReactElement {
  const iconName = isWebRadIconName(name) ? name : 'add';
  return (
    <svg
      aria-hidden="true"
      className="wr-button-icon"
      data-webrad-button-icon=""
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {getWebRadIconShapes(iconName).map((shape, index) => renderWebRadIconShape(shape, index))}
    </svg>
  );
}

const renderers: Readonly<Record<string, ComponentRenderer>> = Object.freeze({
  WebPage: ({ node, designTime, styleClassName, children }) => (
    <section
      {...sharedAttributes(node, designTime, styleClassName)}
      aria-label={readStringProperty(node, 'caption', node.name)}
    >
      {children}
    </section>
  ),
  WebPanel: ({ node, designTime, styleClassName, children }) => (
    <section
      {...sharedAttributes(node, designTime, styleClassName)}
      aria-label={readStringProperty(node, 'caption', node.name)}
    >
      {children}
    </section>
  ),
  WebLabel: ({ node, designTime, styleClassName }) => (
    <span {...sharedAttributes(node, designTime, styleClassName)}>
      <span data-webrad-text-content="">{readStringProperty(node, 'caption', 'Label')}</span>
    </span>
  ),
  WebEdit: ({ node, designTime, styleClassName, onEvent }) => (
    <input
      {...sharedAttributes(node, designTime, styleClassName)}
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
  WebTextArea: ({ node, designTime, styleClassName, onEvent }) => (
    <textarea
      {...sharedAttributes(node, designTime, styleClassName)}
      aria-label={readStringProperty(node, 'placeholder', node.name)}
      value={readStringProperty(node, 'value')}
      disabled={!readBooleanProperty(node, 'enabled', true)}
      placeholder={readStringProperty(node, 'placeholder')}
      readOnly={readBooleanProperty(node, 'readOnly')}
      rows={Math.max(1, readIntegerProperty(node, 'rows', 4))}
      onChange={() => onEvent?.('OnChange', node)}
    />
  ),
  WebButton: ({ node, designTime, styleClassName, onEvent }) => {
    const caption = readStringProperty(node, 'caption', 'Button');
    return (
      <button
        {...sharedAttributes(node, designTime, styleClassName)}
        aria-label={caption}
        type="button"
        disabled={!readBooleanProperty(node, 'enabled', true)}
        onClick={() => onEvent?.('OnClick', node)}
      >
        <ButtonIcon name={readStringProperty(node, 'icon', 'add')} />
        <span className="wr-button-text" data-webrad-text-content="">
          {caption}
        </span>
      </button>
    );
  },
  WebCheckBox: ({ node, designTime, styleClassName, onEvent }) => (
    <label {...sharedAttributes(node, designTime, styleClassName)}>
      <input
        type="checkbox"
        checked={readBooleanProperty(node, 'checked')}
        disabled={!readBooleanProperty(node, 'enabled', true)}
        tabIndex={designTime ? -1 : undefined}
        onChange={() => onEvent?.('OnChange', node)}
      />
      <span data-webrad-checkbox-caption="" data-webrad-text-content="">
        {readStringProperty(node, 'caption', 'CheckBox')}
      </span>
    </label>
  ),
  WebComboBox: ({ node, designTime, styleClassName, onEvent }) => {
    const items = readStringListProperty(node, 'items');
    const selectedIndex = readIntegerProperty(node, 'selectedIndex', -1);
    return (
      <select
        {...sharedAttributes(node, designTime, styleClassName)}
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
  WebImage: ({ node, designTime, styleClassName }) => {
    const source = readStringProperty(node, 'src');
    const attributes = sharedAttributes(node, designTime, styleClassName);
    return source ? (
      <img
        {...attributes}
        alt={readStringProperty(node, 'alt', node.name)}
        draggable={false}
        src={source}
        style={{
          ...attributes.style,
          ...(styleClassName === undefined
            ? {
                objectFit: readStringProperty(
                  node,
                  'objectFit',
                  'contain',
                ) as CSSProperties['objectFit'],
              }
            : {}),
        }}
      />
    ) : (
      <div {...attributes} role="img" aria-label={`${node.name}: no image`}>
        Image
      </div>
    );
  },
  WebListBox: ({ node, designTime, styleClassName, onEvent }) => {
    const items = readStringListProperty(node, 'items');
    const selectedIndex = readIntegerProperty(node, 'selectedIndex', -1);
    const multiple = readBooleanProperty(node, 'multiple');
    const selectedValue = items[selectedIndex] ?? readStringProperty(node, 'value');
    return (
      <select
        {...sharedAttributes(node, designTime, styleClassName)}
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
  WebDataGrid: ({ node, designTime, styleClassName }) => {
    const configuration = normalizeDataGridConfiguration(node.props.dataGridConfig);
    return (
      <div
        {...sharedAttributes(node, designTime, styleClassName)}
        role="table"
        aria-label={node.name}
      >
        <div className="wr-data-grid-scroll">
          <table className="wr-data-grid-table">
            {configuration.showHeader && (
              <thead
                className={configuration.stickyHeader ? 'wr-data-grid-sticky-header' : undefined}
              >
                <tr>
                  {configuration.columns.map((column) => (
                    <th key={column.id} scope="col">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {[0, 1, 2].map((rowIndex) => (
                <tr key={rowIndex}>
                  {configuration.columns.map((column) => (
                    <td key={column.id}>
                      {column.cellKind === 'image' ? (
                        <span aria-label={column.header} role="img">
                          Image
                        </span>
                      ) : column.cellKind === 'button' ? (
                        <button type="button">{column.header || 'Button'}</button>
                      ) : column.cellKind === 'checkbox' ? (
                        <input
                          aria-label={column.header}
                          checked={rowIndex % 2 === 0}
                          readOnly
                          type="checkbox"
                        />
                      ) : (
                        column.fieldPath || 'Value'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {configuration.showFooter && (
              <tfoot
                className={configuration.stickyFooter ? 'wr-data-grid-sticky-footer' : undefined}
              >
                <tr>
                  {configuration.columns.map((column) => (
                    <td key={column.id}>{column.footer}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  },
});

export function ComponentView(props: ComponentViewProps): ReactElement {
  const renderer = renderers[props.node.type];
  if (!renderer) {
    return (
      <div {...sharedAttributes(props.node, props.designTime, props.styleClassName)} role="alert">
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
