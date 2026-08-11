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
    const api = new WebApiClient({ baseUrl: 'https://api.example.test/v1', fetch: fetchMock });

    await expect(
      api.post<{ id: number; name: string }>('/customers', { name: 'Ada' }, { query: { page: 2 } }),
    ).resolves.toEqual({ id: 10, name: 'Ada' });
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
