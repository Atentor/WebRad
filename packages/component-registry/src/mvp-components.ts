import {
  automaticMenuLayout,
  menuInspectorProperties,
  menuDesignSurface,
  menuInspectorTarget,
} from './menu-properties.js';
import { projectReusableMenuLayout } from '@webrad/runtime/menu-layout';
import { webReportBuilder } from './report-builder.js';
import { createWebChartsDefinition } from './charts.js';
import { createWebMenuDefinition, MENU_EVENTS } from './menu.js';
import { componentRegistry, ComponentRegistry } from './registry.js';
import { organizeInspectorProperty } from './inspector-properties.js';
import { CURRENT_ROW_BINDINGS_PROPERTY } from './current-row-bindings.js';
import { webVideoUpload } from './video-upload.js';
import {
  createDefaultApiClientConfiguration,
  parseApiClientConfiguration,
  createDefaultDataGridConfiguration,
  createDefaultRepeatingGroupConfiguration,
  REUSABLE_ELEMENT_HORIZONTAL_ANCHORS,
  REUSABLE_ELEMENT_PLACEMENTS,
  REUSABLE_ELEMENT_VERTICAL_ANCHORS,
} from '@webrad/project-model';
import { WEBRAD_ICON_NAMES } from '@webrad/runtime/icons';
import { LUCIDE_ICON_NAMES } from '@webrad/runtime/icon';
import { WEB_ASPECT_RATIOS, normalizeWebAspectRatio } from '@webrad/runtime';
import {
  PANEL_BACKGROUND_SIZES,
  PANEL_BACKGROUND_POSITIONS,
  PANEL_BACKGROUND_REPEATS,
} from '@webrad/runtime/visual';
import type {
  ComponentDefinition,
  ComponentEventDefinition,
  ComponentPropertyDefinition,
  DefaultComponentBounds,
  ComponentStyleEditorMetadata,
} from './types.js';

const standardCategory = 'Standard';
const containersCategory = 'Containers';
const nonvisualCategory = 'Nonvisual';

const marginProperty: ComponentPropertyDefinition = {
  name: 'margin',
  label: 'Margin',
  description:
    'Outer spacing on all four sides, in pixels. Row and column layouts include this spacing between components.',
  type: 'number',
  category: 'Layout',
  source: 'props',
  defaultValue: 0,
};

const marginSideProperties: readonly ComponentPropertyDefinition[] = [
  'Top',
  'Right',
  'Bottom',
  'Left',
].map((side) => ({
  name: `margin${side}`,
  label: `Margin ${side.toLowerCase()}`,
  description: 'Outer spacing on this side, in pixels. Overrides the shared Margin value.',
  type: 'number',
  category: 'Layout',
  source: 'props',
  defaultValue: 0,
  defaultValueWhen: (props) => props.margin ?? 0,
}));

