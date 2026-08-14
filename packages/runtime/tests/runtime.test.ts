// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  WEBRAD_COMPONENT_CSS,
  WebApiClient,
  WebApiError,
  WebButton,
  WebCheckBox,
  WebComboBox,
  WebEdit,
  WebForm,
  WebImage,
  WebLabel,
  WebListBox,
  WebNonvisualComponent,
  WebPanel,
  WebTextArea,
  mountForm,
  projectComponentVisual,
  runtimeEventName,
  type RuntimeFormModel,
} from '../src/index.js';

const formModel: RuntimeFormModel = {
  id: 'form-model',
  name: 'FrmMain',
  caption: 'Main form',
  width: 640,
  height: 480,
  layoutMode: 'absolute',
  rootComponentId: 'form-root',
  components: [
    {
      id: 'form-root',
      type: 'WebForm',
      name: 'FrmMain',
      parentId: null,
      bounds: { x: 0, y: 0, width: 640, height: 480 },
      props: { caption: 'Main form', visible: true, enabled: true },
      children: ['edit-name', 'button-show'],
    },
    {
      id: 'edit-name',
      type: 'WebEdit',
      name: 'EDTNome',
      parentId: 'form-root',
      bounds: { x: 16, y: 16, width: 180, height: 32 },
      props: { value: '', placeholder: 'Nome', visible: true, enabled: true },
      children: [],
    },
    {
      id: 'button-show',
      type: 'WebButton',
      name: 'BTNMostrar',
      parentId: 'form-root',
      bounds: { x: 16, y: 64, width: 100, height: 32 },
      props: { caption: 'Mostrar', visible: true, enabled: true },
      children: [],
    },
  ],
};

