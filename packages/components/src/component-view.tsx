import {
  normalizeDataGridConfiguration,
  type ComponentNode,
  type DataGridColumn,
  type DataGridConfiguration,
} from '@webrad/project-model';
import {
  projectComponentVisual,
  readBooleanProperty,
  readIntegerProperty,
  readStringListProperty,
  readStringProperty,
  resolveDataGridColumnTrackWidths,
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
  'aria-hidden': boolean;
  'aria-disabled': boolean;
  'data-component-id': string;
  'data-component-type': string;
  title?: string;
  tabIndex?: number;
} {
  const visual = projectComponentVisual(node, 'fill');
  const style =
    styleClassName === undefined
      ? visual.style
      : { width: visual.style.width, height: visual.style.height };
  return {
    className: [...visual.classNames, ...tokenizeTailwindClasses(styleClassName ?? '')].join(' '),
    style:
      !visual.visible && !visual.collapseWhenHidden ? { ...style, visibility: 'hidden' } : style,
    hidden: !visual.visible && visual.collapseWhenHidden,
    'aria-hidden': !visual.visible,
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

function ButtonIcon({
  name,
  className = '',
}: {
  readonly name: string;
  readonly className?: string;
}): ReactElement {
  const iconName = isWebRadIconName(name) ? name : 'add';
  return (
    <svg
      aria-hidden="true"
      className={`wr-button-icon${className.length > 0 ? ` ${className}` : ''}`}
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

function DataGridButtonPreview({ column }: { readonly column: DataGridColumn }): ReactElement {
  const caption =
    column.fixedCaption.length > 0
      ? column.fixedCaption
      : column.fieldPath.length > 0
        ? column.header || 'Value'
        : '';
  return (
    <button
      aria-label={caption.length > 0 ? undefined : column.header || 'Button'}
      className="wr-data-grid-button"
      type="button"
    >
      {column.buttonIcon !== null && (
        <span aria-hidden="true" className="wr-data-grid-button-icon-slot">
          <ButtonIcon className="wr-data-grid-button-icon" name={column.buttonIcon} />
        </span>
      )}
      {caption.length > 0 && <span className="wr-data-grid-button-caption">{caption}</span>}
    </button>
  );
}

function dataGridLayoutStyle(
  configuration: DataGridConfiguration,
  availableWidth: number,
): CSSProperties {
  const minWidth = configuration.columns.reduce(
    (total, column) => total + (column.widthMode === 'fixed' ? column.width : column.minWidth),
    0,
  );
  return {
    '--wr-data-grid-columns': resolveDataGridColumnTrackWidths(
      configuration.columns,
      Math.max(availableWidth, minWidth),
    )
      .map((width) => `${String(width)}px`)
      .join(' '),
    '--wr-data-grid-min-width': `${String(minWidth)}px`,
    '--wr-data-grid-fixed-row-height': `${String(configuration.fixedRowHeight)}px`,
    '--wr-data-grid-min-row-height': `${String(configuration.minRowHeight)}px`,
    '--wr-data-grid-max-row-height':
      configuration.maxRowHeight === null ? 'none' : `${String(configuration.maxRowHeight)}px`,
    '--wr-data-grid-cell-padding-x': `${String(configuration.cellPaddingHorizontal)}px`,
    '--wr-data-grid-cell-padding-y': `${String(configuration.cellPaddingVertical)}px`,
    '--wr-data-grid-config-horizontal-line-width': configuration.showHorizontalLines
      ? '1px'
      : '0px',
    '--wr-data-grid-config-vertical-line-width': configuration.showVerticalLines ? '1px' : '0px',
  } as CSSProperties;
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
  // A popup is authored from the nonvisual tray, but it is still a visual
  // runtime component. The Styles workspace needs a stable, accessible
  // surface instead of an active browser dialog, so styles can be previewed
  // without entering the modal top layer.
  WebPopup: ({ node, designTime, styleClassName }) => {
    const caption = readStringProperty(node, 'caption', 'Popup');
    const message = readStringProperty(node, 'message');
    const captionId = `webrad-popup-caption-${node.id}`;
    const messageId = `webrad-popup-message-${node.id}`;
    return (
      <section
        {...sharedAttributes(node, designTime, styleClassName)}
        aria-describedby={message.length > 0 ? messageId : undefined}
        aria-labelledby={captionId}
        role="dialog"
      >
        <div className="wr-popup-content" data-webrad-popup-content="">
          <h2 className="wr-popup-caption" data-webrad-popup-caption="" id={captionId}>
            {caption}
          </h2>
          <p className="wr-popup-message" data-webrad-popup-message="" id={messageId}>
            {message}
          </p>
        </div>
      </section>
    );
  },
  WebReusableElement: ({ node, designTime, styleClassName, children }) => (
    <section
      {...sharedAttributes(node, designTime, styleClassName)}
      aria-label={readStringProperty(node, 'caption', node.name)}
      data-webrad-reusable-instance="true"
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
    const contentClassName = [
      'wr-data-grid-content',
      configuration.stripedRows ? 'wr-data-grid-striped' : '',
      configuration.showHorizontalLines
        ? 'wr-data-grid-horizontal-lines'
        : 'wr-data-grid-no-horizontal-lines',
      configuration.showVerticalLines ? 'wr-data-grid-vertical-lines' : '',
      configuration.showFooter ? 'wr-data-grid-has-footer' : '',
    ]
      .filter((className) => className.length > 0)
      .join(' ');
    return (
      <div
        {...sharedAttributes(node, designTime, styleClassName)}
        role="grid"
        aria-label={node.name}
      >
        <div className="wr-data-grid-scroll">
          <div
            className={contentClassName}
            data-webrad-row-height-mode={configuration.rowHeightMode}
            data-webrad-wrap-text={String(configuration.wrapText)}
            style={dataGridLayoutStyle(configuration, node.bounds.width)}
          >
            {configuration.showHeader && (
              <div
                className={`wr-data-grid-row wr-data-grid-header-row${configuration.stickyHeader ? ' wr-data-grid-sticky-header' : ''}`}
                role="row"
              >
                {configuration.columns.map((column) => (
                  <div
                    className="wr-data-grid-cell wr-data-grid-header-cell"
                    data-webrad-data-grid-column={column.id}
                    key={column.id}
                    role="columnheader"
                    style={{ textAlign: column.headerAlign }}
                  >
                    {column.header}
                  </div>
                ))}
              </div>
            )}
            <div className="wr-data-grid-body" role="rowgroup">
              {[0, 1, 2].map((rowIndex) => (
                <div className="wr-data-grid-row wr-data-grid-body-row" key={rowIndex} role="row">
                  {configuration.columns.map((column) => (
                    <div
                      className="wr-data-grid-cell"
                      data-webrad-data-grid-column={column.id}
                      key={column.id}
                      role="gridcell"
                      style={{ textAlign: column.cellAlign }}
                    >
                      {column.cellKind === 'image' ? (
                        <span aria-label={column.header} role="img">
                          Image
                        </span>
                      ) : column.cellKind === 'button' ? (
                        <DataGridButtonPreview column={column} />
                      ) : column.cellKind === 'checkbox' ? (
                        <label className="wr-data-grid-checkbox-control">
                          <input
                            aria-label={column.fixedCaption || column.header}
                            checked={rowIndex % 2 === 0}
                            className="wr-data-grid-checkbox"
                            readOnly
                            type="checkbox"
                          />
                          {column.fixedCaption.length > 0 && (
                            <span className="wr-data-grid-checkbox-caption">
                              {column.fixedCaption}
                            </span>
                          )}
                        </label>
                      ) : (
                        column.fieldPath || 'Value'
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {configuration.showFooter && (
              <div
                className={`wr-data-grid-row wr-data-grid-footer-row${configuration.stickyFooter ? ' wr-data-grid-sticky-footer' : ''}`}
                role="row"
              >
                {configuration.columns.map((column) => (
                  <div
                    className="wr-data-grid-cell wr-data-grid-footer-cell"
                    data-webrad-data-grid-column={column.id}
                    key={column.id}
                    role="gridcell"
                    style={{ textAlign: column.cellAlign }}
                  >
                    {column.footer}
                  </div>
                ))}
              </div>
            )}
          </div>
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