function geometryProperties(
  bounds: DefaultComponentBounds,
): readonly ComponentPropertyDefinition[] {
  return [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    {
      name: 'x',
      label: 'Left',
      type: 'number',
      category: 'Layout',
      source: 'bounds',
      defaultValue: 0,
    },
    {
      name: 'y',
      label: 'Top',
      type: 'number',
      category: 'Layout',
      source: 'bounds',
      defaultValue: 0,
    },
    {
      name: 'width',
      label: 'Width',
      type: 'number',
      category: 'Layout',
      source: 'bounds',
      defaultValue: bounds.width,
    },
    {
      name: 'height',
      label: 'Height',
      type: 'number',
      category: 'Layout',
      source: 'bounds',
      defaultValue: bounds.height,
    },
    ...layoutItemProperties(),
    marginProperty,
    ...marginSideProperties,
    {
      name: 'visible',
      label: 'Visible',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'collapseWhenHidden',
      label: 'Collapse when hidden',
      description: 'Removes the component from the layout while it is not visible.',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
  ];
}

function aspectRatioGeometryProperties(
  bounds: DefaultComponentBounds,
): readonly ComponentPropertyDefinition[] {
  return [
    ...geometryProperties(bounds).map((property) =>
      ['height', 'itemHeight', 'itemMinHeight', 'itemMaxHeight'].includes(property.name)
        ? {
            ...property,
            readOnlyWhen: (props: Readonly<Record<string, unknown>>) =>
              normalizeWebAspectRatio(props.aspectRatio) !== 'none',
            description:
              'A fixed aspect ratio derives height from width. Choose none to edit the saved height rules.',
          }
        : property,
    ),
    {
      name: 'aspectRatio',
      label: 'Aspect ratio',
      type: 'enum',
      category: 'Layout',
      source: 'props',
      defaultValue: 'none',
      options: WEB_ASPECT_RATIOS,
      description:
        'none allows free dimensions. A fixed ratio derives height from the responsive width.',
    },
  ];
}

/**
 * Properties for a browser visual that is authored from the Designer tray.
 * Its dimensions still control its runtime surface, but it has no page
 * position or responsive-layout participation to configure.
 */
function trayVisualProperties(
  bounds: DefaultComponentBounds,
): readonly ComponentPropertyDefinition[] {
  return [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    marginProperty,
    ...marginSideProperties,
    {
      name: 'width',
      label: 'Width',
      type: 'number',
      category: 'Size',
      source: 'bounds',
      defaultValue: bounds.width,
    },
    {
      name: 'height',
      label: 'Height',
      type: 'number',
      category: 'Size',
      source: 'bounds',
      defaultValue: bounds.height,
    },
    {
      name: 'visible',
      label: 'Visible',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'collapseWhenHidden',
      label: 'Collapse when hidden',
      description:
        'Preserves the shared visibility contract; popup dialogs never participate in page layout.',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
  ];
}

function containerLayoutProperties(): readonly ComponentPropertyDefinition[] {
  return [
    {
      name: 'containerMode',
      label: 'Container layout',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 'fixed',
      options: ['fixed', 'align-to-parent', 'row', 'column'],
    },
    {
      name: 'containerPaddingTop',
      label: 'Padding top',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 0,
    },
    {
      name: 'containerPaddingRight',
      label: 'Padding right',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 0,
    },
    {
      name: 'containerPaddingBottom',
      label: 'Padding bottom',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 0,
    },
    {
      name: 'containerPaddingLeft',
      label: 'Padding left',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 0,
    },
    {
      name: 'containerGap',
      label: 'Gap',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 0,
    },
    {
      name: 'containerWrap',
      label: 'Wrap',
      type: 'boolean',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: false,
    },
    {
      name: 'containerJustifyContent',
      label: 'Justify content',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 'start',
      options: ['start', 'center', 'end', 'space-between', 'space-around'],
    },
    {
      name: 'containerAlignItems',
      label: 'Default alignment',
      description:
        'Default cross-axis alignment for children. Each child can override it with Item alignment.',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-container',
      defaultValue: 'start',
      options: ['start', 'center', 'end', 'stretch'],
    },
  ];
}

function layoutItemProperties(): readonly ComponentPropertyDefinition[] {
  return [
    {
      name: 'itemWidth',
      label: 'Responsive width',
      description:
        'Fit content grows the item to its widest rendered child and preserves child intrinsic widths; minimum and maximum width remain limits.',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 'fixed',
      options: ['fixed', 'stretch', 'fit-content'],
    },
    {
      name: 'itemHeight',
      label: 'Responsive height',
      description:
        'Fit content grows the item to its lowest rendered child and preserves child intrinsic heights; minimum and maximum height remain limits.',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 'fixed',
      options: ['fixed', 'stretch', 'fit-content'],
    },
    {
      name: 'itemMinWidth',
      label: 'Minimum width',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemMaxWidth',
      label: 'Maximum width',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: null,
      nullable: true,
    },
    {
      name: 'itemMinHeight',
      label: 'Minimum height',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemMaxHeight',
      label: 'Maximum height',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: null,
      nullable: true,
    },
    {
      name: 'itemGrow',
      label: 'Grow',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemShrink',
      label: 'Shrink',
      description:
        'Allows fixed and stretch flow items to yield space. Fit-content keeps its intrinsic size so its children are not compressed.',
      type: 'boolean',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: true,
    },
    {
      name: 'itemAlignSelf',
      label: 'Item alignment',
      description:
        'Cross-axis alignment for this item in a row or column. Auto inherits the parent alignment; responsive cross-axis stretch retains its sizing behavior.',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 'auto',
      options: ['auto', 'start', 'center', 'end', 'stretch'],
    },
    {
      name: 'itemHorizontalAnchor',
      label: 'Horizontal anchor',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 'start',
      options: ['start', 'center', 'end', 'stretch'],
    },
    {
      name: 'itemVerticalAnchor',
      label: 'Vertical anchor',
      type: 'enum',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 'start',
      options: ['start', 'center', 'end', 'stretch'],
    },
    {
      name: 'itemLeft',
      label: 'Left inset',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemRight',
      label: 'Right inset',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemTop',
      label: 'Top inset',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
    {
      name: 'itemBottom',
      label: 'Bottom inset',
      type: 'number',
      category: 'Responsive layout',
      source: 'layout-item',
      defaultValue: 0,
    },
  ];
}

function tabIndexProperty(): ComponentPropertyDefinition {
  return {
    name: 'tabIndex',
    label: 'TabIndex',
    type: 'number',
    category: 'Behavior',
    source: 'props',
    defaultValue: 0,
  };
}

function captionProperty(defaultValue: string): ComponentPropertyDefinition {
  return {
    name: 'caption',
    label: 'Caption',
    type: 'string',
    category: 'Appearance',
    source: 'props',
    defaultValue,
  };
}

function event(
  name: string,
  category = 'Behavior',
  codeGeneration: Pick<ComponentEventDefinition, 'eventDetailType' | 'eventDetailProperties'> = {},
): ComponentEventDefinition {
  const nativeTypes: Readonly<Record<string, ComponentEventDefinition['eventType']>> = {
    OnKeyDown: 'KeyboardEvent',
    OnKeyUp: 'KeyboardEvent',
    OnClick: 'MouseEvent',
    OnDblClick: 'MouseEvent',
    OnMouseEnter: 'MouseEvent',
    OnMouseLeave: 'MouseEvent',
    OnFocus: 'FocusEvent',
    OnBlur: 'FocusEvent',
    OnInput: 'InputEvent',
  };
  return {
    name,
    label: name,
    category,
    eventType: nativeTypes[name] ?? 'Event',
    ...codeGeneration,
  };
}

const pageBounds = { width: 800, height: 600 } as const;
const panelBounds = { width: 240, height: 160 } as const;
const labelBounds = { width: 80, height: 24 } as const;
const editBounds = { width: 160, height: 36 } as const;
const textAreaBounds = { width: 240, height: 96 } as const;
const buttonBounds = { width: 100, height: 36 } as const;
const fileUploadBounds = { width: 112, height: 52 } as const;
const checkBoxBounds = { width: 120, height: 24 } as const;
const comboBoxBounds = { width: 160, height: 36 } as const;
const imageBounds = { width: 160, height: 120 } as const;
const listBoxBounds = { width: 180, height: 120 } as const;
const apiClientBounds = { width: 112, height: 52 } as const;
const popupBounds = { width: 360, height: 200 } as const;
const dataGridBounds = { width: 640, height: 320 } as const;
const reusableElementBounds = { width: 360, height: 240 } as const;

const typographyStyleProperties = [
  'textColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
] as const;

const containerStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    ...typographyStyleProperties,
    'backgroundColor',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'borderRadius',
    'boxShadow',
  ],
};

const inputStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    ...containerStyleEditor.essentialProperties,
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'ringWidth',
    'ringColor',
  ],
};

const labelStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    ...typographyStyleProperties,
    'fontStyle',
    'letterSpacing',
    'textTransform',
    'textDecoration',
    'whiteSpace',
    'textGradient',
    'backgroundColor',
    'opacity',
  ],
};

const buttonStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    ...containerStyleEditor.essentialProperties,
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'buttonContentMode',
    'buttonIconPosition',
    'buttonIconSize',
    'buttonIconColor',
    'cursor',
  ],
};

const checkBoxStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    ...typographyStyleProperties,
    'backgroundColor',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'borderRadius',
    'cursor',
    'ringWidth',
    'ringColor',
  ],
};

const imageStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    'objectFit',
    'objectPosition',
    'backgroundColor',
    'borderWidth',
    'borderStyle',
    'borderColor',
    'borderRadius',
    'boxShadow',
    'opacity',
    'cursor',
  ],
};

const dataGridStyleEditor: ComponentStyleEditorMetadata = {
  essentialProperties: [
    'textColor',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'backgroundColor',
    'borderWidth',
    'borderColor',
    'borderRadius',
    'boxShadow',
    'dataGridHorizontalLineVisibility',
    'dataGridHorizontalLineColor',
    'dataGridVerticalLineVisibility',
    'dataGridHeaderBackgroundColor',
    'dataGridHeaderTextColor',
    'dataGridHeaderFontWeight',
    'dataGridFooterBackgroundColor',
    'dataGridFooterTextColor',
    'dataGridButtonContentMode',
    'dataGridButtonBackgroundColor',
    'dataGridButtonTextColor',
    'dataGridCheckboxAccentColor',
    'dataGridCheckboxSize',
  ],
};