const inspectorPropertyFormModel: RuntimeFormModel = {
  id: 'property-form',
  name: 'FrmProperties',
  caption: 'Runtime properties',
  width: 720,
  height: 540,
  layoutMode: 'absolute',
  rootComponentId: 'property-root',
  components: [
    {
      id: 'property-root',
      type: 'WebForm',
      name: 'FrmProperties',
      parentId: null,
      bounds: { x: 0, y: 0, width: 720, height: 540 },
      props: {
        caption: 'Runtime properties',
        visible: true,
        enabled: true,
        backgroundColor: 'white',
      },
      children: [
        'property-panel',
        'property-label',
        'property-edit',
        'property-textarea',
        'property-button',
        'property-checkbox',
        'property-combo',
        'property-image',
        'property-list',
      ],
    },
    {
      id: 'property-panel',
      type: 'WebPanel',
      name: 'PanelDetails',
      parentId: 'property-root',
      bounds: { x: 10, y: 12, width: 300, height: 180 },
      props: {
        caption: 'Details',
        visible: true,
        enabled: true,
        backgroundColor: 'silver',
        borderColor: 'navy',
      },
      children: [],
    },
    {
      id: 'property-label',
      type: 'WebLabel',
      name: 'LabelName',
      parentId: 'property-root',
      bounds: { x: 20, y: 210, width: 90, height: 24 },
      props: {
        caption: 'Customer',
        color: 'purple',
        autoSize: true,
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-edit',
      type: 'WebEdit',
      name: 'EditEmail',
      parentId: 'property-root',
      bounds: { x: 120, y: 210, width: 200, height: 32 },
      props: {
        value: 'ada@example.test',
        placeholder: 'Email',
        readOnly: true,
        inputType: 'email',
        tabIndex: 2,
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-textarea',
      type: 'WebTextArea',
      name: 'TextNotes',
      parentId: 'property-root',
      bounds: { x: 20, y: 255, width: 220, height: 100 },
      props: {
        value: 'Notes',
        placeholder: 'Notes',
        readOnly: false,
        rows: 6,
        tabIndex: 3,
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-button',
      type: 'WebButton',
      name: 'ButtonSave',
      parentId: 'property-root',
      bounds: { x: 260, y: 255, width: 110, height: 32 },
      props: { caption: 'Save', tabIndex: 4, visible: true, enabled: true },
      children: [],
    },
    {
      id: 'property-checkbox',
      type: 'WebCheckBox',
      name: 'CheckActive',
      parentId: 'property-root',
      bounds: { x: 260, y: 300, width: 120, height: 24 },
      props: {
        caption: 'Active',
        checked: true,
        tabIndex: 5,
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-combo',
      type: 'WebComboBox',
      name: 'ComboRole',
      parentId: 'property-root',
      bounds: { x: 400, y: 210, width: 160, height: 32 },
      props: {
        items: ['Admin', 'User'],
        selectedIndex: 1,
        value: '',
        tabIndex: 6,
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-image',
      type: 'WebImage',
      name: 'ImageAvatar',
      parentId: 'property-root',
      bounds: { x: 400, y: 255, width: 100, height: 100 },
      props: {
        src: '',
        alt: 'Avatar',
        objectFit: 'cover',
        visible: true,
        enabled: true,
      },
      children: [],
    },
    {
      id: 'property-list',
      type: 'WebListBox',
      name: 'ListPermissions',
      parentId: 'property-root',
      bounds: { x: 520, y: 255, width: 170, height: 120 },
      props: {
        items: ['Read', 'Write'],
        selectedIndex: 1,
        multiple: true,
        tabIndex: 7,
        visible: true,
        enabled: true,
      },
      children: [],
    },
  ],
};

describe('browser runtime', () => {
  it('mounts the real DOM hierarchy and exposes functional component wrappers', () => {
    const mounted = mountForm(formModel);
    const edit = new WebEdit(mounted.form.requireComponentElement('edit-name'));
    const button = new WebButton(mounted.form.requireComponentElement('button-show'));
    const clicks: string[] = [];

    edit.value = 'Ada';
    button.onClick = () => {
      clicks.push(edit.value);
    };
    button.click();

    expect(mounted.element.dataset.webradFormId).toBe('form-model');
    expect(button.element.classList.contains('wr-component')).toBe(true);
    expect(button.element.classList.contains('wr-webbutton')).toBe(true);
    expect(button.element.style.width).toBe('100px');
    expect(button.enabled).toBe(true);
    expect(edit.value).toBe('Ada');
    expect(clicks).toEqual(['Ada']);
    mounted.form.close();
    expect(mounted.form.visible).toBe(false);
    mounted.form.show();
    expect(mounted.form.visible).toBe(true);
  });

  it('wires generated handler names to user methods', () => {
    class TestForm extends WebForm {
      public readonly button = new WebButton(this.requireComponentElement('button-show'));
      public calls = 0;

      public constructor(element: HTMLElement) {
        super(element);
        this.bindGeneratedEvent(this.button, 'OnClick', 'BTNMostrarClick');
      }

      public BTNMostrarClick(): void {
        this.calls += 1;
      }
    }

    const mounted = mountForm(formModel);
    const form = new TestForm(mounted.element);
    form.button.click();
    expect(form.calls).toBe(1);
  });

  it('provides functional wrappers for every initial visual control', () => {
    const labelElement = document.createElement('span');
    const label = new WebLabel(labelElement);
    label.caption = 'Name';

    const textAreaElement = document.createElement('textarea');
    const textArea = new WebTextArea(textAreaElement);
    textArea.value = 'notes';
    textArea.clear();

    const checkboxElement = document.createElement('label');
    const checkboxInput = document.createElement('input');
    checkboxInput.type = 'checkbox';
    checkboxElement.append(checkboxInput);
    const checkbox = new WebCheckBox(checkboxElement);
    checkbox.checked = true;

    const comboElement = document.createElement('select');
    const combo = new WebComboBox(comboElement);
    combo.items = ['one', { value: '2', label: 'two' }];
    combo.value = '2';

    const image = new WebImage(document.createElement('img'));
    image.alt = 'Portrait';

    const listElement = document.createElement('select');
    listElement.multiple = true;
    const list = new WebListBox(listElement);
    list.items = ['A', 'B'];
    list.selectedValues = ['B'];

    const panel = new WebPanel(document.createElement('div'));
    panel.visible = false;

    expect(label.text).toBe('Name');
    expect(textArea.value).toBe('');
    expect(checkbox.checked).toBe(true);
    expect(combo.items).toHaveLength(2);
    expect(combo.value).toBe('2');
    expect(image.alt).toBe('Portrait');
    expect(list.selectedValues).toEqual(['B']);
    expect(panel.visible).toBe(false);
  });

  it('exposes Inspector properties as direct DOM-backed runtime properties', () => {
    const buttonElement = document.createElement('button');
    buttonElement.dataset.webradId = 'button-save';
    buttonElement.dataset.webradName = 'BTNSave';
    const button = new WebButton(buttonElement);
    button.x = 12;
    button.y = 24;
    button.width = 128;
    button.height = 36;
    button.tabIndex = 4;
    button.backgroundColor = 'red';
    button.color = 'white';
    button.borderColor = 'blue';
    button.visible = false;
    button.enabled = false;

    expect(button).toMatchObject({
      id: 'button-save',
      name: 'BTNSave',
      x: 12,
      y: 24,
      width: 128,
      height: 36,
      tabIndex: 4,
      backgroundColor: 'red',
      color: 'white',
      borderColor: 'blue',
      visible: false,
      enabled: false,
    });
    expect(buttonElement.style.left).toBe('12px');
    expect(buttonElement.style.top).toBe('24px');
    expect(buttonElement.disabled).toBe(true);
    expect(() => {
      button.width = Number.POSITIVE_INFINITY;
    }).toThrow(RangeError);

    const panel = new WebPanel(document.createElement('section'));
    panel.caption = 'Customer details';
    expect(panel.caption).toBe('Customer details');
    expect(panel.element.getAttribute('aria-label')).toBe('Customer details');

    const form = new WebForm(document.createElement('section'));
    form.caption = 'Customers';
    form.layoutMode = 'grid';
    expect(form.caption).toBe('Customers');
    expect(form.layoutMode).toBe('grid');
    expect(form.element.dataset.webradLayout).toBe('grid');
    expect(form.element.style.display).toBe('grid');
    form.layoutMode = 'absolute';
    expect(form.element.style.display).toBe('');

    const label = new WebLabel(document.createElement('span'));
    label.width = 80;
    label.height = 24;
    label.autoSize = true;
    expect(label.autoSize).toBe(true);
    expect(label.element.style.width).toBe('fit-content');
    expect(label.element.style.height).toBe('fit-content');
    label.autoSize = false;
    expect(label.width).toBe(80);
    expect(label.height).toBe(24);

    const edit = new WebEdit(document.createElement('input'));
    edit.inputType = 'email';
    expect(edit.inputType).toBe('email');
    expect(edit.element.type).toBe('email');

    const textArea = new WebTextArea(document.createElement('textarea'));
    textArea.rows = 7;
    expect(textArea.rows).toBe(7);
    expect(textArea.element.rows).toBe(7);

    const image = new WebImage(document.createElement('img'));
    image.objectFit = 'cover';
    expect(image.objectFit).toBe('cover');
    expect(image.element.style.objectFit).toBe('cover');

    const list = new WebListBox(document.createElement('select'));
    list.items = ['One', 'Two'];
    list.selectedIndex = 1;
    list.multiple = true;
    expect(list.selectedIndex).toBe(1);
    expect(list.multiple).toBe(true);
    expect(list.element.multiple).toBe(true);
  });

  it('projects every MVP visual Inspector property through the runtime adapters', () => {
    const mounted = mountForm(inspectorPropertyFormModel);
    const element = (id: string): HTMLElement => mounted.form.requireComponentElement(id);
    const form = mounted.form;
    const panel = new WebPanel(element('property-panel'));
    const label = new WebLabel(element('property-label'));
    const edit = new WebEdit(element('property-edit'));
    const textArea = new WebTextArea(element('property-textarea'));
    const button = new WebButton(element('property-button'));
    const checkBox = new WebCheckBox(element('property-checkbox'));
    const combo = new WebComboBox(element('property-combo'));
    const image = new WebImage(element('property-image'));
    const list = new WebListBox(element('property-list'));

    expect(form).toMatchObject({
      name: 'FrmProperties',
      caption: 'Runtime properties',
      width: 720,
      height: 540,
      layoutMode: 'absolute',
      visible: true,
      enabled: true,
      backgroundColor: 'white',
    });
    expect(panel).toMatchObject({
      id: 'property-panel',
      name: 'PanelDetails',
      caption: 'Details',
      x: 10,
      y: 12,
      width: 300,
      height: 180,
      backgroundColor: 'silver',
      borderColor: 'navy',
    });
    expect(panel.element.dataset.webradCaption).toBe('Details');
    expect(label).toMatchObject({ caption: 'Customer', color: 'purple', autoSize: true });
    expect(edit).toMatchObject({
      value: 'ada@example.test',
      placeholder: 'Email',
      readOnly: true,
      inputType: 'email',
      tabIndex: 2,
    });
    expect(textArea).toMatchObject({
      value: 'Notes',
      placeholder: 'Notes',
      readOnly: false,
      rows: 6,
      tabIndex: 3,
    });
    expect(button).toMatchObject({ caption: 'Save', tabIndex: 4 });
    expect(checkBox).toMatchObject({ caption: 'Active', checked: true, tabIndex: 5 });
    expect(combo).toMatchObject({ value: 'User', selectedIndex: 1, tabIndex: 6 });
    expect(combo.items.map(({ value }) => value)).toEqual(['Admin', 'User']);
    expect(image).toMatchObject({ alt: 'Avatar', objectFit: 'cover' });
    expect(list).toMatchObject({
      value: 'Write',
      selectedIndex: 1,
      multiple: true,
      tabIndex: 7,
    });
    expect(list.items.map(({ value }) => value)).toEqual(['Read', 'Write']);
  });

  it('projects the shared camelCase visual properties without framework dependencies', () => {
    const projection = projectComponentVisual({
      type: 'WebButton',
      bounds: { width: 120, height: 36 },
      props: {
        backgroundColor: '#112233',
        borderColor: '#445566',
        color: '#ffffff',
        enabled: false,
        tabIndex: 3,
        title: 'Run',
        visible: false,
      },
    });

    expect(projection).toMatchObject({
      classNames: ['wr-component', 'wr-webbutton'],
      enabled: false,
      visible: false,
      tabIndex: 3,
      title: 'Run',
      style: {
        width: '120px',
        height: '36px',
        backgroundColor: '#112233',
        borderColor: '#445566',
        color: '#ffffff',
      },
    });
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-component[hidden]');
    expect(runtimeEventName('OnCUSTOM')).toBe('custom');
  });
});

describe('WebApiClient', () => {
  it('performs JSON requests through fetch and decodes responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://api.example.test/v1/customers?page=2');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
      expect(init?.body).toBe('{"name":"Ada"}');
      return new Response('{"id":10,"name":"Ada"}', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });
    const api = new WebApiClient({
      id: 'api-customers',
      name: 'ApiCustomers',
      baseUrl: 'https://old.example.test',
      fetch: fetchMock,
    });
    api.baseUrl = 'https://api.example.test/v1';

    await expect(
      api.post<{ id: number; name: string }>('/customers', { name: 'Ada' }, { query: { page: 2 } }),
    ).resolves.toEqual({ id: 10, name: 'Ada' });
    expect(api.id).toBe('api-customers');
    expect(api.name).toBe('ApiCustomers');
    expect(api.baseUrl).toBe('https://api.example.test/v1');
    expect(api).toBeInstanceOf(WebNonvisualComponent);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws a structured error for a non-success response', async () => {
    const api = new WebApiClient({
      fetch: async () =>
        new Response('{"message":"denied"}', {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'content-type': 'application/json' },
        }),
    });

    const request = api.get('/private');
    await expect(request).rejects.toBeInstanceOf(WebApiError);
    await expect(request).rejects.toMatchObject({ status: 403, body: { message: 'denied' } });
  });
});
