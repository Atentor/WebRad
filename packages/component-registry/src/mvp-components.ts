import { componentRegistry, ComponentRegistry } from './registry.js';
import type {
  ComponentDefinition,
  ComponentEventDefinition,
  ComponentPropertyDefinition,
  DefaultComponentBounds,
} from './types.js';

const standardCategory = 'Standard';
const containersCategory = 'Containers';
const nonvisualCategory = 'Nonvisual';

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
    {
      name: 'visible',
      label: 'Visible',
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

function event(name: string, category = 'Behavior'): ComponentEventDefinition {
  return { name, label: name, category };
}

const formBounds = { width: 800, height: 600 } as const;
const panelBounds = { width: 240, height: 160 } as const;
const labelBounds = { width: 80, height: 24 } as const;
const editBounds = { width: 160, height: 32 } as const;
const textAreaBounds = { width: 240, height: 96 } as const;
const buttonBounds = { width: 100, height: 32 } as const;
const checkBoxBounds = { width: 120, height: 24 } as const;
const comboBoxBounds = { width: 160, height: 32 } as const;
const imageBounds = { width: 160, height: 120 } as const;
const listBoxBounds = { width: 180, height: 120 } as const;
const apiClientBounds = { width: 112, height: 52 } as const;

const webForm: ComponentDefinition = {
  type: 'WebForm',
  displayName: 'Form',
  namePrefix: 'Form',
  palette: { category: containersCategory, caption: 'Form' },
  icon: 'component-form',
  visual: true,
  canHaveChildren: true,
  defaultEvent: 'OnCreate',
  defaultBounds: formBounds,
  defaults: {
    caption: 'Form',
    visible: true,
    enabled: true,
    backgroundColor: '#ffffff',
  },
  properties: [
    ...geometryProperties(formBounds),
    captionProperty('Form'),
    {
      name: 'layoutMode',
      label: 'Layout',
      type: 'enum',
      category: 'Layout',
      source: 'form',
      defaultValue: 'absolute',
      options: ['absolute'],
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
  events: [event('OnCreate'), event('OnShow'), event('OnHide'), event('OnResize')],
};

const webPanel: ComponentDefinition = {
  type: 'WebPanel',
  displayName: 'Panel',
  namePrefix: 'Panel',
  palette: { category: containersCategory, caption: 'Panel' },
  icon: 'component-panel',
  visual: true,
  canHaveChildren: true,
  defaultEvent: 'OnClick',
  defaultBounds: panelBounds,
  defaults: {
    caption: '',
    visible: true,
    enabled: true,
    backgroundColor: 'transparent',
    borderColor: '#808080',
  },
  properties: [
    ...geometryProperties(panelBounds),
    captionProperty(''),
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

const webLabel: ComponentDefinition = {
  type: 'WebLabel',
  displayName: 'Label',
  namePrefix: 'Label',
  palette: { category: standardCategory, caption: 'Label' },
  icon: 'component-label',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: labelBounds,
  defaults: {
    caption: 'Label',
    visible: true,
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

const webEdit: ComponentDefinition = {
  type: 'WebEdit',
  displayName: 'Edit',
  namePrefix: 'Edit',
  palette: { category: standardCategory, caption: 'Edit' },
  icon: 'component-edit',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: editBounds,
  defaults: {
    value: '',
    placeholder: '',
    readOnly: false,
    visible: true,
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
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: textAreaBounds,
  defaults: {
    value: '',
    placeholder: '',
    readOnly: false,
    rows: 4,
    visible: true,
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
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: buttonBounds,
  defaults: {
    caption: 'Button',
    visible: true,
    enabled: true,
    tabIndex: 0,
  },
  properties: [...geometryProperties(buttonBounds), tabIndexProperty(), captionProperty('Button')],
  events: [
    event('OnClick'),
    event('OnFocus'),
    event('OnBlur'),
    event('OnMouseEnter', 'Mouse'),
    event('OnMouseLeave', 'Mouse'),
  ],
};

const webCheckBox: ComponentDefinition = {
  type: 'WebCheckBox',
  displayName: 'Check Box',
  namePrefix: 'CheckBox',
  palette: { category: standardCategory, caption: 'Check Box' },
  icon: 'component-check-box',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: checkBoxBounds,
  defaults: {
    caption: 'Check Box',
    checked: false,
    visible: true,
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

const webComboBox: ComponentDefinition = {
  type: 'WebComboBox',
  displayName: 'Combo Box',
  namePrefix: 'ComboBox',
  palette: { category: standardCategory, caption: 'Combo Box' },
  icon: 'component-combo-box',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: comboBoxBounds,
  defaults: {
    items: [],
    selectedIndex: -1,
    value: '',
    visible: true,
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
  canHaveChildren: false,
  defaultEvent: 'OnClick',
  defaultBounds: imageBounds,
  defaults: {
    src: '',
    alt: '',
    objectFit: 'contain',
    visible: true,
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

const webListBox: ComponentDefinition = {
  type: 'WebListBox',
  displayName: 'List Box',
  namePrefix: 'ListBox',
  palette: { category: standardCategory, caption: 'List Box' },
  icon: 'component-list-box',
  visual: true,
  canHaveChildren: false,
  defaultEvent: 'OnChange',
  defaultBounds: listBoxBounds,
  defaults: {
    items: [],
    selectedIndex: -1,
    multiple: false,
    visible: true,
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

const webApiClient: ComponentDefinition = {
  type: 'WebApiClient',
  displayName: 'API Client',
  namePrefix: 'ApiClient',
  palette: { category: nonvisualCategory, caption: 'API Client' },
  icon: 'component-api-client',
  visual: false,
  canHaveChildren: false,
  defaultEvent: null,
  // Nonvisual nodes still carry model bounds for format compatibility. The Designer
  // projects them into its tray instead of interpreting these as canvas geometry.
  defaultBounds: apiClientBounds,
  defaults: {
    baseUrl: '',
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
    },
  ],
  events: [],
};

export const MVP_COMPONENT_TYPES = [
  'WebForm',
  'WebPanel',
  'WebLabel',
  'WebEdit',
  'WebTextArea',
  'WebButton',
  'WebCheckBox',
  'WebComboBox',
  'WebImage',
  'WebListBox',
  'WebApiClient',
] as const;

export type MvpComponentType = (typeof MVP_COMPONENT_TYPES)[number];

const mvpComponentDefinitions: readonly ComponentDefinition[] = [
  webForm,
  webPanel,
  webLabel,
  webEdit,
  webTextArea,
  webButton,
  webCheckBox,
  webComboBox,
  webImage,
  webListBox,
  webApiClient,
];

componentRegistry.registerMany(mvpComponentDefinitions);

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