const webPage: ComponentDefinition = {
  type: 'WebPage',
  inspectorProperties: (properties, node) =>
    node.name === 'index' || node.name === '404'
      ? properties.map((property) =>
          property.name === 'name' ? { ...property, readOnly: true } : property,
        )
      : properties,
  displayName: 'Page',
  namePrefix: 'Page',
  palette: { category: containersCategory, caption: 'Page' },
  icon: 'component-page',
  visual: true,
  styleEditor: containerStyleEditor,
  canHaveChildren: true,
  defaultEvent: 'OnCreate',
  defaultBounds: pageBounds,
  defaults: {
    caption: 'Page',
    browserTitle: '',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    backgroundColor: '#ffffff',
  },
  properties: [
    ...geometryProperties(pageBounds),
    ...containerLayoutProperties(),
    captionProperty('Page'),
    {
      name: 'browserTitle',
      label: 'Browser title',
      description: 'Title shown in the browser tab. Leave blank to use the application name.',
      type: 'string',
      category: 'Identity',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'backgroundColor',
      label: 'Background Color',
      type: 'color',
      category: 'Appearance',
      source: 'props',
      defaultValue: '#ffffff',
    },
  ],
  events: [
    event('OnCreate'),
    event('OnShow'),
    event('OnHide'),
    event('OnResize'),
    event('OnLogin', 'RestGO', {
      eventDetailType: 'WebPageLoginEventDetail',
      eventDetailProperties: ['user'],
    }),
    event('OnLogout', 'RestGO', {
      eventDetailType: 'WebPageLogoutEventDetail',
      eventDetailProperties: ['user'],
    }),
    event('OnUnauthenticated', 'RestGO'),
  ],
};

function floatingPlacementProperties(pageOwned = false): ComponentPropertyDefinition[] {
  return [
    {
      name: 'placement',
      label: 'Placement',
      type: 'enum',
      category: pageOwned ? 'Floating placement' : 'Reusable component',
      source: 'props',
      defaultValue: 'in-flow',
      options: REUSABLE_ELEMENT_PLACEMENTS,
      description: pageOwned
        ? 'Floating Panels overlay page content and move with page scrolling without consuming layout space.'
        : 'Floating instances are fixed to the viewport and do not consume page flow.',
    },
    {
      name: 'floatingHorizontalAnchor',
      label: 'Floating horizontal anchor',
      type: 'enum',
      category: 'Floating placement',
      source: 'props',
      defaultValue: 'left',
      options: REUSABLE_ELEMENT_HORIZONTAL_ANCHORS,
      readOnlyWhen: (props) =>
        props.placement === 'floating' &&
        ['left', 'right', 'client'].includes(String(props.floatingAlignment)),
    },
    {
      name: 'floatingVerticalAnchor',
      label: 'Floating vertical anchor',
      type: 'enum',
      category: 'Floating placement',
      source: 'props',
      defaultValue: 'top',
      options: REUSABLE_ELEMENT_VERTICAL_ANCHORS,
      readOnlyWhen: (props) =>
        props.placement === 'floating' &&
        ['top', 'bottom', 'client'].includes(String(props.floatingAlignment)),
    },
    {
      name: 'floatingZIndex',
      label: 'Floating layer',
      type: 'number',
      category: 'Floating placement',
      source: 'props',
      defaultValue: 100,
    },
  ];
}

const webPanel: ComponentDefinition = {
  supportsFloatingPlacement: true,
  automaticLayout: automaticMenuLayout,
  inspectorProperties: (properties, node, context) =>
    menuInspectorProperties(properties, node, context).map((property) =>
      property.name === 'aspectRatio' && node.parentId === null
        ? {
            ...property,
            readOnly: true,
            description:
              'The root fills its owning surface. Configure proportions on child components.',
          }
        : property,
    ),
  designSurface: menuDesignSurface,
  floatingSizing: 'responsive',
  type: 'WebPanel',
  displayName: 'Panel',
  namePrefix: 'Panel',
  palette: { category: containersCategory, caption: 'Panel' },
  icon: 'component-panel',
  visual: true,
  styleEditor: {
    previewProps: { progressEnabled: true, progressValue: 50 },
    essentialProperties: [
      ...containerStyleEditor.essentialProperties,
      'panelProgressColor',
      'panelProgressTrackColor',
      'panelProgressThickness',
    ],
  },
  canHaveChildren: true,
  defaultEvent: 'OnClick',
  defaultBounds: panelBounds,
  defaults: {
    caption: '',
    aspectRatio: 'none',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    backgroundColor: 'transparent',
    borderColor: '#808080',
    backgroundImage: '',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    progressEnabled: false,
    progressValue: 0,
    floatingAlignment: 'none',
    placement: 'in-flow',
    floatingHorizontalAnchor: 'left',
    floatingVerticalAnchor: 'top',
    floatingZIndex: 100,
  },
  properties: [
    ...aspectRatioGeometryProperties(panelBounds),
    ...containerLayoutProperties(),
    captionProperty(''),
    ...floatingPlacementProperties(true),
    {
      name: 'floatingAlignment',
      label: 'Floating alignment',
      type: 'enum',
      category: 'Floating placement',
      source: 'props',
      defaultValue: 'none',
      options: ['none', 'top', 'bottom', 'left', 'right', 'client'],
      readOnlyWhen: (props) => props.placement !== 'floating',
      description:
        'Choose the page edge or client origin. Responsive width/height, content sizing, limits, margins and offsets remain active. Use Stretch on both axes to fill the client area.',
    },
    {
      name: 'progressEnabled',
      label: 'Enable border progress',
      type: 'boolean',
      category: 'Progress',
      source: 'props',
      defaultValue: false,
      description:
        'Show progress along the Panel border automatically when the value is greater than 0 and less than 100.',
    },
    {
      name: 'progressValue',
      label: 'Progress (%)',
      type: 'number',
      category: 'Progress',
      source: 'props',
      defaultValue: 0,
      description: 'Progress percentage from 0 to 100. At 0 or 100 the indicator is hidden.',
      validateValue: (value) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100,
    },
    {
      name: 'backgroundImage',
      label: 'Background image',
      type: 'string',
      category: 'Appearance',
      source: 'props',
      defaultValue: '',
      description:
        'Image URL, data URL, or project asset path (assets/imported/...). Leave empty to use only the selected style.',
    },
    {
      name: 'backgroundSize',
      label: 'Background size',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'cover',
      options: PANEL_BACKGROUND_SIZES,
      description:
        'Cover fills with cropping; contain keeps the full image; auto uses its original size; stretch fills both dimensions.',
    },
    {
      name: 'backgroundPosition',
      label: 'Background position',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'center',
      options: PANEL_BACKGROUND_POSITIONS,
    },
    {
      name: 'backgroundRepeat',
      label: 'Background repeat',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'no-repeat',
      options: PANEL_BACKGROUND_REPEATS,
    },
    {
      name: 'backgroundColor',
      label: 'Background Color',
      type: 'color',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'transparent',
    },
    {
      name: 'borderColor',
      label: 'Border Color',
      type: 'color',
      category: 'Appearance',
      source: 'props',
      defaultValue: '#808080',
    },
  ],
  events: [
    event('OnClick'),
    event('OnDblClick'),
    event('OnMouseEnter', 'Mouse'),
    event('OnMouseLeave', 'Mouse'),
  ],
};

const webGroup: ComponentDefinition = {
  supportsStyles: false,
  type: 'WebGroup',
  displayName: 'Group',
  namePrefix: 'Group',
  palette: { category: containersCategory, caption: 'Group' },
  icon: 'component-panel',
  visual: true,
  canHaveChildren: true,
  defaultEvent: 'OnClick',
  defaultBounds: panelBounds,
  defaults: { visible: true, collapseWhenHidden: true, enabled: true, aspectRatio: 'none' },
  properties: [...aspectRatioGeometryProperties(panelBounds), ...containerLayoutProperties()],
  events: webPanel.events,
};

/**
 * A placement-owned instance of a project reusable definition. The referenced
 * definition remains in the Project Model, so this node intentionally cannot
 * own ordinary component children.
 */
const webReusableElement: ComponentDefinition = {
  supportsFloatingPlacement: true,
  automaticLayout: automaticMenuLayout,
  inspectorProperties: menuInspectorProperties,
  floatingSizing: 'responsive',
  projectLayout: (node, viewport, context) =>
    projectReusableMenuLayout(
      node,
      context?.reusableElements?.find(
        (definition) => definition.id === node.props.reusableElementId,
      ),
      viewport.responsiveWidth ?? viewport.width,
      undefined,
      viewport.height,
    ),
  type: 'WebReusableElement',
  eventsForNode: (node, context) =>
    menuInspectorTarget(node, context) === undefined ? [] : MENU_EVENTS,
  displayName: 'Reusable Component',
  namePrefix: 'Reusable',
  palette: { category: containersCategory, caption: 'Reusable Component' },
  icon: 'component-panel',
  visual: true,
  styleEditor: containerStyleEditor,
  canHaveChildren: false,
  defaultEvent: null,
  defaultBounds: reusableElementBounds,
  defaults: {
    reusableElementId: '',
    placement: 'in-flow',
    floatingHorizontalAnchor: 'left',
    floatingVerticalAnchor: 'top',
    floatingZIndex: 100,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
  },
  properties: [
    ...geometryProperties(reusableElementBounds),
    {
      name: 'reusableElementId',
      label: 'Reusable component',
      type: 'reusable-element',
      category: 'Reusable component',
      source: 'props',
      defaultValue: '',
      description: 'The shared component definition rendered by this instance.',
    },
    ...floatingPlacementProperties(),
  ],
  events: [],
};

const webLabel: ComponentDefinition = {
  type: 'WebLabel',
  displayName: 'Label',
  namePrefix: 'Label',
  palette: { category: standardCategory, caption: 'Label' },
  icon: 'component-label',
  visual: true,
  styleEditor: labelStyleEditor,
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: labelBounds,
  defaults: {
    caption: 'Label',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    color: '#000000',
    autoSize: true,
  },
  properties: [
    ...geometryProperties(labelBounds),
    captionProperty('Label'),
    {
      name: 'color',
      label: 'Color',
      type: 'color',
      category: 'Appearance',
      source: 'props',
      defaultValue: '#000000',
    },
    {
      name: 'autoSize',
      label: 'Auto Size',
      type: 'boolean',
      category: 'Layout',
      source: 'props',
      defaultValue: true,
    },
  ],
  events: [
    event('OnClick'),
    event('OnDblClick'),
    event('OnMouseEnter', 'Mouse'),
    event('OnMouseLeave', 'Mouse'),
  ],
};

const webHtml: ComponentDefinition = {
  type: 'WebHtml',
  displayName: 'HTML',
  namePrefix: 'Html',
  palette: { category: standardCategory, caption: 'HTML' },
  icon: 'code',
  visual: true,
  styleEditor: {
    essentialProperties: [
      'backgroundColor',
      'borderWidth',
      'borderStyle',
      'borderColor',
      'borderRadius',
      'boxShadow',
      'opacity',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
    ],
  },
  canHaveChildren: false,
  defaultEvent: 'OnLoad',
  defaultBounds: { width: 320, height: 180 },
  defaults: {
    html: '<p>HTML content</p>',
    aspectRatio: 'none',
    title: 'HTML content',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
  },
  properties: [
    ...aspectRatioGeometryProperties({ width: 320, height: 180 }),
    {
      name: 'html',
      label: 'HTML',
      type: 'string',
      multiline: true,
      category: 'Content',
      source: 'props',
      defaultValue: '<p>HTML content</p>',
      description:
        'HTML and CSS, or a standalone HTTPS iframe embed. Inline markup scripts do not execute.',
    },
    {
      name: 'title',
      label: 'Title',
      type: 'string',
      category: 'Accessibility',
      source: 'props',
      defaultValue: 'HTML content',
      description: 'Accessible name of the embedded HTML document.',
    },
  ],
  events: [event('OnLoad')],
};

const webEdit: ComponentDefinition = {
  type: 'WebEdit',
  displayName: 'Edit',
  namePrefix: 'Edit',
  palette: { category: standardCategory, caption: 'Edit' },
  icon: 'component-edit',
  visual: true,
  styleEditor: {
    ...inputStyleEditor,
    previewProps: { value: 'Sample text' },
  },
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: editBounds,
  defaults: {
    value: '',
    placeholder: '',
    readOnly: false,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(editBounds),
    tabIndexProperty(),
    {
      name: 'value',
      label: 'Value',
      type: 'string',
      category: 'Data',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'placeholder',
      label: 'Placeholder',
      type: 'string',
      category: 'Appearance',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'readOnly',
      label: 'Read Only',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: false,
    },
    {
      name: 'inputType',
      label: 'Input Type',
      type: 'enum',
      category: 'Behavior',
      source: 'props',
      defaultValue: 'text',
      options: ['text', 'password', 'email', 'number', 'search', 'tel', 'url'],
    },
  ],
  events: [
    event('OnChange'),
    event('OnInput'),
    event('OnFocus'),
    event('OnBlur'),
    event('OnKeyDown', 'Keyboard'),
    event('OnKeyUp', 'Keyboard'),
  ],
};

const webTextArea: ComponentDefinition = {
  type: 'WebTextArea',
  displayName: 'Text Area',
  namePrefix: 'TextArea',
  palette: { category: standardCategory, caption: 'Text Area' },
  icon: 'component-text-area',
  visual: true,
  styleEditor: {
    ...inputStyleEditor,
    previewProps: {
      value: 'Sample text\nSee how your text style looks across multiple lines.',
    },
  },
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: textAreaBounds,
  defaults: {
    value: '',
    placeholder: '',
    readOnly: false,
    rows: 4,
    spellCheck: true,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(textAreaBounds),
    tabIndexProperty(),
    {
      name: 'value',
      label: 'Value',
      type: 'string',
      category: 'Data',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'placeholder',
      label: 'Placeholder',
      type: 'string',
      category: 'Appearance',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'readOnly',
      label: 'Read Only',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: false,
    },
    {
      name: 'rows',
      label: 'Rows',
      type: 'number',
      category: 'Layout',
      source: 'props',
      defaultValue: 4,
    },
    {
      name: 'spellCheck',
      label: 'Spell Check',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
  ],
  events: [
    event('OnChange'),
    event('OnInput'),
    event('OnFocus'),
    event('OnBlur'),
    event('OnKeyDown', 'Keyboard'),
    event('OnKeyUp', 'Keyboard'),
  ],
};

const webButton: ComponentDefinition = {
  type: 'WebButton',
  displayName: 'Button',
  namePrefix: 'Button',
  palette: { category: standardCategory, caption: 'Button' },
  icon: 'component-button',
  visual: true,
  styleEditor: buttonStyleEditor,
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: buttonBounds,
  defaults: {
    caption: 'Button',
    icon: 'add',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(buttonBounds),
    tabIndexProperty(),
    captionProperty('Button'),
    {
      name: 'icon',
      label: 'Icon',
      type: 'icon',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'add',
      options: WEBRAD_ICON_NAMES,
      description: 'Choose the icon used by this button when its style shows an icon.',
    },
  ],
  events: [
    event('OnClick'),
    event('OnFocus'),
    event('OnBlur'),
    event('OnMouseEnter', 'Mouse'),
    event('OnMouseLeave', 'Mouse'),
  ],
};

const webTimer: ComponentDefinition = {
  type: 'WebTimer',
  displayName: 'Timer',
  namePrefix: 'Timer',
  palette: { category: nonvisualCategory, caption: 'Timer' },
  icon: 'timer',
  visual: false,
  canHaveChildren: false,
  defaultEvent: 'OnTimer',
  defaultBounds: fileUploadBounds,
  defaults: { time: 1000, loop: true, enabled: false },
  properties: [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    {
      name: 'time',
      label: 'Time (ms)',
      type: 'number',
      category: 'Behavior',
      source: 'props',
      defaultValue: 1000,
      description:
        'Interval in milliseconds (1 to 2147483647). Changing it restarts the current interval.',
      validateValue: (value) =>
        typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483647,
    },
    {
      name: 'loop',
      label: 'Loop',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: false,
    },
  ],
  events: [
    event('OnTimer', 'Timer', {
      eventDetailType: 'WebTimerEventDetail',
      eventDetailProperties: ['tick'],
    }),
    event('OnStart', 'Timer'),
    event('OnStop', 'Timer'),
  ],
};

const webFileUpload: ComponentDefinition = {
  type: 'WebFileUpload',
  displayName: 'File Upload',
  namePrefix: 'FileUpload',
  palette: { category: nonvisualCategory, caption: 'File Upload' },
  icon: 'component-file-upload',
  visual: false,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: fileUploadBounds,
  defaults: {
    accept: '',
    isPublic: false,
    enabled: true,
  },
  properties: [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    {
      name: 'accept',
      label: 'Accepted file types',
      type: 'string',
      category: 'Behavior',
      source: 'props',
      defaultValue: '',
      description:
        'Native file chooser filter, such as image/* or .pdf,.txt. Empty accepts all file types.',
    },
    {
      name: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
    {
      name: 'isPublic',
      label: 'Public file',
      type: 'boolean',
      category: 'Storage',
      source: 'props',
      defaultValue: false,
      description:
        'Default visibility when uploading. Private files require authorized access; upload options can override this value.',
    },
  ],
  events: [
    event('OnChange', 'Selection', { eventDetailType: 'WebFileUploadChangeEventDetail' }),
    event('OnSuccess', 'Upload', {
      eventDetailType: 'WebFileUploadResult',
      eventDetailProperties: ['id', 'downloadUrl', 'url', 'isPublic'],
    }),
    event('OnProgress', 'Upload', {
      eventDetailType: 'WebFileUploadProgressEventDetail',
      eventDetailProperties: ['percentage', 'loaded', 'total', 'lengthComputable'],
    }),
    event('OnError', 'Upload', { eventDetailType: 'Error' }),
    event('OnComplete', 'Upload', {
      eventDetailType: 'WebFileUploadCompleteEventDetail',
      eventDetailProperties: ['result', 'error'],
    }),
  ],
};

const webCheckBox: ComponentDefinition = {
  type: 'WebCheckBox',
  displayName: 'Check Box',
  namePrefix: 'CheckBox',
  palette: { category: standardCategory, caption: 'Check Box' },
  icon: 'component-check-box',
  visual: true,
  styleEditor: checkBoxStyleEditor,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: checkBoxBounds,
  defaults: {
    caption: 'Check Box',
    checked: false,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(checkBoxBounds),
    tabIndexProperty(),
    captionProperty('Check Box'),
    {
      name: 'checked',
      label: 'Checked',
      type: 'boolean',
      category: 'Data',
      source: 'props',
      defaultValue: false,
    },
  ],
  events: [event('OnChange'), event('OnClick'), event('OnFocus'), event('OnBlur')],
};

const webToggle: ComponentDefinition = {
  type: 'WebToggle',
  displayName: 'Toggle',
  namePrefix: 'Toggle',
  palette: { category: standardCategory, caption: 'Toggle' },
  icon: 'component-toggle',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  styleEditor: {
    essentialProperties: [
      'backgroundColor',
      'backgroundGradient',
      'toggleCheckedColor',
      'toggleThumbColor',
      'borderWidth',
      'borderStyle',
      'borderColor',
      'borderRadius',
      'boxShadow',
      'cursor',
      'ringWidth',
      'ringColor',
      'opacity',
    ],
  },
  defaultBounds: { width: 48, height: 26 },
  defaults: { checked: false, visible: true, collapseWhenHidden: true, enabled: true, tabIndex: 0 },
  properties: [
    ...geometryProperties({ width: 48, height: 26 }),
    tabIndexProperty(),
    {
      name: 'checked',
      label: 'Checked',
      type: 'boolean',
      category: 'Data',
      source: 'props',
      defaultValue: false,
    },
  ],
  events: [event('OnChange'), event('OnClick'), event('OnFocus'), event('OnBlur')],
};

const webIcon: ComponentDefinition = {
  type: 'WebIcon',
  displayName: 'Icons',
  namePrefix: 'Icon',
  palette: { category: standardCategory, caption: 'Icons' },
  icon: 'star',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: { width: 32, height: 32 },
  defaults: {
    icon: 'star',
    mode: 'icon',
    accessibleLabel: '',
    strokeWidth: 2,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  styleEditor: {
    essentialProperties: [
      'textColor',
      'backgroundColor',
      'borderWidth',
      'borderStyle',
      'borderColor',
      'borderRadius',
      'boxShadow',
      'ringWidth',
      'ringColor',
      'opacity',
    ],
  },
  properties: [
    ...geometryProperties({ width: 32, height: 32 }),
    tabIndexProperty(),
    {
      name: 'icon',
      label: 'Icon',
      type: 'icon',
      iconLibrary: 'lucide',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'star',
      options: LUCIDE_ICON_NAMES,
    },
    {
      name: 'mode',
      label: 'Mode',
      type: 'enum',
      category: 'Behavior',
      source: 'props',
      defaultValue: 'icon',
      options: ['icon', 'button'],
      description:
        'Icon displays a Lucide graphic. Button enables click and keyboard activation without a caption.',
    },
    {
      name: 'accessibleLabel',
      label: 'Accessible label',
      type: 'string',
      category: 'Accessibility',
      source: 'props',
      defaultValue: '',
      description:
        'Name announced by assistive technology. Never displayed as a caption; falls back to the component name.',
    },
    {
      name: 'strokeWidth',
      label: 'Stroke width',
      type: 'number',
      category: 'Appearance',
      source: 'props',
      defaultValue: 2,
      validateValue: (value) =>
        typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 24,
    },
  ],
  events: [
    event('OnClick'),
    event('OnDblClick'),
    event('OnFocus'),
    event('OnBlur'),
    event('OnKeyDown'),
    event('OnKeyUp'),
    event('OnMouseEnter'),
    event('OnMouseLeave'),
  ],
};

const webProgressBar: ComponentDefinition = {
  type: 'WebProgressBar',
  displayName: 'ProgressBar',
  namePrefix: 'ProgressBar',
  palette: { category: standardCategory, caption: 'ProgressBar' },
  icon: 'chart-bar',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: { width: 240, height: 28 },
  defaults: {
    format: 'bars',
    min: 0,
    max: 100,
    value: 50,
    showValue: true,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
  },
  styleEditor: {
    essentialProperties: [
      'progressColor',
      'progressTrackColor',
      'progressThickness',
      ...typographyStyleProperties,
      'borderRadius',
      'backgroundColor',
      'borderWidth',
      'borderColor',
      'borderStyle',
      'borderGradient',
      'opacity',
    ],
  },
  properties: [
    ...geometryProperties({ width: 240, height: 28 }),
    {
      name: 'format',
      label: 'Format',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'bars',
      options: ['bars', 'dunnet', 'circus'],
      description: 'bars: horizontal bar; dunnet: donut ring; circus: filled circle.',
    },
    ...(['min', 'max', 'value'] as const).map((name) => ({
      name,
      label: name === 'min' ? 'Minimum' : name === 'max' ? 'Maximum' : 'Value',
      type: 'number' as const,
      category: 'Progress',
      source: 'props' as const,
      defaultValue: name === 'min' ? 0 : name === 'max' ? 100 : 50,
      description:
        'Finite progress value. Maximum must exceed minimum; the displayed value is clamped to the range.',
      validateValue: (value: unknown) => typeof value === 'number' && Number.isFinite(value),
    })),
    {
      name: 'showValue',
      label: 'Show percentage',
      type: 'boolean',
      category: 'Appearance',
      source: 'props',
      defaultValue: true,
    },
  ],
  events: [event('OnChange'), event('OnClick')],
};

const webComboBox: ComponentDefinition = {
  type: 'WebComboBox',
  displayName: 'Combo Box',
  namePrefix: 'ComboBox',
  palette: { category: standardCategory, caption: 'Combo Box' },
  icon: 'component-combo-box',
  visual: true,
  styleEditor: {
    ...inputStyleEditor,
    previewProps: {
      items: ['Sample text', 'Another option'],
      selectedIndex: 0,
      value: 'Sample text',
    },
  },
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  designerAction: 'combo-box-configurator',
  defaultBounds: comboBoxBounds,
  defaults: {
    items: [],
    values: [],
    comboBoxConfig: null,
    selectedIndex: -1,
    value: '',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(comboBoxBounds),
    tabIndexProperty(),
    {
      name: 'items',
      label: 'Items',
      type: 'string-list',
      category: 'Data',
      source: 'props',
      defaultValue: [],
      readOnlyWhen: (props) => props.comboBoxConfig != null,
      designerAction: 'combo-box-items',
    },
    {
      name: 'values',
      label: 'Values',
      type: 'string-list',
      category: 'Data',
      source: 'props',
      defaultValue: [],
      readOnlyWhen: (props) => props.comboBoxConfig != null,
      designerAction: 'combo-box-values',
    },
    {
      name: 'comboBoxConfig',
      label: 'API Client binding',
      type: 'combo-box-config',
      category: 'Data',
      source: 'props',
      defaultValue: null,
      description: 'Select the API Client response list, display field, and key field.',
      designerAction: 'combo-box-configurator',
    },
    {
      name: 'selectedIndex',
      label: 'Selected Index',
      type: 'number',
      category: 'Data',
      source: 'props',
      defaultValue: -1,
      readOnlyWhen: (props) => props.comboBoxConfig != null,
      description: 'For API-bound options, use Value to select the key after the list loads.',
    },
    {
      name: 'value',
      label: 'Value',
      type: 'string',
      category: 'Data',
      source: 'props',
      defaultValue: '',
    },
  ],
  events: [event('OnChange'), event('OnFocus'), event('OnBlur')],
};

const webImage: ComponentDefinition = {
  type: 'WebImage',
  displayName: 'Image',
  namePrefix: 'Image',
  palette: { category: standardCategory, caption: 'Image' },
  icon: 'component-image',
  visual: true,
  styleEditor: imageStyleEditor,
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: imageBounds,
  defaults: {
    src: '',
    placeholder: 'image',
    alt: '',
    objectFit: 'contain',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
  },
  properties: [
    ...geometryProperties(imageBounds),
    {
      name: 'src',
      label: 'Source',
      type: 'string',
      category: 'Data',
      source: 'props',
      defaultValue: '',
      validateValue: (value) => value === null || typeof value === 'string',
    },
    {
      name: 'placeholder',
      label: 'Empty Image',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'image',
      options: ['image', 'user'],
    },
    {
      name: 'alt',
      label: 'Alternative Text',
      type: 'string',
      category: 'Accessibility',
      source: 'props',
      defaultValue: '',
    },
    {
      name: 'objectFit',
      label: 'Object Fit',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'contain',
      options: ['contain', 'cover', 'fill', 'none', 'scale-down'],
    },
  ],
  events: [event('OnClick'), event('OnLoad'), event('OnError')],
};

const webVideoPlayer: ComponentDefinition = {
  type: 'WebVideoPlayer',
  displayName: 'Video Player',
  namePrefix: 'VideoPlayer',
  palette: { category: standardCategory, caption: 'Video Player' },
  icon: 'video',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnLoaded',
  styleEditor: imageStyleEditor,
  defaultBounds: { width: 480, height: 270 },
  defaults: {
    source: null,
    controls: true,
    autoplay: false,
    muted: false,
    loop: false,
    playsInline: true,
    volume: 1,
    playbackRate: 1,
    objectFit: 'contain',
    aspectRatio: 'none',
    quality: 'auto',
    poster: '',
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
  },
  properties: [
    ...geometryProperties({ width: 480, height: 270 }),
    tabIndexProperty(),
    {
      name: 'aspectRatio',
      label: 'Aspect ratio',
      type: 'enum',
      category: 'Video',
      source: 'props',
      defaultValue: 'none',
      options: ['none', '16:9', '9:16'],
      description:
        'Keep a fixed ratio by calculating height from the responsive width. none uses the saved height rules.',
    },
    {
      name: 'source',
      label: 'Video source',
      type: 'video-source',
      category: 'Video',
      source: 'props',
      defaultValue: null,
    },
    ...['controls', 'autoplay', 'muted', 'loop', 'playsInline'].map(
      (name): ComponentPropertyDefinition => ({
        name,
        label: {
          controls: 'Show controls',
          autoplay: 'Autoplay',
          muted: 'Muted',
          loop: 'Loop',
          playsInline: 'Play inline',
        }[name],
        type: 'boolean',
        category: 'Video',
        source: 'props',
        defaultValue: name === 'controls' || name === 'playsInline',
      }),
    ),
    {
      name: 'volume',
      label: 'Volume (0–1)',
      type: 'number',
      category: 'Video',
      source: 'props',
      defaultValue: 1,
    },
    {
      name: 'playbackRate',
      label: 'Playback rate',
      type: 'number',
      category: 'Video',
      source: 'props',
      defaultValue: 1,
    },
    {
      name: 'objectFit',
      label: 'Object fit',
      type: 'enum',
      category: 'Appearance',
      source: 'props',
      defaultValue: 'contain',
      options: ['contain', 'cover', 'fill', 'none', 'scale-down'],
    },
    {
      name: 'quality',
      label: 'Initial quality',
      type: 'enum',
      category: 'Video',
      source: 'props',
      defaultValue: 'auto',
      options: ['auto'],
      validateValue: (value) =>
        value === 'auto' || (typeof value === 'number' && Number.isFinite(value) && value > 0),
      description:
        'Manual qualities are discovered from the loaded video. Use the playback quality menu or SetQuality().',
    },
    {
      name: 'poster',
      label: 'Poster',
      type: 'string',
      category: 'Appearance',
      source: 'props',
      defaultValue: '',
      description:
        'Optional poster URL. RestGo thumbnails are fetched with the current access policy.',
    },
  ],
  events: [
    event('OnLoaded', 'Video', {
      eventDetailType: 'WebVideoPlayerLoadedEventDetail',
      eventDetailProperties: ['source', 'duration', 'availableQualities'],
    }),
    ...['OnPlay', 'OnPause', 'OnEnded', 'OnTimeUpdate'].map((name) =>
      event(name, 'Video', {
        eventDetailType: 'WebVideoPlayerTimeEventDetail',
        eventDetailProperties: ['currentTime', 'duration'],
      }),
    ),
    event('OnBuffering', 'Video', {
      eventDetailType: 'WebVideoPlayerBufferingEventDetail',
      eventDetailProperties: ['buffering'],
    }),
    event('OnQualityChange', 'Video', {
      eventDetailType: 'WebVideoPlayerQualityEventDetail',
      eventDetailProperties: ['requested', 'current'],
    }),
    event('OnError', 'Video', { eventDetailType: 'Error' }),
  ],
};

const webListBox: ComponentDefinition = {
  type: 'WebListBox',
  displayName: 'List Box',
  namePrefix: 'ListBox',
  palette: { category: standardCategory, caption: 'List Box' },
  icon: 'component-list-box',
  visual: true,
  styleEditor: {
    ...inputStyleEditor,
    previewProps: { items: ['Sample text', 'Another item'], selectedIndex: 0 },
  },
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: listBoxBounds,
  defaults: {
    items: [],
    selectedIndex: -1,
    multiple: false,
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [
    ...geometryProperties(listBoxBounds),
    tabIndexProperty(),
    {
      name: 'items',
      label: 'Items',
      type: 'string-list',
      category: 'Data',
      source: 'props',
      defaultValue: [],
    },
    {
      name: 'selectedIndex',
      label: 'Selected Index',
      type: 'number',
      category: 'Data',
      source: 'props',
      defaultValue: -1,
    },
    {
      name: 'multiple',
      label: 'Multiple',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: false,
    },
  ],
  events: [event('OnChange'), event('OnDblClick'), event('OnFocus'), event('OnBlur')],
};

/**
 * A browser-rendered floating container that is deliberately authored from
 * the nonvisual tray. Its own editor surface is opened on demand, while its
 * children retain the same responsive layout contract as other containers.
 */
const webPopup: ComponentDefinition = {
  type: 'WebPopup',
  displayName: 'Popup',
  namePrefix: 'Popup',
  palette: { category: nonvisualCategory, caption: 'Popup' },
  icon: 'component-popup',
  visual: true,
  styleEditor: containerStyleEditor,
  designerPresentation: 'tray',
  canHaveChildren: true,
  defaultEvent: 'OnShow',
  defaultBounds: popupBounds,
  defaults: {
    modal: true,
    visible: false,
    collapseWhenHidden: true,
    enabled: true,
  },
  properties: [
    ...trayVisualProperties(popupBounds),
    ...containerLayoutProperties(),
    {
      name: 'modal',
      label: 'Modal',
      description: 'When opened, prevents interaction with the page while the popup is visible.',
      type: 'boolean',
      category: 'Behavior',
      source: 'props',
      defaultValue: true,
    },
  ],
  events: [event('OnShow'), event('OnHide'), event('OnClose'), event('OnCancel')],
};

const webApiClient: ComponentDefinition = {
  type: 'WebApiClient',
  displayName: 'API Client',
  namePrefix: 'ApiClient',
  palette: { category: nonvisualCategory, caption: 'API Client' },
  icon: 'component-api-client',
  visual: false,
  canHaveChildren: false,
  defaultEvent: null,
  designerAction: 'api-client-tester',
  // Nonvisual nodes still carry model bounds for model consistency. The Designer
  // projects them into its tray instead of interpreting these as canvas geometry.
  defaultBounds: apiClientBounds,
  defaults: {
    baseUrl: '',
    apiClientConfig: createDefaultApiClientConfiguration(),
  },
  properties: [
    { name: 'name', label: 'Name', type: 'string', category: 'Identity', source: 'node' },
    {
      name: 'baseUrl',
      label: 'Base URL',
      type: 'string',
      category: 'Connection',
      source: 'props',
      defaultValue: '',
      description:
        'Custom API URL. RestGo-bound clients use the fixed URL from RestGo integration > Connection.',
      readOnlyWhen: (props) => {
        const configuration = props.apiClientConfig;
        return (
          typeof configuration === 'object' &&
          configuration !== null &&
          ['restgo-session', 'restgo-api-token', 'restgo-public'].includes(
            String(Reflect.get(configuration, 'connection')),
          )
        );
      },
    },
    {
      name: 'apiClientConfig',
      label: 'Requests',
      type: 'api-client-config',
      runtimeValue: (value) => {
        const configuration = parseApiClientConfiguration(value);
        return {
          ...configuration,
          operations: configuration.operations.map((operation) => {
            const runtimeOperation = { ...operation };
            delete runtimeOperation.restGoSource;
            return runtimeOperation;
          }),
        };
      },
      category: 'API Client',
      source: 'props',
      defaultValue: createDefaultApiClientConfiguration(),
      description:
        'Configure requests in the Designer; access RequestName.parameter and RequestName.execute() in code with typed request objects.',
      designerAction: 'api-client-tester',
    },
  ],
  events: [
    event('OnRequest', 'Request', { eventDetailType: 'WebApiOperationEventDetail' }),
    event('OnSuccess', 'Request', { eventDetailType: 'WebApiOperationEventDetail' }),
    event('OnError', 'Request', { eventDetailType: 'WebApiOperationEventDetail' }),
    event('OnComplete', 'Request', { eventDetailType: 'WebApiOperationEventDetail' }),
  ],
};

const webDataGrid: ComponentDefinition = {
  type: 'WebDataGrid',
  styleDependencies: ['WebToggle'],
  displayName: 'Data Grid',
  namePrefix: 'DataGrid',
  palette: { category: standardCategory, caption: 'Data Grid' },
  icon: 'table',
  visual: true,
  styleEditor: dataGridStyleEditor,
  canHaveChildren: false,
  defaultEvent: null,
  designerAction: 'data-grid-configurator',
  defaultBounds: dataGridBounds,
  defaults: {
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    dataGridConfig: createDefaultDataGridConfiguration(),
  },
  properties: [
    ...geometryProperties(dataGridBounds),
    {
      name: 'dataGridConfig',
      label: 'Data source and columns',
      type: 'data-grid-config',
      category: 'Data Grid',
      source: 'props',
      defaultValue: createDefaultDataGridConfiguration(),
      description:
        'Configure the source, columns, responsive widths, row sizing, and cell layout in the Data Grid editor.',
      designerAction: 'data-grid-configurator',
    },
  ],
  events: [
    event('OnCellClick', 'Data', {
      eventDetailType: 'WebDataGridCellEventDetail',
      eventDetailProperties: ['column', 'rowIndex', 'columnIndex', 'value', 'getValue'],
    }),
  ],
};

const webRepeatingGroup: ComponentDefinition = {
  type: 'WebRepeatingGroup',
  displayName: 'Repeating Group',
  namePrefix: 'RepeatingGroup',
  palette: { category: containersCategory, caption: 'Repeating Group' },
  icon: 'component-list-box',
  visual: true,
  styleEditor: containerStyleEditor,
  canHaveChildren: true,
  designerChildHost: 'repeating-row',
  defaultEvent: null,
  designerAction: 'repeating-group-configurator',
  defaultBounds: { width: 420, height: 320 },
  defaults: {
    visible: true,
    collapseWhenHidden: true,
    enabled: true,
    repeatingGroupConfig: createDefaultRepeatingGroupConfiguration(),
  },
  properties: [
    ...geometryProperties({ width: 420, height: 320 }),
    ...containerLayoutProperties(),
    {
      name: 'repeatingGroupConfig',
      label: 'Data source and rows',
      type: 'repeating-group-config',
      category: 'Repeating Group',
      source: 'props',
      defaultValue: createDefaultRepeatingGroupConfiguration(),
      designerAction: 'repeating-group-configurator',
      description:
        'Choose the API response list and row sizing. Children form one responsive row template.',
    },
  ],
  events: [event('OnClick'), event('OnDblClick')],
};

export const MVP_COMPONENT_TYPES = [
  'WebPage',
  'WebPanel',
  'WebGroup',
  'WebReusableElement',
  'WebLabel',
  'WebHtml',
  'WebEdit',
  'WebTextArea',
  'WebButton',
  'WebCheckBox',
  'WebToggle',
  'WebProgressBar',
  'WebIcon',
  'WebMenu',
  'WebComboBox',
  'WebImage',
  'WebListBox',
  'WebDataGrid',
  'WebCharts',
  'WebRepeatingGroup',
  'WebPopup',
  'WebApiClient',
  'WebTimer',
  'WebFileUpload',
  'WebVideoUpload',
  'WebVideoPlayer',
  'WebReportBuilder',
] as const;

export type MvpComponentType = (typeof MVP_COMPONENT_TYPES)[number];

const mvpComponentDefinitions: readonly ComponentDefinition[] = [
  webPage,
  webPanel,
  webGroup,
  webReusableElement,
  webLabel,
  webHtml,
  webEdit,
  webTextArea,
  webButton,
  webCheckBox,
  webToggle,
  webProgressBar,
  webIcon,
  createWebMenuDefinition(geometryProperties({ width: 288, height: 640 })),
  webComboBox,
  webImage,
  webListBox,
  webDataGrid,
  createWebChartsDefinition(geometryProperties({ width: 480, height: 320 })),
  webRepeatingGroup,
  webPopup,
  webApiClient,
  webTimer,
  webFileUpload,
  webVideoUpload,
  webVideoPlayer,
  webReportBuilder,
];

componentRegistry.registerMany(
  mvpComponentDefinitions.map((definition) => ({
    ...definition,
    properties: [
      ...definition.properties,
      ...(definition.visual ? [CURRENT_ROW_BINDINGS_PROPERTY] : []),
    ].map(organizeInspectorProperty),
  })),
);

/** Frozen canonical metadata as registered, safe to share across IDE consumers. */
export const MVP_COMPONENT_DEFINITIONS: readonly ComponentDefinition[] = componentRegistry.list();

export const defaultComponentRegistry = componentRegistry;

export function createMvpComponentRegistry(): ComponentRegistry {
  return new ComponentRegistry(MVP_COMPONENT_DEFINITIONS);
}

export function getComponentDefinition(type: string): ComponentDefinition | undefined {
  return componentRegistry.get(type);
}

export function requireComponentDefinition(type: string): ComponentDefinition {
  return componentRegistry.require(type);
}

export function getNextComponentName(
  type: string,
  existing?: Iterable<string | { readonly name: string }>,
): string {
  return componentRegistry.suggestName(type, existing);
}
