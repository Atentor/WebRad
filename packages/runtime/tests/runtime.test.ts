// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  WEBRAD_COMPONENT_CSS,
  WebApiClient,
  WebApiError,
  WebApiTimeoutError,
  WebButton,
  WebCheckBox,
  WebComboBox,
  WebDataGrid,
  WebEdit,
  WebPage,
  WebImage,
  WebLabel,
  WebListBox,
  WebNonvisualComponent,
  WebPanel,
  WebPopup,
  WebPageRouter,
  WebReusableElementInstance,
  WebTextArea,
  bindRuntimeFitContent,
  expandReusableElements,
  measureRuntimeFitContentSize,
  mountPage,
  normalizeWebDataGridConfiguration,
  projectComponentVisual,
  projectRuntimeLayout,
  resolveComponentStyleClassName,
  resolveComponentStyleClassNames,
  resolveComponentStylePreviewClassName,
  resolveStylePropertyCandidate,
  runtimeEventName,
  tokenizeTailwindClasses,
  type RuntimeComponentLayout,
  type RuntimeComponentNode,
  type WebDataGridCellEventDetail,
  type WebDataGridConfiguration,
  type RuntimePageModel,
} from '../src/index.js';
import { resolveDataGridColumnTrackWidths } from '../src/visual.js';

function responsiveLayout(
  container: Partial<RuntimeComponentLayout['container']> = {},
  item: Partial<RuntimeComponentLayout['item']> = {},
): RuntimeComponentLayout {
  return {
    container: {
      mode: 'fixed',
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      gap: 0,
      wrap: false,
      justifyContent: 'start',
      alignItems: 'start',
      ...container,
    },
    item: {
      width: 'fixed',
      height: 'fixed',
      minWidth: 0,
      maxWidth: null,
      minHeight: 0,
      maxHeight: null,
      grow: 0,
      shrink: true,
      horizontalAnchor: 'start',
      verticalAnchor: 'start',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      ...item,
    },
  };
}

type RuntimeNodeWithoutLayout = Omit<RuntimeComponentNode, 'layout'>;
type RuntimePageWithoutNodeLayouts = Omit<RuntimePageModel, 'components'> & {
  readonly components: readonly RuntimeNodeWithoutLayout[];
};

function withDefaultLayouts(model: RuntimePageWithoutNodeLayouts): RuntimePageModel {
  return {
    ...model,
    components: model.components.map((component) => ({
      ...component,
      layout: responsiveLayout(),
    })),
  };
}

const pageModel = withDefaultLayouts({
  id: 'page-model',
  name: 'PageMain',
  caption: 'Main page',
  width: 640,
  height: 480,
  rootComponentId: 'page-root',
  components: [
    {
      id: 'page-root',
      type: 'WebPage',
      name: 'PageMain',
      parentId: null,
      bounds: { x: 0, y: 0, width: 640, height: 480 },
      props: { caption: 'Main page', visible: true, enabled: true },
      children: ['edit-name', 'button-show'],
    },
    {
      id: 'edit-name',
      type: 'WebEdit',
      name: 'EDTNome',
      parentId: 'page-root',
      bounds: { x: 16, y: 16, width: 180, height: 32 },
      props: { value: '', placeholder: 'Nome', visible: true, enabled: true },
      children: [],
    },
    {
      id: 'button-show',
      type: 'WebButton',
      name: 'BTNMostrar',
      parentId: 'page-root',
      bounds: { x: 16, y: 64, width: 100, height: 32 },
      props: { caption: 'Mostrar', visible: true, enabled: true },
      children: [],
    },
  ],
});

function navigationPageModel(
  id: string,
  name: string,
  child: RuntimeNodeWithoutLayout,
): RuntimePageModel {
  const rootComponentId = `${id}-root`;
  return withDefaultLayouts({
    id,
    name,
    caption: name,
    width: 480,
    height: 320,
    rootComponentId,
    components: [
      {
        id: rootComponentId,
        type: 'WebPage',
        name,
        parentId: null,
        bounds: { x: 0, y: 0, width: 480, height: 320 },
        props: { caption: name, visible: true, enabled: true },
        children: [child.id],
      },
      { ...child, parentId: rootComponentId },
    ],
  });
}

const inspectorPropertyPageModel = withDefaultLayouts({
  id: 'property-page',
  name: 'PageProperties',
  caption: 'Runtime properties',
  width: 720,
  height: 540,
  rootComponentId: 'property-root',
  components: [
    {
      id: 'property-root',
      type: 'WebPage',
      name: 'PageProperties',
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
});

describe('browser runtime', () => {
  it('projects saved margins and exposes a finite pixel API without resetting legacy style margins', () => {
    const node = pageModel.components.find((component) => component.type === 'WebButton');
    if (node === undefined) throw new Error('Missing button fixture.');
    expect(projectComponentVisual(node).style.margin).toBeUndefined();
    expect(
      projectComponentVisual({
        ...node,
        props: { margin: 12, marginTop: 3, marginLeft: 0, marginRight: Infinity },
      }).style,
    ).toMatchObject({ margin: '12px', marginTop: '3px', marginLeft: '0px' });
    expect(
      projectComponentVisual({ ...node, props: { marginTop: 3 } }).style.margin,
    ).toBeUndefined();
    for (const value of [12, 0, -4, 1.5]) {
      expect(
        projectComponentVisual({ ...node, props: { ...node.props, margin: value } }).style.margin,
      ).toBe(`${String(value)}px`);
    }
    for (const value of [NaN, Infinity, '12px']) {
      expect(
        projectComponentVisual({ ...node, props: { margin: value } }).style.margin,
      ).toBeUndefined();
    }
    const mounted = mountPage({
      ...pageModel,
      components: pageModel.components.map((component) =>
        component.id === node.id
          ? { ...component, props: { ...component.props, margin: 12 }, styleClassName: 'mt-8' }
          : component,
      ),
    });
    const button = mounted.components.get(node.id);
    if (button === undefined) throw new Error('Missing mounted button.');
    expect(button.margin).toBe(12);
    button.margin = 6.5;
    expect(button.element.style.margin).toBe('6.5px');
    expect(() => {
      button.margin = Infinity;
    }).toThrow(RangeError);
    expect(button.margin).toBe(6.5);
    button.margin = 0;
    expect(button.element.style.margin).toBe('0px');
    button.marginTop = -3;
    button.marginRight = 6.5;
    button.marginBottom = 9;
    button.marginLeft = 12;
    expect([button.marginTop, button.marginRight, button.marginBottom, button.marginLeft]).toEqual([
      -3, 6.5, 9, 12,
    ]);
    expect(button.element.style.margin).toBe('-3px 6.5px 9px 12px');
    expect(() => {
      button.marginLeft = NaN;
    }).toThrow();
    expect(button.marginLeft).toBe(12);
    button.margin = 4;
    expect([button.marginTop, button.marginRight, button.marginBottom, button.marginLeft]).toEqual([
      4, 4, 4, 4,
    ]);
    mounted.dispose();
  });
  it('mounts the real DOM hierarchy and exposes functional component wrappers', () => {
    const mounted = mountPage(pageModel);
    const edit = new WebEdit(mounted.page.requireComponentElement('edit-name'));
    const button = new WebButton(mounted.page.requireComponentElement('button-show'));
    const clicks: string[] = [];

    edit.value = 'Ada';
    button.onClick = () => {
      clicks.push(edit.value);
    };
    button.click();

    expect(mounted.element.dataset.webradPageId).toBe('page-model');
    expect(button.element.classList.contains('wr-component')).toBe(true);
    expect(button.element.classList.contains('wr-webbutton')).toBe(true);
    expect(button.element.style.width).toBe('100px');
    expect(button.enabled).toBe(true);
    expect(edit.value).toBe('Ada');
    expect(clicks).toEqual(['Ada']);
    mounted.page.close();
    expect(mounted.page.visible).toBe(false);
    mounted.page.show();
    expect(mounted.page.visible).toBe(true);
  });

  it('wires generated handler names to user methods', () => {
    class TestPage extends WebPage {
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

    const mounted = mountPage(pageModel);
    const page = new TestPage(mounted.element);
    page.button.click();
    expect(page.calls).toBe(1);
  });

  it('routes authored pages from a button click and releases the previous page bindings', () => {
    const firstPageModel = navigationPageModel('page-main', 'PageMain', {
      id: 'go-details',
      type: 'WebButton',
      name: 'BTNGoDetails',
      parentId: null,
      bounds: { x: 24, y: 32, width: 128, height: 36 },
      props: { caption: 'Details', visible: true, enabled: true },
      children: [],
    });
    const firstPageWithPopup: RuntimePageModel = {
      ...firstPageModel,
      components: [
        ...firstPageModel.components.map((component) =>
          component.id === firstPageModel.rootComponentId
            ? { ...component, children: [...component.children, 'page-popup'] }
            : component,
        ),
        {
          id: 'page-popup',
          type: 'WebPopup',
          name: 'Popup1',
          parentId: firstPageModel.rootComponentId,
          layout: responsiveLayout(),
          bounds: { x: 0, y: 0, width: 360, height: 200 },
          props: {
            modal: true,
            visible: false,
            collapseWhenHidden: true,
            enabled: true,
          },
          children: [],
        },
      ],
    };
    const secondPageModel = navigationPageModel('page-details', 'PageDetails', {
      id: 'details-label',
      type: 'WebLabel',
      name: 'LBLDetails',
      parentId: null,
      bounds: { x: 24, y: 32, width: 200, height: 28 },
      props: { caption: 'Details page', visible: true, enabled: true },
      children: [],
    });
    const lifecycle: string[] = [];

    class PageMain extends WebPage {
      public readonly goDetails: WebButton;
      public readonly popup: WebPopup;

      public constructor(element: HTMLElement) {
        super(element);
        this.goDetails = new WebButton(this.requireComponentElement('go-details'));
        this.popup = new WebPopup(this.requireComponentElement('page-popup'));
        this.bindGeneratedEvent(this, 'OnCreate', 'PageMainCreate');
        this.bindGeneratedEvent(this, 'OnShow', 'PageMainShow');
        this.bindGeneratedEvent(this, 'OnHide', 'PageMainHide');
        this.bindGeneratedEvent(this.goDetails, 'OnClick', 'BTNGoDetailsClick');
      }

      public PageMainCreate(): void {
        lifecycle.push('main:create');
      }

      public PageMainShow(): void {
        lifecycle.push('main:show');
      }

      public PageMainHide(): void {
        lifecycle.push('main:hide');
      }

      public BTNGoDetailsClick(): void {
        router.navigate('page-details');
      }
    }

    class PageDetails extends WebPage {
      public constructor(element: HTMLElement) {
        super(element);
        this.bindGeneratedEvent(this, 'OnCreate', 'PageDetailsCreate');
        this.bindGeneratedEvent(this, 'OnShow', 'PageDetailsShow');
      }

      public PageDetailsCreate(): void {
        lifecycle.push('details:create');
      }

      public PageDetailsShow(): void {
        lifecycle.push('details:show');
      }
    }

    const host = document.createElement('main');
    document.body.append(host);
    const router = new WebPageRouter(
      [
        {
          id: firstPageWithPopup.id,
          name: firstPageWithPopup.name,
          model: firstPageWithPopup,
          createPage: (element) => new PageMain(element),
        },
        {
          id: secondPageModel.id,
          name: secondPageModel.name,
          model: secondPageModel,
          createPage: (element) => new PageDetails(element),
        },
      ],
      host,
    );

    const main = router.navigate('PageMain') as PageMain;
    expect(host.querySelector('[data-webrad-page-id="page-main"]')).not.toBeNull();
    main.popup.show();
    expect(main.popup.open).toBe(true);
    main.goDetails.click();

    expect(router.activeRoute?.id).toBe('page-details');
    expect(main.popup.open).toBe(false);
    expect(host.querySelector('[data-webrad-page-id="page-main"]')).toBeNull();
    expect(host.querySelector('[data-webrad-page-id="page-details"]')).not.toBeNull();
    expect(lifecycle).toEqual([
      'main:create',
      'main:show',
      'main:hide',
      'details:create',
      'details:show',
    ]);
    expect(router.findRoute('page-main')?.name).toBe('PageMain');
    expect(() => router.navigate('MissingPage')).toThrow('No WebRAD page route matches');

    router.dispose();
    expect(host.childElementCount).toBe(0);
    host.remove();
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
      collapseWhenHidden: true,
      enabled: false,
    });
    expect(buttonElement.style.left).toBe('12px');
    expect(buttonElement.style.top).toBe('24px');
    expect(buttonElement.hidden).toBe(true);
    expect(buttonElement.style.display).toBe('none');
    expect(buttonElement.disabled).toBe(true);

    button.collapseWhenHidden = false;
    expect(button.visible).toBe(false);
    expect(button.collapseWhenHidden).toBe(false);
    expect(buttonElement.hidden).toBe(false);
    expect(buttonElement.style.display).toBe('');
    expect(buttonElement.style.visibility).toBe('hidden');
    expect(buttonElement.getAttribute('aria-hidden')).toBe('true');
    button.visible = true;
    expect(buttonElement.style.visibility).toBe('');
    expect(buttonElement.getAttribute('aria-hidden')).toBe('false');
    expect(() => {
      button.width = Number.POSITIVE_INFINITY;
    }).toThrow(RangeError);

    const panel = new WebPanel(document.createElement('section'));
    panel.caption = 'Customer details';
    expect(panel.caption).toBe('Customer details');
    expect(panel.element.getAttribute('aria-label')).toBe('Customer details');

    const page = new WebPage(document.createElement('section'));
    page.caption = 'Customers';
    page.layoutMode = 'column';
    expect(page.caption).toBe('Customers');
    expect(page.layoutMode).toBe('column');
    expect(page.element.dataset.webradLayout).toBe('column');
    expect(page.element.style.display).toBe('flex');
    expect(page.element.style.flexDirection).toBe('column');
    page.layoutMode = 'fixed';
    expect(page.element.style.display).toBe('');

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
    const mounted = mountPage(inspectorPropertyPageModel);
    const element = (id: string): HTMLElement => mounted.page.requireComponentElement(id);
    const page = mounted.page;
    const panel = new WebPanel(element('property-panel'));
    const label = new WebLabel(element('property-label'));
    const edit = new WebEdit(element('property-edit'));
    const textArea = new WebTextArea(element('property-textarea'));
    const button = new WebButton(element('property-button'));
    const checkBox = new WebCheckBox(element('property-checkbox'));
    const combo = new WebComboBox(element('property-combo'));
    const image = new WebImage(element('property-image'));
    const list = new WebListBox(element('property-list'));

    expect(page).toMatchObject({
      name: 'PageProperties',
      caption: 'Runtime properties',
      layoutMode: 'fixed',
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
        collapseWhenHidden: false,
        tabIndex: 3,
        title: 'Run',
        visible: false,
      },
    });

    expect(projection).toMatchObject({
      classNames: [
        'wr-component',
        'wr-webbutton',
        'wr-button-content-text-icon',
        'wr-button-icon-left',
      ],
      enabled: false,
      collapseWhenHidden: false,
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

  it('projects fixed, anchored and flow layout rules as browser-native CSS', () => {
    const anchoredParent = responsiveLayout({ mode: 'align-to-parent' });
    const anchored = {
      type: 'WebButton',
      bounds: { x: -12, y: 8, width: 120, height: 32 },
      layout: responsiveLayout(
        {},
        {
          width: 'stretch',
          height: 'fixed',
          horizontalAnchor: 'stretch',
          verticalAnchor: 'end',
          left: 12,
          right: 20,
          bottom: 8,
          minWidth: 64,
          maxWidth: 480,
        },
      ),
    };
    const anchoredProjection = projectRuntimeLayout(anchored, anchoredParent.container);
    expect(anchoredProjection.item).toMatchObject({
      position: 'absolute',
      left: '12px',
      right: '20px',
      bottom: '8px',
      height: '32px',
      'min-width': '64px',
      'max-width': '480px',
    });
    expect(anchoredProjection.item.width).toBeUndefined();

    const responsiveReusableInFixedContainer = {
      type: 'WebReusableElement',
      bounds: { x: 24, y: 36, width: 240, height: 96 },
      layout: responsiveLayout(
        {},
        { width: 'stretch', height: 'fit-content', right: 20, bottom: 12 },
      ),
      props: { reusableElementId: 'customer-card', placement: 'in-flow' },
    };
    const fixedReusableProjection = projectRuntimeLayout(responsiveReusableInFixedContainer);
    expect(fixedReusableProjection.item).toMatchObject({
      position: 'absolute',
      left: '24px',
      right: '20px',
      top: '36px',
      height: 'max-content',
    });
    expect(fixedReusableProjection.item.width).toBeUndefined();
    expect(fixedReusableProjection.item.bottom).toBeUndefined();

    const rowParent = responsiveLayout({ mode: 'row', gap: 12, wrap: true });
    const flowing = {
      type: 'WebPanel',
      bounds: { x: 0, y: 0, width: 180, height: 80 },
      layout: responsiveLayout({}, { width: 'stretch', height: 'fit-content', grow: 2 }),
    };
    const flowProjection = projectRuntimeLayout(flowing, rowParent.container);
    expect(flowProjection.container).toEqual({ position: 'relative' });
    expect(flowProjection.item).toMatchObject({
      position: 'relative',
      width: 'auto',
      height: 'max-content',
      'flex-basis': '0px',
      'flex-grow': '2',
      'flex-shrink': '1',
    });

    const intrinsicFlowing = {
      type: 'WebPanel',
      bounds: { x: 0, y: 0, width: 180, height: 80 },
      layout: responsiveLayout({}, { width: 'fit-content', height: 'fixed', shrink: true }),
    };
    expect(projectRuntimeLayout(intrinsicFlowing, rowParent.container).item).toMatchObject({
      width: 'max-content',
      'flex-basis': 'max-content',
      'flex-shrink': '0',
    });
  });

  it('includes child margins when measuring fit-content, accounting for Designer zoom', () => {
    const target = document.createElement('div');
    const child = document.createElement('div');
    target.append(child);
    child.style.margin = '12px';
    const layout = responsiveLayout({}, { width: 'fit-content', height: 'fit-content' });
    for (const scale of [1, 0.75]) {
      const rect = (left: number, top: number, width: number, height: number): DOMRect =>
        ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
        rect(0, 0, 124 * scale, 64 * scale),
      );
      vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(
        rect(12 * scale, 12 * scale, 100 * scale, 40 * scale),
      );
      expect(measureRuntimeFitContentSize(target, target, layout, { scale })).toEqual({
        width: 124,
        height: 64,
      });
    }
  });

  it('measures fit-content containers around rendered children without mutating the model', async () => {
    const target = document.createElement('div');
    const child = document.createElement('div');
    target.append(child);
    const rectangle = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        width,
        height,
        top,
        right: left + width,
        bottom: top + height,
        left,
        toJSON: () => ({}),
      }) as DOMRect;
    let childWidth = 164;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rectangle(40, 30, 20, 20));
    vi.spyOn(child, 'getBoundingClientRect').mockImplementation(() =>
      rectangle(52, 46, childWidth, 52),
    );

    const layout = responsiveLayout(
      {},
      {
        width: 'fit-content',
        height: 'fit-content',
        minWidth: 180,
        maxWidth: 184,
        maxHeight: 64,
      },
    );
    expect(measureRuntimeFitContentSize(target, target, layout)).toEqual({
      width: 180,
      height: 64,
    });

    const binding = bindRuntimeFitContent(target, target, layout);
    expect(target.style.width).toBe('180px');
    expect(target.style.height).toBe('64px');
    expect(target.style.getPropertyPriority('width')).toBe('important');
    binding.dispose();
    binding.dispose();

    const dynamicBinding = bindRuntimeFitContent(
      target,
      target,
      responsiveLayout({}, { width: 'fit-content' }),
    );
    const initialWidth = Number.parseFloat(target.style.width);
    childWidth = 260;
    child.textContent = 'Updated rendered content';
    await Promise.resolve();
    await Promise.resolve();
    expect(Number.parseFloat(target.style.width)).toBeGreaterThan(initialWidth);
    dynamicBinding.dispose();
  });

  it('uses the rendered content envelope across zoom, anchors, and empty container chrome', () => {
    const target = document.createElement('div');
    const child = document.createElement('div');
    const overlay = document.createElement('div');
    target.style.padding = '3px 7px';
    target.append(child, overlay);
    document.body.append(target);
    const rectangle = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        width,
        height,
        top,
        right: left + width,
        bottom: top + height,
        left,
        toJSON: () => ({}),
      }) as DOMRect;
    const targetRect = vi
      .spyOn(target, 'getBoundingClientRect')
      .mockReturnValue(rectangle(10, 10, 0, 0));
    const childRect = vi
      .spyOn(child, 'getBoundingClientRect')
      // This is an end-anchored child in a subtree rendered at 50% zoom.
      // Its right/bottom edges meet the target start, so only an envelope
      // calculation (rather than a max edge alone) can recover its size.
      .mockReturnValue(rectangle(-40, -20, 50, 30));
    const overlayRect = vi
      .spyOn(overlay, 'getBoundingClientRect')
      .mockReturnValue(rectangle(10, 10, 500, 400));
    const layout = responsiveLayout({}, { width: 'fit-content', height: 'fit-content' });

    try {
      expect(target.ownerDocument.defaultView?.getComputedStyle(target).paddingLeft).toBe('7px');
      expect(target.ownerDocument.defaultView?.getComputedStyle(target).paddingRight).toBe('7px');
      expect(
        measureRuntimeFitContentSize(target, target, layout, {
          scale: 0.5,
          isLayoutChild: (candidate) => candidate !== overlay,
        }),
      ).toEqual({ width: 114, height: 66 });

      target.replaceChildren();
      expect(measureRuntimeFitContentSize(target, target, layout, { scale: 0.5 })).toEqual({
        width: 14,
        height: 6,
      });
    } finally {
      target.remove();
      targetRect.mockRestore();
      childRect.mockRestore();
      overlayRect.mockRestore();
    }
  });

  it('lets a page root opt into content-driven height instead of pinning the viewport', () => {
    const contentSizedPage: RuntimePageModel = {
      id: 'content-sized-page',
      name: 'ContentSizedPage',
      caption: 'Content-sized page',
      width: 800,
      height: 50,
      rootComponentId: 'content-sized-root',
      components: [
        {
          id: 'content-sized-root',
          type: 'WebPage',
          name: 'ContentSizedPage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 800, height: 50 },
          layout: responsiveLayout({}, { height: 'fit-content', minHeight: 24 }),
          props: { caption: 'Content-sized page', visible: true, enabled: true },
          children: [],
        },
      ],
    };

    const mounted = mountPage(contentSizedPage);
    expect(mounted.element.style.width).toBe('100vw');
    expect(mounted.element.style.height).toBe('max-content');
    expect(mounted.element.style.minHeight).toBe('24px');
    mounted.dispose();
  });

  it('keeps leaf controls on browser intrinsic sizing instead of measuring them as empty containers', () => {
    const page: RuntimePageModel = {
      id: 'intrinsic-leaf-page',
      name: 'IntrinsicLeafPage',
      caption: 'Intrinsic leaf page',
      width: 640,
      height: 480,
      rootComponentId: 'intrinsic-leaf-root',
      components: [
        {
          id: 'intrinsic-leaf-root',
          type: 'WebPage',
          name: 'IntrinsicLeafPage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 640, height: 480 },
          layout: responsiveLayout(),
          props: { caption: 'Intrinsic leaf page', visible: true, enabled: true },
          children: ['intrinsic-edit'],
        },
        {
          id: 'intrinsic-edit',
          type: 'WebEdit',
          name: 'IntrinsicEdit',
          parentId: 'intrinsic-leaf-root',
          bounds: { x: 16, y: 16, width: 180, height: 32 },
          layout: responsiveLayout({}, { width: 'fit-content', height: 'fit-content' }),
          props: { value: 'Do not squeeze', visible: true, enabled: true },
          children: [],
        },
      ],
    };

    const mounted = mountPage(page, document.createElement('div'));
    const edit = mounted.page.requireComponentElement('intrinsic-edit');
    expect(edit.style.width).toBe('max-content');
    expect(edit.style.height).toBe('max-content');
    mounted.dispose();
  });

  it('excludes an opened Popup from a fit-content page envelope', async () => {
    const page: RuntimePageModel = {
      id: 'fit-page-with-popup',
      name: 'FitPageWithPopup',
      caption: 'Fit page with popup',
      width: 640,
      height: 480,
      rootComponentId: 'fit-page-with-popup-root',
      components: [
        {
          id: 'fit-page-with-popup-root',
          type: 'WebPage',
          name: 'FitPageWithPopup',
          parentId: null,
          bounds: { x: 0, y: 0, width: 640, height: 480 },
          layout: responsiveLayout({}, { width: 'fit-content', height: 'fit-content' }),
          props: { caption: 'Fit page with popup', visible: true, enabled: true },
          children: ['fit-page-button', 'fit-page-popup'],
        },
        {
          id: 'fit-page-button',
          type: 'WebButton',
          name: 'FitPageButton',
          parentId: 'fit-page-with-popup-root',
          bounds: { x: 0, y: 0, width: 100, height: 24 },
          layout: responsiveLayout(),
          props: { caption: 'Keep me', visible: true, enabled: true },
          children: [],
        },
        {
          id: 'fit-page-popup',
          type: 'WebPopup',
          name: 'FitPagePopup',
          parentId: 'fit-page-with-popup-root',
          bounds: { x: 0, y: 0, width: 600, height: 500 },
          layout: responsiveLayout(),
          props: { modal: true, visible: true, enabled: true },
          children: [],
        },
      ],
    };
    const rectangle = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        width,
        height,
        top,
        right: left + width,
        bottom: top + height,
        left,
        toJSON: () => ({}),
      }) as DOMRect;
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
        if (this.dataset.webradId === 'fit-page-button') return rectangle(0, 0, 100, 24);
        if (this.dataset.webradId === 'fit-page-popup') return rectangle(0, 0, 600, 500);
        return rectangle(0, 0, 0, 0);
      });
    const host = document.createElement('div');
    document.body.append(host);

    try {
      const mounted = mountPage(page, host);
      const popup = mounted.page.requireComponentElement('fit-page-popup') as HTMLDialogElement;

      await Promise.resolve();
      await Promise.resolve();

      expect(popup.open).toBe(true);
      expect(mounted.element.style.width).toBe('100px');
      expect(mounted.element.style.height).toBe('24px');
      mounted.dispose();
    } finally {
      host.remove();
      getBoundingClientRect.mockRestore();
    }
  });

  it('expands reusable placements with isolated IDs and anchors floating instances to the viewport', () => {
    const reusablePage: RuntimePageModel = {
      id: 'reusable-runtime-page',
      name: 'ReusableRuntimePage',
      caption: 'Reusable runtime page',
      width: 800,
      height: 600,
      rootComponentId: 'reusable-page-root',
      components: [
        {
          id: 'reusable-page-root',
          type: 'WebPage',
          name: 'ReusableRuntimePage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          layout: responsiveLayout(),
          props: { caption: 'Reusable runtime page', visible: true, enabled: true },
          children: ['inline-card-instance', 'floating-card-instance'],
        },
        {
          id: 'inline-card-instance',
          type: 'WebReusableElement',
          name: 'InlineCard',
          parentId: 'reusable-page-root',
          bounds: { x: 32, y: 48, width: 240, height: 96 },
          layout: responsiveLayout({}, { width: 'fit-content', height: 'fit-content' }),
          props: {
            reusableElementId: 'reusable-card',
            placement: 'inline',
            visible: true,
            enabled: true,
          },
          children: [],
        },
        {
          id: 'floating-card-instance',
          type: 'WebReusableElement',
          name: 'FloatingCard',
          parentId: 'reusable-page-root',
          bounds: { x: 24, y: 36, width: 240, height: 96 },
          layout: responsiveLayout(),
          props: {
            reusableElementId: 'reusable-card',
            placement: 'floating',
            floatingHorizontalAnchor: 'right',
            floatingVerticalAnchor: 'bottom',
            floatingZIndex: 420,
            visible: true,
            enabled: true,
          },
          children: [],
        },
      ],
      reusableElements: [
        {
          id: 'reusable-card',
          name: 'ReusableCard',
          caption: 'Reusable card',
          width: 240,
          height: 96,
          rootComponentId: 'reusable-card-root',
          components: [
            {
              id: 'reusable-card-root',
              type: 'WebPanel',
              name: 'ReusableCardRoot',
              parentId: null,
              bounds: { x: 0, y: 0, width: 240, height: 96 },
              layout: responsiveLayout(),
              props: { visible: true, enabled: true },
              children: ['reusable-card-label'],
            },
            {
              id: 'reusable-card-label',
              type: 'WebLabel',
              name: 'ReusableCardLabel',
              parentId: 'reusable-card-root',
              bounds: { x: 12, y: 16, width: 160, height: 24 },
              layout: responsiveLayout(),
              props: { caption: 'Shared card', visible: true, enabled: true },
              children: [],
            },
          ],
        },
      ],
    };

    const host = document.createElement('div');
    const rectangle = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        width,
        height,
        top,
        right: left + width,
        bottom: top + height,
        left,
        toJSON: () => ({}),
      }) as DOMRect;
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
        if (this.dataset.webradId === 'inline-card-instance') return rectangle(0, 0, 0, 0);
        if (
          this.dataset.webradId === 'inline-card-instance:reusable-card-label' ||
          this.dataset.webradTemplateId === 'reusable-card-label'
        ) {
          return rectangle(12, 16, 160, 24);
        }
        return rectangle(0, 0, 0, 0);
      });
    const mounted = mountPage(reusablePage, host);
    const inlineDefinitionRoot = mounted.page.requireComponentElement(
      'inline-card-instance:reusable-card-root',
    );
    const floatingDefinitionRoot = mounted.page.requireComponentElement(
      'floating-card-instance:reusable-card-root',
    );
    const inlineDefinitionLabel = mounted.page.requireComponentElement(
      'inline-card-instance:reusable-card-label',
    );
    const floatingDefinitionLabel = mounted.page.requireComponentElement(
      'floating-card-instance:reusable-card-label',
    );
    const inlineInstance = mounted.page.requireComponentElement('inline-card-instance');
    const floatingInstance = mounted.page.requireComponentElement('floating-card-instance');

    expect(mounted.components.has('inline-card-instance:reusable-card-root')).toBe(true);
    expect(mounted.components.has('floating-card-instance:reusable-card-root')).toBe(true);
    expect(mounted.components.has('inline-card-instance:reusable-card-label')).toBe(true);
    expect(mounted.components.has('floating-card-instance:reusable-card-label')).toBe(true);
    expect(mounted.reusableInstances).toHaveLength(2);
    expect(
      mounted.reusableInstances.find((instance) => instance.instanceId === 'inline-card-instance')
        ?.componentIds,
    ).toEqual(
      new Map([
        ['reusable-card-root', 'inline-card-instance:reusable-card-root'],
        ['reusable-card-label', 'inline-card-instance:reusable-card-label'],
      ]),
    );
    expect(inlineDefinitionRoot).not.toBe(floatingDefinitionRoot);
    expect(inlineDefinitionLabel).not.toBe(floatingDefinitionLabel);
    expect(inlineDefinitionRoot.dataset.webradTemplateId).toBe('reusable-card-root');
    expect(floatingDefinitionRoot.dataset.webradTemplateId).toBe('reusable-card-root');
    expect(host.querySelectorAll('[data-webrad-template-id="reusable-card-label"]')).toHaveLength(
      2,
    );
    expect(inlineDefinitionRoot.parentElement).toBe(inlineInstance);
    expect(floatingDefinitionRoot.parentElement).toBe(floatingInstance);
    expect(mounted.element.contains(floatingInstance)).toBe(false);
    expect(floatingInstance.parentElement?.dataset.webradFloatingOwner).toBe(reusablePage.id);

    expect(inlineInstance.style.position).toBe('absolute');
    expect(inlineInstance.style.width).toBe('172px');
    expect(inlineInstance.style.height).toBe('40px');
    expect(inlineDefinitionRoot.style.minWidth).toBe('max-content');
    expect(inlineDefinitionRoot.style.minHeight).toBe('max-content');
    expect(floatingInstance.style.position).toBe('fixed');
    expect(floatingInstance.style.right).toBe('24px');
    expect(floatingInstance.style.bottom).toBe('36px');
    expect(floatingInstance.style.left).toBe('');
    expect(floatingInstance.style.top).toBe('');
    expect(floatingInstance.style.zIndex).toBe('420');
    expect(floatingInstance.style.getPropertyPriority('position')).toBe('important');

    const inlineMountedInstance = mounted.reusableInstances.find(
      (instance) => instance.instanceId === 'inline-card-instance',
    );
    const floatingMountedInstance = mounted.reusableInstances.find(
      (instance) => instance.instanceId === 'floating-card-instance',
    );
    if (inlineMountedInstance === undefined || floatingMountedInstance === undefined) {
      throw new Error('Expected both mounted reusable instances.');
    }
    const inlineScope = new WebReusableElementInstance(
      inlineMountedInstance.element,
      inlineMountedInstance.instanceId,
      mounted.components,
      inlineMountedInstance.componentIds,
    );
    const floatingScope = new WebReusableElementInstance(
      floatingMountedInstance.element,
      floatingMountedInstance.instanceId,
      mounted.components,
      floatingMountedInstance.componentIds,
    );
    expect(inlineScope.name).toBe('ReusableCardRoot');
    expect(inlineScope.pageName).toBe(reusablePage.name);
    expect(floatingScope.pageName).toBe(reusablePage.name);
    getBoundingClientRect.mockRestore();
    mounted.dispose();
  });

  it('keeps a constrained reusable fit-content definition inside its placement maximums', () => {
    const reusablePage: RuntimePageModel = {
      id: 'constrained-reusable-page',
      name: 'ConstrainedReusablePage',
      caption: 'Constrained reusable page',
      width: 800,
      height: 600,
      rootComponentId: 'constrained-reusable-page-root',
      components: [
        {
          id: 'constrained-reusable-page-root',
          type: 'WebPage',
          name: 'ConstrainedReusablePage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          layout: responsiveLayout(),
          props: { caption: 'Constrained reusable page', visible: true, enabled: true },
          children: ['constrained-card-instance'],
        },
        {
          id: 'constrained-card-instance',
          type: 'WebReusableElement',
          name: 'ConstrainedCard',
          parentId: 'constrained-reusable-page-root',
          bounds: { x: 24, y: 36, width: 240, height: 96 },
          layout: responsiveLayout(
            {},
            { width: 'fit-content', height: 'fit-content', maxWidth: 120, maxHeight: 48 },
          ),
          props: {
            reusableElementId: 'constrained-card',
            placement: 'in-flow',
            visible: true,
            enabled: true,
          },
          children: [],
        },
      ],
      reusableElements: [
        {
          id: 'constrained-card',
          name: 'ConstrainedCard',
          caption: 'Constrained card',
          width: 240,
          height: 96,
          rootComponentId: 'constrained-card-root',
          components: [
            {
              id: 'constrained-card-root',
              type: 'WebPanel',
              name: 'ConstrainedCardRoot',
              parentId: null,
              bounds: { x: 0, y: 0, width: 240, height: 96 },
              layout: responsiveLayout(),
              props: { visible: true, enabled: true },
              children: ['constrained-card-child'],
            },
            {
              id: 'constrained-card-child',
              type: 'WebPanel',
              name: 'ConstrainedCardChild',
              parentId: 'constrained-card-root',
              bounds: { x: -80, y: -30, width: 300, height: 100 },
              layout: responsiveLayout(),
              props: { visible: true, enabled: true },
              children: [],
            },
          ],
        },
      ],
    };
    const rectangle = (left: number, top: number, width: number, height: number): DOMRect =>
      ({
        x: left,
        y: top,
        width,
        height,
        top,
        right: left + width,
        bottom: top + height,
        left,
        toJSON: () => ({}),
      }) as DOMRect;
    const getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement): DOMRect {
        if (this.dataset.webradId === 'constrained-card-instance') return rectangle(0, 0, 0, 0);
        if (this.dataset.webradId === 'constrained-card-instance:constrained-card-child') {
          return rectangle(-80, -30, 300, 100);
        }
        return rectangle(0, 0, 0, 0);
      });

    try {
      const mounted = mountPage(reusablePage, document.createElement('div'));
      const instance = mounted.page.requireComponentElement('constrained-card-instance');
      const definitionRoot = mounted.page.requireComponentElement(
        'constrained-card-instance:constrained-card-root',
      );

      expect(instance.style.width).toBe('120px');
      expect(instance.style.height).toBe('48px');
      expect(instance.style.maxWidth).toBe('120px');
      expect(instance.style.maxHeight).toBe('48px');
      expect(definitionRoot.style.minWidth).toBe('0px');
      expect(definitionRoot.style.minHeight).toBe('0px');
      expect(definitionRoot.style.maxWidth).toBe('100%');
      expect(definitionRoot.style.maxHeight).toBe('100%');
      mounted.dispose();
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('allocates a unique physical ID when a scoped reusable ID collides with a page ID', () => {
    const collidingPage: RuntimePageModel = {
      id: 'collision-page',
      name: 'CollisionPage',
      caption: 'Collision page',
      width: 640,
      height: 480,
      rootComponentId: 'collision-root',
      components: [
        {
          id: 'collision-root',
          type: 'WebPage',
          name: 'CollisionPage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 640, height: 480 },
          layout: responsiveLayout(),
          props: { caption: 'Collision page', visible: true, enabled: true },
          children: ['instance', 'instance:template-root'],
        },
        {
          id: 'instance',
          type: 'WebReusableElement',
          name: 'CardInstance',
          parentId: 'collision-root',
          bounds: { x: 16, y: 16, width: 200, height: 80 },
          layout: responsiveLayout(),
          props: { reusableElementId: 'card', placement: 'in-flow', visible: true, enabled: true },
          children: [],
        },
        {
          id: 'instance:template-root',
          type: 'WebLabel',
          name: 'PersistedSibling',
          parentId: 'collision-root',
          bounds: { x: 240, y: 16, width: 120, height: 24 },
          layout: responsiveLayout(),
          props: { caption: 'Persisted sibling', visible: true, enabled: true },
          children: [],
        },
      ],
      reusableElements: [
        {
          id: 'card',
          name: 'Card',
          caption: 'Card',
          width: 200,
          height: 80,
          rootComponentId: 'template-root',
          components: [
            {
              id: 'template-root',
              type: 'WebPanel',
              name: 'CardRoot',
              parentId: null,
              bounds: { x: 0, y: 0, width: 200, height: 80 },
              layout: responsiveLayout(),
              props: { visible: true, enabled: true },
              children: [],
            },
          ],
        },
      ],
    };

    const expanded = expandReusableElements(collidingPage);
    const clonedRoot = expanded.components.find((node) => node.templateId === 'template-root');
    expect(clonedRoot?.id).toBeDefined();
    expect(clonedRoot?.id).not.toBe('instance:template-root');

    const mounted = mountPage(collidingPage, document.createElement('div'));
    expect(mounted.page.requireComponentElement('instance:template-root').dataset.webradType).toBe(
      'WebLabel',
    );
    expect(mounted.page.requireComponentElement(clonedRoot?.id ?? '').dataset.webradType).toBe(
      'WebPanel',
    );
    expect(mounted.reusableInstances[0]?.componentIds.get('template-root')).toBe(clonedRoot?.id);
  });

  it('rejects a runtime reusable instance with no supplied definition', () => {
    const root = pageModel.components.find((node) => node.id === pageModel.rootComponentId);
    if (root === undefined) throw new Error('Expected the runtime page root.');
    const invalidInstance: RuntimeComponentNode = {
      id: 'unresolved-instance',
      type: 'WebReusableElement',
      name: 'UnresolvedInstance',
      parentId: root.id,
      bounds: { x: 12, y: 12, width: 160, height: 80 },
      layout: responsiveLayout(),
      props: { reusableElementId: 'missing-definition', placement: 'in-flow' },
      children: [],
    };

    expect(() =>
      expandReusableElements({
        ...pageModel,
        components: [
          { ...root, children: [...root.children, invalidInstance.id] },
          ...pageModel.components.filter((node) => node.id !== root.id),
          invalidInstance,
        ],
        reusableElements: [],
      }),
    ).toThrow('references unknown reusable component');
  });

  it('mounts responsive containers with structural layout that wins over reusable style dimensions', () => {
    const responsivePage: RuntimePageModel = {
      id: 'responsive-page',
      name: 'ResponsivePage',
      caption: 'Responsive page',
      width: 800,
      height: 600,
      rootComponentId: 'responsive-root',
      components: [
        {
          id: 'responsive-root',
          type: 'WebPage',
          name: 'ResponsivePage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          layout: responsiveLayout({
            mode: 'row',
            paddingTop: 16,
            paddingRight: 20,
            paddingBottom: 16,
            paddingLeft: 20,
            gap: 12,
            wrap: true,
            justifyContent: 'space-between',
            alignItems: 'center',
          }),
          props: { caption: 'Responsive page', visible: true, enabled: true },
          children: ['responsive-stretch', 'responsive-fixed'],
        },
        {
          id: 'responsive-stretch',
          type: 'WebPanel',
          name: 'StretchPanel',
          parentId: 'responsive-root',
          bounds: { x: 0, y: 0, width: 240, height: 96 },
          layout: responsiveLayout(
            { mode: 'column', gap: 8 },
            { width: 'stretch', height: 'fixed', minWidth: 160, grow: 2, shrink: true },
          ),
          props: { visible: true, enabled: true },
          styleClassName: 'w-full! h-full!',
          children: [],
        },
        {
          id: 'responsive-fixed',
          type: 'WebButton',
          name: 'FixedButton',
          parentId: 'responsive-root',
          bounds: { x: 0, y: 0, width: 112, height: 40 },
          layout: responsiveLayout({}, { width: 'fixed', height: 'fixed', shrink: false }),
          props: { caption: 'Save', visible: true, enabled: true },
          children: [],
        },
      ],
    };

    const mounted = mountPage(responsivePage);
    const root = mounted.element;
    const stretch = mounted.page.requireComponentElement('responsive-stretch');
    const fixed = mounted.page.requireComponentElement('responsive-fixed');

    expect(root.style.display).toBe('flex');
    expect(root.style.flexDirection).toBe('row');
    expect(root.style.flexWrap).toBe('wrap');
    expect(root.style.justifyContent).toBe('space-between');
    expect(root.style.alignItems).toBe('center');
    expect(root.style.width).toBe('100vw');
    expect(root.style.height).toBe('100dvh');
    expect(root.style.getPropertyPriority('width')).toBe('important');
    expect(root.style.getPropertyPriority('display')).toBe('important');

    expect(stretch.style.position).toBe('relative');
    expect(stretch.style.width).toBe('auto');
    expect(stretch.style.height).toBe('96px');
    expect(stretch.style.flexBasis).toBe('0px');
    expect(stretch.style.flexGrow).toBe('2');
    expect(stretch.style.minWidth).toBe('160px');
    expect(stretch.style.getPropertyPriority('width')).toBe('important');

    const stretchPanel = new WebPanel(stretch);
    stretchPanel.hide();
    expect(stretch.hidden).toBe(true);
    expect(stretch.style.display).toBe('none');
    expect(stretch.style.getPropertyPriority('display')).toBe('important');
    stretchPanel.show();
    expect(stretch.hidden).toBe(false);
    expect(stretch.style.display).toBe('flex');
    expect(stretch.style.getPropertyPriority('display')).toBe('important');

    expect(fixed.style.position).toBe('relative');
    expect(fixed.style.width).toBe('112px');
    expect(fixed.style.height).toBe('40px');
    expect(fixed.style.flexShrink).toBe('0');
  });

  it('uses insets and centering for align-to-parent containers', () => {
    const alignedPage: RuntimePageModel = {
      id: 'aligned-page',
      name: 'AlignedPage',
      caption: 'Aligned page',
      width: 800,
      height: 600,
      rootComponentId: 'aligned-root',
      components: [
        {
          id: 'aligned-root',
          type: 'WebPage',
          name: 'AlignedPage',
          parentId: null,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          layout: responsiveLayout({ mode: 'align-to-parent' }),
          props: { caption: 'Aligned page', visible: true, enabled: true },
          children: ['fill-panel', 'center-label'],
        },
        {
          id: 'fill-panel',
          type: 'WebPanel',
          name: 'FillPanel',
          parentId: 'aligned-root',
          bounds: { x: 0, y: 0, width: 300, height: 120 },
          layout: responsiveLayout(
            {},
            {
              width: 'stretch',
              height: 'fixed',
              horizontalAnchor: 'stretch',
              verticalAnchor: 'start',
              left: 24,
              right: 32,
              top: 18,
            },
          ),
          props: { visible: true, enabled: true },
          children: [],
        },
        {
          id: 'center-label',
          type: 'WebLabel',
          name: 'CenterLabel',
          parentId: 'aligned-root',
          bounds: { x: 0, y: 0, width: 100, height: 24 },
          layout: responsiveLayout(
            {},
            {
              width: 'fit-content',
              height: 'fit-content',
              horizontalAnchor: 'center',
              verticalAnchor: 'center',
              left: -8,
              top: 4,
            },
          ),
          props: { caption: 'Centered', visible: true, enabled: true },
          children: [],
        },
      ],
    };

    const mounted = mountPage(alignedPage);
    const fillPanel = mounted.page.requireComponentElement('fill-panel');
    const centerLabel = mounted.page.requireComponentElement('center-label');

    expect(fillPanel.style.position).toBe('absolute');
    expect(fillPanel.style.left).toBe('24px');
    expect(fillPanel.style.right).toBe('32px');
    expect(fillPanel.style.top).toBe('18px');
    expect(fillPanel.style.width).toBe('');
    expect(fillPanel.style.height).toBe('120px');
    expect(centerLabel.style.left).toBe('calc(50% - 8px)');
    expect(centerLabel.style.top).toBe('calc(50% + 4px)');
    expect(centerLabel.style.translate).toBe('-50% -50%');
  });

  it('resolves structured style properties, interaction states and safe arbitrary values', () => {
    const style = {
      states: {
        base: {
          paddingLeft: { value: 16, unit: 'px' as const },
          textGradient: {
            kind: 'linear' as const,
            direction: 'to-right' as const,
            from: '#f59e0b',
            to: '#ef4444',
          },
          backgroundGradient: {
            kind: 'linear' as const,
            direction: 'to-bottom-right' as const,
            from: '#2563eb',
            to: '#7c3aed',
          },
          borderWidth: { value: 4, unit: 'px' as const },
          borderStyle: 'solid',
          borderGradient: {
            kind: 'linear' as const,
            direction: 'to-bottom' as const,
            from: '#22c55e',
            to: '#06b6d4',
          },
          transitionProperty: 'all',
          animationName: 'pulse',
          borderRadius: { value: 40, unit: 'px' as const },
        },
        hover: {
          backgroundGradient: {
            kind: 'linear' as const,
            direction: 'to-top' as const,
            from: '#1d4ed8',
            to: '#0f172a',
          },
        },
        focus: { ringWidth: { value: 2, unit: 'px' as const } },
        active: { scale: 95 },
        disabled: { cursor: 'not-allowed', opacity: 50 },
      },
    };

    expect(tokenizeTailwindClasses("px-4 bg-blue-600 [content:'hello world']")).toEqual([
      'px-4',
      'bg-blue-600',
      "[content:'hello_world']",
    ]);
    expect(resolveComponentStyleClassNames(style)).toEqual([
      'pl-[16px]',
      '[&_[data-webrad-text-content]]:bg-[linear-gradient(to_right,#f59e0b,#ef4444)]',
      '[&_[data-webrad-text-content]]:bg-clip-text',
      '[&_[data-webrad-text-content]]:text-transparent',
      'border',
      'border-transparent',
      '[border-style:solid]',
      '[background:linear-gradient(to_bottom_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
      'border-[4px]',
      'border-solid',
      'transition-all',
      'animate-pulse',
      'rounded-[40px]',
      'hover:border',
      'hover:border-transparent',
      'hover:[border-style:solid]',
      'hover:[background:linear-gradient(to_top,#1d4ed8,#0f172a)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
      'focus:ring-[2px]',
      'focus-within:ring-[2px]',
      'active:scale-[0.95]',
      'disabled:cursor-not-allowed',
      'aria-disabled:cursor-not-allowed',
      'disabled:opacity-[0.5]',
      'aria-disabled:opacity-[0.5]',
    ]);
    expect(resolveComponentStyleClassName(style)).toContain(
      'hover:[background:linear-gradient(to_top,#1d4ed8,#0f172a)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
    );
    expect(resolveComponentStylePreviewClassName(style, 'hover')).toContain(
      '[background:linear-gradient(to_top,#1d4ed8,#0f172a)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
    );
    expect(resolveComponentStylePreviewClassName(style, 'hover')).not.toContain(
      '[background:linear-gradient(to_bottom_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
    );
    expect(
      resolveStylePropertyCandidate('backgroundGradient', {
        kind: 'linear',
        direction: 'to-right',
        from: 'rgb(1, 2, 3)',
        to: '#ffffff',
      }),
    ).toBeUndefined();
    expect(resolveStylePropertyCandidate('animationDuration', 750)).toBe(
      '[animation-duration:750ms]!',
    );
    expect(
      tokenizeTailwindClasses(
        resolveStylePropertyCandidate('borderGradient', {
          kind: 'linear',
          direction: 'to-right',
          from: '#2563eb',
          to: '#7c3aed',
        }) ?? '',
      ),
    ).toEqual([
      'border',
      'border-transparent',
      '[border-style:solid]',
      '[background:linear-gradient(var(--webrad-border-gradient-surface,transparent),var(--webrad-border-gradient-surface,transparent))_padding-box,linear-gradient(to_right,#2563eb,#7c3aed)_border-box]',
    ]);

    const solidHover = {
      states: {
        base: {
          backgroundGradient: {
            kind: 'linear' as const,
            direction: 'to-right' as const,
            from: '#2563eb',
            to: '#7c3aed',
          },
          borderGradient: {
            kind: 'linear' as const,
            direction: 'to-bottom' as const,
            from: '#22c55e',
            to: '#06b6d4',
          },
        },
        hover: { backgroundColor: '#ffffff', borderColor: '#0f172a' },
        focus: {},
        active: {},
        disabled: {},
      },
    };
    expect(resolveComponentStyleClassNames(solidHover)).toEqual(
      expect.arrayContaining(['hover:[background:#ffffff]', 'hover:border-[#0f172a]']),
    );
    expect(resolveComponentStylePreviewClassName(solidHover, 'hover')).toEqual(
      expect.stringContaining('bg-[#ffffff]'),
    );
  });

  it('targets a button SVG icon with its own state-aware size and color', () => {
    expect(resolveStylePropertyCandidate('buttonIconSize', { value: 24, unit: 'px' })).toBe(
      '[&_.wr-button-icon]:w-[24px]! [&_.wr-button-icon]:h-[24px]!',
    );
    expect(resolveStylePropertyCandidate('buttonIconColor', '#f59e0b')).toBe(
      '[&_.wr-button-icon]:text-[#f59e0b]',
    );
    expect(
      resolveComponentStyleClassNames({
        states: {
          base: { buttonIconSize: { value: 24, unit: 'px' }, buttonIconColor: '#f59e0b' },
          hover: { buttonIconSize: { value: 20, unit: 'px' }, buttonIconColor: '#38bdf8' },
          focus: {},
          active: {},
          disabled: {},
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        '[&_.wr-button-icon]:w-[24px]!',
        '[&_.wr-button-icon]:h-[24px]!',
        '[&_.wr-button-icon]:text-[#f59e0b]',
        'hover:[&_.wr-button-icon]:w-[20px]!',
        'hover:[&_.wr-button-icon]:h-[20px]!',
        'hover:[&_.wr-button-icon]:text-[#38bdf8]',
      ]),
    );
  });

  it('projects Data Grid line, surface, and inner-control properties through scoped style classes', () => {
    expect(resolveStylePropertyCandidate('dataGridHorizontalLineVisibility', 'show')).toBe(
      '[--wr-data-grid-horizontal-line-override-width:var(--wr-data-grid-horizontal-line-width,1px)]',
    );
    expect(resolveStylePropertyCandidate('dataGridVerticalLineVisibility', 'hide')).toBe(
      '[--wr-data-grid-vertical-line-override-width:0px]',
    );
    expect(resolveStylePropertyCandidate('dataGridHorizontalLineColor', 'current')).toBe(
      '[--wr-data-grid-horizontal-line-color:currentColor]',
    );
    expect(
      resolveStylePropertyCandidate('dataGridVerticalLineWidth', { value: 2, unit: 'rem' }),
    ).toBe('[--wr-data-grid-vertical-line-width:2rem]');
    expect(resolveStylePropertyCandidate('dataGridHeaderBackgroundColor', '#0f172a')).toBe(
      '[--wr-data-grid-header-background-color:#0f172a]',
    );
    expect(resolveStylePropertyCandidate('dataGridHeaderFontWeight', 'bold')).toBe(
      '[--wr-data-grid-header-font-weight:700]',
    );
    expect(resolveStylePropertyCandidate('dataGridFooterHeight', 'auto')).toBe(
      '[--wr-data-grid-footer-height:auto]',
    );
    expect(resolveStylePropertyCandidate('dataGridFooterPaddingY', { value: 6, unit: 'px' })).toBe(
      '[--wr-data-grid-footer-padding-y:6px]',
    );
    expect(resolveStylePropertyCandidate('dataGridButtonContentMode', 'icon')).toBe(
      '[&_.wr-data-grid-button-icon-slot]:block [&_.wr-data-grid-button_.wr-data-grid-button-caption]:sr-only',
    );
    expect(resolveStylePropertyCandidate('dataGridButtonIconPosition', 'bottom')).toBe(
      '[&_.wr-data-grid-button]:flex-col-reverse',
    );
    expect(resolveStylePropertyCandidate('dataGridButtonIconSize', { value: 24, unit: 'px' })).toBe(
      '[&_.wr-data-grid-button_.wr-button-icon]:w-[24px]! [&_.wr-data-grid-button_.wr-button-icon]:h-[24px]!',
    );
    expect(resolveStylePropertyCandidate('dataGridButtonIconColor', '#f59e0b')).toBe(
      '[&_.wr-data-grid-button_.wr-button-icon]:text-[#f59e0b]',
    );
    expect(resolveStylePropertyCandidate('dataGridButtonBackgroundColor', '#e0e7ff')).toBe(
      '[--wr-data-grid-button-background-color:#e0e7ff]',
    );
    expect(
      resolveStylePropertyCandidate('dataGridButtonBorderRadius', { value: 6, unit: 'px' }),
    ).toBe('[--wr-data-grid-button-border-radius:6px]');
    expect(resolveStylePropertyCandidate('dataGridButtonFontWeight', 'semibold')).toBe(
      '[--wr-data-grid-button-font-weight:600]',
    );
    expect(resolveStylePropertyCandidate('dataGridCheckboxAccentColor', '#2563eb')).toBe(
      '[--wr-data-grid-checkbox-accent-color:#2563eb]',
    );
    expect(resolveStylePropertyCandidate('dataGridCheckboxSize', { value: 16, unit: 'px' })).toBe(
      '[--wr-data-grid-checkbox-size:16px]',
    );
    expect(resolveStylePropertyCandidate('dataGridCheckboxTextColor', '#334155')).toBe(
      '[--wr-data-grid-checkbox-text-color:#334155]',
    );
    expect(resolveStylePropertyCandidate('dataGridCheckboxFontWeight', 'medium')).toBe(
      '[--wr-data-grid-checkbox-font-weight:500]',
    );
    expect(resolveStylePropertyCandidate('dataGridCheckboxGap', { value: 6, unit: 'px' })).toBe(
      '[--wr-data-grid-checkbox-gap:6px]',
    );

    expect(
      resolveComponentStyleClassNames({
        states: {
          base: {
            dataGridHorizontalLineVisibility: 'show',
            dataGridHorizontalLineStyle: 'dashed',
            dataGridVerticalLineVisibility: 'hide',
            dataGridHeaderBorderWidth: { value: 2, unit: 'px' },
            dataGridHeaderTextColor: '#f8fafc',
            dataGridFooterBackgroundColor: '#e2e8f0',
            dataGridFooterFontWeight: 'medium',
            dataGridButtonContentMode: 'icon',
            dataGridButtonIconPosition: 'bottom',
            dataGridButtonIconSize: { value: 24, unit: 'px' },
            dataGridButtonIconColor: '#f59e0b',
          },
          hover: {},
          focus: {},
          active: {},
          disabled: {},
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        '[--wr-data-grid-horizontal-line-override-width:var(--wr-data-grid-horizontal-line-width,1px)]',
        '[--wr-data-grid-horizontal-line-style:dashed]',
        '[--wr-data-grid-vertical-line-override-width:0px]',
        '[--wr-data-grid-header-border-width:2px]',
        '[--wr-data-grid-header-text-color:#f8fafc]',
        '[--wr-data-grid-footer-background-color:#e2e8f0]',
        '[--wr-data-grid-footer-font-weight:500]',
        '[&_.wr-data-grid-button-icon-slot]:block',
        '[&_.wr-data-grid-button_.wr-data-grid-button-caption]:sr-only',
        '[&_.wr-data-grid-button]:flex-col-reverse',
        '[&_.wr-data-grid-button_.wr-button-icon]:w-[24px]!',
        '[&_.wr-data-grid-button_.wr-button-icon]:h-[24px]!',
        '[&_.wr-data-grid-button_.wr-button-icon]:text-[#f59e0b]',
      ]),
    );
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-config-horizontal-line-width');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-header-border-width');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-footer-border-width');
    expect(WEBRAD_COMPONENT_CSS).toContain(
      'background: var(--wr-data-grid-header-background-color, #e0e7ff)',
    );
    expect(WEBRAD_COMPONENT_CSS).toContain(
      'background: var(--wr-data-grid-footer-background-color, #f8fafc)',
    );
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-data-grid-button-caption');
    expect(WEBRAD_COMPONENT_CSS).toContain(
      '.wr-data-grid-button-icon-slot { position: relative; display: block; flex: 0 0 16px; min-width: 0; min-height: 0; width: 16px; height: 16px; line-height: 0; }',
    );
    expect(WEBRAD_COMPONENT_CSS).toContain(
      '.wr-data-grid-button-icon-slot > .wr-data-grid-button-icon { position: absolute; top: 50%; left: 50%; display: block; transform: translate(-50%, -50%); }',
    );
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-data-grid-checkbox-control');
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-data-grid-checkbox-caption');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-button-background-color');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-checkbox-accent-color');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-checkbox-text-color');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-checkbox-font-weight');
    expect(WEBRAD_COMPONENT_CSS).toContain('--wr-data-grid-checkbox-gap');
  });

  it('applies compiled style classes to the real browser element', () => {
    const styledModel: RuntimePageModel = {
      ...pageModel,
      components: pageModel.components.map((component) =>
        component.id === 'button-show'
          ? {
              ...component,
              props: {
                ...component.props,
                backgroundColor: 'red',
                borderColor: 'black',
                color: 'white',
              },
              styleClassName: 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 animate-pulse',
            }
          : component.id === 'edit-name'
            ? {
                ...component,
                props: { ...component.props, backgroundColor: 'red' },
                styleClassName: '',
              }
            : component,
      ),
    };

    const mounted = mountPage(styledModel);
    const button = mounted.page.requireComponentElement('button-show');
    expect([...button.classList]).toEqual(
      expect.arrayContaining([
        'wr-webbutton',
        'bg-blue-600',
        'hover:bg-blue-700',
        'disabled:opacity-50',
        'animate-pulse',
      ]),
    );
    expect(button.style.backgroundColor).toBe('');
    expect(button.style.borderColor).toBe('');
    expect(button.style.color).toBe('');
    const textContent = button.querySelector<HTMLElement>('[data-webrad-text-content]');
    expect(textContent?.textContent).toBe('Mostrar');
    new WebButton(button).caption = 'Updated button';
    expect(textContent?.textContent).toBe('Updated button');
    expect(mounted.page.requireComponentElement('edit-name').style.backgroundColor).toBe('');
  });

  it('renders an individually selected button icon while applying its style presentation', () => {
    const styledModel: RuntimePageModel = {
      ...pageModel,
      components: pageModel.components.map((component) =>
        component.id === 'button-show'
          ? {
              ...component,
              props: { ...component.props, icon: 'save' },
              styleClassName:
                '[&_.wr-button-icon]:block [&_.wr-button-text]:sr-only flex-col-reverse',
            }
          : component,
      ),
    };

    const mounted = mountPage(styledModel);
    const button = mounted.page.requireComponentElement('button-show');
    const icon = button.querySelector<SVGSVGElement>('[data-webrad-button-icon]');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('path')?.getAttribute('d')).toContain('M5 3h12');
    expect(button.classList).toContain('[&_.wr-button-icon]:block');
    expect(button.classList).toContain('[&_.wr-button-text]:sr-only');
    expect(button.classList).toContain('flex-col-reverse');
    expect(button.getAttribute('aria-label')).toBe('Mostrar');
    expect(button.querySelector('[data-webrad-text-content]')?.textContent).toBe('Mostrar');
    const runtimeButton = new WebButton(button);
    runtimeButton.icon = 'play';
    expect(runtimeButton.icon).toBe('play');
    expect(icon?.querySelector('path')?.getAttribute('d')).toContain('m8 5 11 7');
    runtimeButton.icon = 'door-in';
    expect(runtimeButton.icon).toBe('door-in');
    expect(icon?.querySelector('path')).not.toBeNull();
  });

  it('mounts a styled popup dialog and exposes its browser-safe lifecycle API', () => {
    const popupModel: RuntimePageModel = {
      ...pageModel,
      components: [
        ...pageModel.components.map((component) =>
          component.id === 'page-root'
            ? { ...component, children: [...component.children, 'popup-dialog'] }
            : component,
        ),
        {
          id: 'popup-dialog',
          type: 'WebPopup',
          name: 'Popup1',
          parentId: 'page-root',
          layout: responsiveLayout({
            mode: 'column',
            paddingTop: 12,
            paddingRight: 16,
            paddingBottom: 12,
            paddingLeft: 16,
            gap: 8,
          }),
          bounds: { x: 120, y: 80, width: 360, height: 200 },
          props: {
            modal: true,
            visible: false,
            collapseWhenHidden: true,
            enabled: true,
          },
          children: ['popup-confirm'],
          styleClassName: 'bg-slate-900 text-white shadow-xl',
        },
        {
          id: 'popup-confirm',
          type: 'WebButton',
          name: 'BTNConfirm',
          parentId: 'popup-dialog',
          layout: responsiveLayout({}, { width: 'stretch', height: 'fixed' }),
          bounds: { x: 0, y: 0, width: 120, height: 32 },
          props: { caption: 'Confirm', visible: true, enabled: true },
          children: [],
        },
      ],
    };

    const mounted = mountPage(popupModel);
    const component = mounted.components.get('popup-dialog');
    if (!(component instanceof WebPopup)) throw new Error('Expected mounted WebPopup.');

    const { element: dialog } = component;
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.hidden).toBe(true);
    expect(dialog.classList.contains('wr-webpopup')).toBe(true);
    expect(dialog.classList.contains('bg-slate-900')).toBe(true);
    expect(dialog.style.position).toBe('');
    expect(dialog.style.left).toBe('');
    expect(dialog.style.top).toBe('');
    expect(dialog.getAttribute('aria-label')).toBe('Popup1');
    const childrenHost = dialog.querySelector<HTMLElement>('[data-webrad-popup-children]');
    const confirm = mounted.components.get('popup-confirm');
    if (!(confirm instanceof WebButton)) throw new Error('Expected mounted popup child button.');
    expect(childrenHost).not.toBeNull();
    expect(confirm.element.parentElement).toBe(childrenHost);
    expect(childrenHost?.style.display).toBe('flex');
    expect(childrenHost?.style.flexDirection).toBe('column');
    expect(childrenHost?.style.paddingTop).toBe('12px');
    expect(childrenHost?.style.gap).toBe('8px');
    expect(confirm.element.style.alignSelf).toBe('stretch');
    expect(confirm.element.style.width).toBe('auto');
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-webpopup::backdrop');
    expect(WEBRAD_COMPONENT_CSS).toContain('.wr-popup-children');
    expect(WEBRAD_COMPONENT_CSS).not.toContain('.wr-popup-content');
    expect(WEBRAD_COMPONENT_CSS).not.toContain('.wr-popup-header');

    const lifecycle: string[] = [];
    component.bindEvent('OnShow', () => {
      lifecycle.push('show');
    });
    component.bindEvent('OnHide', () => {
      lifecycle.push('hide');
    });
    component.bindEvent('OnClose', () => {
      lifecycle.push('close');
    });
    component.bindEvent('OnCancel', () => {
      lifecycle.push('cancel');
    });

    component.show();
    expect(component.visible).toBe(true);
    expect(component.open).toBe(true);
    expect(dialog.hidden).toBe(false);
    expect(lifecycle).toContain('show');

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(lifecycle).toContain('cancel');

    component.close('accepted');
    expect(component.visible).toBe(false);
    expect(component.open).toBe(false);
    expect(component.returnValue).toBe('accepted');
    expect(lifecycle).toContain('hide');
    expect(lifecycle).toContain('close');
  });

  it('removes the retired Popup message shell while preserving its child host', () => {
    const dialog = document.createElement('dialog');
    const legacyContent = document.createElement('div');
    legacyContent.dataset.webradPopupContent = '';
    const legacyHeader = document.createElement('header');
    legacyHeader.dataset.webradPopupHeader = '';
    const legacyCaption = document.createElement('h2');
    legacyCaption.dataset.webradPopupCaption = '';
    const legacyMessage = document.createElement('p');
    legacyMessage.dataset.webradPopupMessage = '';
    const childrenHost = document.createElement('div');
    childrenHost.dataset.webradPopupChildren = '';
    const child = document.createElement('button');
    childrenHost.append(child);
    legacyHeader.append(legacyCaption, legacyMessage);
    legacyContent.append(legacyHeader, childrenHost);
    dialog.append(legacyContent);

    const popup = new WebPopup(dialog);

    expect(childrenHost.parentElement).toBe(dialog);
    expect(childrenHost.firstElementChild).toBe(child);
    expect(dialog.querySelector('[data-webrad-popup-content]')).toBeNull();
    expect(dialog.querySelector('[data-webrad-popup-header]')).toBeNull();
    expect(dialog.querySelector('[data-webrad-popup-caption]')).toBeNull();
    expect(dialog.querySelector('[data-webrad-popup-message]')).toBeNull();
    popup.dispose();
  });

  it('opens an initially visible modal popup after its detached host is connected', async () => {
    const host = document.createElement('div');
    const mounted = mountPage(
      {
        ...pageModel,
        components: [
          ...pageModel.components.map((component) =>
            component.id === 'page-root'
              ? { ...component, children: [...component.children, 'popup-dialog'] }
              : component,
          ),
          {
            id: 'popup-dialog',
            type: 'WebPopup',
            name: 'Popup1',
            parentId: 'page-root',
            layout: responsiveLayout(),
            bounds: { x: 0, y: 0, width: 360, height: 200 },
            props: {
              modal: true,
              visible: true,
              collapseWhenHidden: true,
              enabled: true,
            },
            children: [],
          },
        ],
      },
      host,
    );
    const component = mounted.components.get('popup-dialog');
    if (!(component instanceof WebPopup)) throw new Error('Expected mounted WebPopup.');

    await Promise.resolve();
    expect(component.visible).toBe(true);
    expect(component.open).toBe(false);

    document.body.append(host);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(component.open).toBe(true);
    component.close();
    host.remove();
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

  it('executes a configured operation, publishes its state, and exposes saved outputs', async () => {
    type CustomerResponse = {
      readonly payload: {
        readonly customers: readonly { readonly id: number; readonly name: string }[];
        readonly total: number;
      };
    };

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.href).toBe(
        'https://api.example.test/v1/customers?existing=yes&page=2&filter=gold+tier',
      );
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-tenant')).toBe('north');
      expect(headers.get('x-operation')).toBe('load-customers');
      expect(headers.get('x-disabled')).toBeNull();
      expect(headers.get('content-type')).toBe('application/json');
      expect(init?.body).toBe('{"active":true,"limit":2}');
      return new Response(
        JSON.stringify({
          payload: {
            customers: [
              { id: 10, name: 'Ada' },
              { id: 11, name: 'Linus' },
            ],
            total: 2,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const api = new WebApiClient<{ readonly LoadCustomers: CustomerResponse }>({
      baseUrl: 'https://api.example.test/v1',
      fetch: fetchMock,
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [
          { id: 'tenant', name: 'X-Tenant', value: 'north', enabled: true },
          { id: 'disabled', name: 'X-Disabled', value: 'ignored', enabled: false },
        ],
        timeoutMs: 5_000,
        operations: [
          {
            id: 'load-customers',
            name: 'LoadCustomers',
            method: 'POST',
            path: '/customers?existing=yes',
            headers: [
              {
                id: 'operation-header',
                name: 'X-Operation',
                value: 'load-customers',
                enabled: true,
              },
            ],
            query: [
              { id: 'page', name: 'page', value: '2', enabled: true },
              { id: 'filter', name: 'filter', value: 'gold tier', enabled: true },
              { id: 'ignored-query', name: 'ignored', value: 'true', enabled: false },
            ],
            body: { kind: 'json', content: '{"active":true,"limit":2}' },
            credentials: 'include',
            timeoutMs: null,
            responseSchema: {
              version: 1,
              root: {
                id: 'response-root',
                name: 'Response',
                path: '',
                kind: 'object',
                fieldType: 'object',
                nullable: false,
                children: [
                  {
                    id: 'customer-list',
                    name: 'Customers',
                    path: '/payload/customers',
                    kind: 'list',
                    fieldType: 'list',
                    nullable: false,
                    children: [],
                  },
                  {
                    id: 'customer-total',
                    name: 'Total',
                    path: '/payload/total',
                    kind: 'field',
                    fieldType: 'integer',
                    nullable: false,
                    children: [],
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const transitions: string[] = [];
    const lifecycleEvents: Array<{ readonly name: string; readonly detail: unknown }> = [];
    expect(api.apiClientConfig.operations[0]?.name).toBe('LoadCustomers');
    const unsubscribe = api.subscribe(() => {
      transitions.push(api.getOperationState('LoadCustomers').status);
    });
    for (const eventName of ['OnRequest', 'OnSuccess', 'OnError', 'OnComplete'] as const) {
      api.bindEvent(eventName, (_sender, event) => {
        lifecycleEvents.push({ name: eventName, detail: (event as CustomEvent).detail });
      });
    }

    await expect(api.execute('LoadCustomers')).resolves.toEqual({
      payload: {
        customers: [
          { id: 10, name: 'Ada' },
          { id: 11, name: 'Linus' },
        ],
        total: 2,
      },
    });
    unsubscribe();

    expect(api.status).toBe('success');
    expect(api.error).toBeUndefined();
    expect(api.getOperationState<CustomerResponse>('LoadCustomers')).toMatchObject({
      status: 'success',
      data: api.data.LoadCustomers,
    });
    expect(transitions).toEqual(['loading', 'success']);
    expect(lifecycleEvents.map((event) => event.name)).toEqual([
      'OnRequest',
      'OnSuccess',
      'OnComplete',
    ]);
    expect(lifecycleEvents[0]?.detail).toMatchObject({
      operation: { name: 'LoadCustomers' },
      state: { status: 'loading' },
    });
    expect(lifecycleEvents[1]?.detail).toMatchObject({
      operation: { name: 'LoadCustomers' },
      state: { status: 'success', data: api.data.LoadCustomers },
    });
    expect(api.getOutputById<number>('LoadCustomers', 'customer-total')).toBe(2);
    expect(api.getOutputById<number>('LoadCustomers', '/payload/total')).toBe(2);
    expect(
      api.getList<{ readonly id: number; readonly name: string }>('LoadCustomers', 'customer-list'),
    ).toEqual([
      { id: 10, name: 'Ada' },
      { id: 11, name: 'Linus' },
    ]);
    expect(api.getList('LoadCustomers', 'customer-total')).toEqual([]);
  });

  it('keeps the last successful configured result when a later execution fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"items":["first"]}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"message":"unavailable"}', {
          status: 503,
          statusText: 'Unavailable',
          headers: { 'content-type': 'application/json' },
        }),
      );
    const api = new WebApiClient<{ readonly LoadItems: { readonly items: readonly string[] } }>({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [],
        timeoutMs: 5_000,
        operations: [
          {
            id: 'load-items',
            name: 'LoadItems',
            method: 'GET',
            path: '/items',
            headers: [],
            query: [],
            body: { kind: 'none', content: '' },
            credentials: 'omit',
            timeoutMs: null,
            responseSchema: null,
          },
        ],
      },
    });
    const lifecycleEvents: Array<{ readonly name: string; readonly detail: unknown }> = [];
    for (const eventName of ['OnRequest', 'OnSuccess', 'OnError', 'OnComplete'] as const) {
      api.bindEvent(eventName, (_sender, event) => {
        lifecycleEvents.push({ name: eventName, detail: (event as CustomEvent).detail });
      });
    }

    await expect(api.execute('LoadItems')).resolves.toEqual({ items: ['first'] });
    await expect(api.execute('LoadItems')).rejects.toMatchObject({
      name: 'WebApiError',
      status: 503,
      body: { message: 'unavailable' },
    });

    expect(api.status).toBe('error');
    expect(api.error).toBeInstanceOf(WebApiError);
    expect(api.data.LoadItems).toEqual({ items: ['first'] });
    expect(api.getOperationState<{ readonly items: readonly string[] }>('LoadItems')).toMatchObject(
      {
        status: 'error',
        data: { items: ['first'] },
        error: expect.any(WebApiError),
      },
    );
    expect(lifecycleEvents.map((event) => event.name)).toEqual([
      'OnRequest',
      'OnSuccess',
      'OnComplete',
      'OnRequest',
      'OnError',
      'OnComplete',
    ]);
    expect(lifecycleEvents[4]?.detail).toMatchObject({
      operation: { name: 'LoadItems' },
      state: { status: 'error', error: expect.any(WebApiError) },
    });
  });

  it('turns a configured operation timeout into a WebApiTimeoutError and error state', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(signal.reason);
              return;
            }
            signal?.addEventListener(
              'abort',
              () => reject(new DOMException('The request was aborted.', 'AbortError')),
              { once: true },
            );
          }),
      );
      const api = new WebApiClient<{ readonly LoadSlow: unknown }>({
        baseUrl: 'https://api.example.test',
        fetch: fetchMock,
        apiClientConfig: {
          schemaVersion: 1,
          defaultHeaders: [],
          timeoutMs: 20,
          operations: [
            {
              id: 'load-slow',
              name: 'LoadSlow',
              method: 'GET',
              path: '/slow',
              headers: [],
              query: [],
              body: { kind: 'none', content: '' },
              credentials: 'omit',
              timeoutMs: null,
              responseSchema: null,
            },
          ],
        },
      });
      const transitions: string[] = [];
      api.subscribe(() => transitions.push(api.getOperationState('LoadSlow').status));

      const timedOut = expect(api.execute('LoadSlow')).rejects.toMatchObject({
        name: 'WebApiTimeoutError',
        timeoutMs: 20,
        url: 'https://api.example.test/slow',
      });
      await vi.advanceTimersByTimeAsync(20);
      await timedOut;

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(api.status).toBe('error');
      expect(api.error).toBeInstanceOf(WebApiTimeoutError);
      expect(api.getOperationState('LoadSlow')).toMatchObject({
        status: 'error',
        error: expect.any(WebApiTimeoutError),
      });
      expect(transitions).toEqual(['loading', 'error']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WebDataGrid', () => {
  it('keeps accessible row counts and indexes consistent when header and footer options change', () => {
    const host = document.createElement('div');
    const grid = new WebDataGrid(host);
    const configuration = normalizeWebDataGridConfiguration({
      columns: [{ id: 'name' }, { id: 'status' }],
    });

    try {
      for (const showHeader of [true, false, true]) {
        for (const showFooter of [true, false, true]) {
          grid.dataGridConfig = { ...configuration, showHeader, showFooter };
          const rows = Array.from(host.querySelectorAll('[role="row"]'));
          const rowCount = 1 + Number(showHeader) + Number(showFooter);
          expect(host.querySelector('[role="grid"]')?.getAttribute('aria-rowcount')).toBe(
            String(rowCount),
          );
          expect(rows).toHaveLength(rowCount);
          expect(rows.map((row) => row.getAttribute('aria-rowindex'))).toEqual(
            Array.from({ length: rowCount }, (_, index) => String(index + 1)),
          );
          expect(host.querySelector('.wr-data-grid-empty')?.getAttribute('aria-colspan')).toBe('2');
        }
      }
    } finally {
      grid.dispose();
    }
  });

  it('distributes dynamic tracks by weight while enforcing their maximum widths', () => {
    expect(
      resolveDataGridColumnTrackWidths(
        [
          { widthMode: 'dynamic', width: 180, minWidth: 100, maxWidth: null, flex: 2 },
          { widthMode: 'dynamic', width: 180, minWidth: 100, maxWidth: 200, flex: 1 },
          { widthMode: 'fixed', width: 80, minWidth: 80, maxWidth: 80, flex: 1 },
        ],
        800,
      ),
    ).toEqual([520, 200, 80]);
  });

  it('normalizes fixed cell captions while preserving legacy configurations', () => {
    const configuration = normalizeWebDataGridConfiguration({
      columns: [
        { id: 'action', cellKind: 'button', fixedCaption: 'Open customer', buttonIcon: 'eye' },
        { id: 'selected', cellKind: 'checkbox' },
        { id: 'invalid-caption', cellKind: 'button', fixedCaption: 42, buttonIcon: 'invalid' },
      ],
    });

    expect(configuration.columns.map((column) => column.fixedCaption)).toEqual([
      'Open customer',
      '',
      '',
    ]);
    expect(configuration.columns.map((column) => column.buttonIcon)).toEqual(['eye', null, null]);
  });

  it('renders only the latest configured API result and binds typed cell renderers', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            payload: {
              customers: [
                { name: 'Ada', avatar: 'https://example.test/ada.png', active: true },
                { name: 'Linus', avatar: 'https://example.test/linus.png', active: false },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    const api = new WebApiClient({
      id: 'customers-api',
      fetch: fetchMock,
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [],
        timeoutMs: 30_000,
        operations: [
          {
            id: 'load-customers',
            name: 'LoadCustomers',
            method: 'GET',
            path: 'https://api.example.test/customers',
            headers: [],
            query: [],
            body: { kind: 'none', content: '' },
            credentials: 'omit',
            timeoutMs: null,
            responseSchema: {
              version: 1,
              root: {
                id: 'response',
                name: 'Response',
                path: '',
                kind: 'object',
                fieldType: 'object',
                nullable: false,
                children: [
                  {
                    id: 'customers',
                    name: 'customers',
                    path: '/payload/customers',
                    kind: 'list',
                    fieldType: 'list',
                    nullable: false,
                    children: [],
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const grid = new WebDataGrid(host);
    grid.dataGridConfig = {
      schemaVersion: 2,
      apiClientId: 'customers-api',
      operationId: 'load-customers',
      listPath: '/payload/customers',
      columnCount: 4,
      showHeader: true,
      stickyHeader: true,
      showFooter: true,
      stickyFooter: true,
      rowHeightMode: 'fixed',
      fixedRowHeight: 48,
      minRowHeight: 36,
      maxRowHeight: null,
      cellPaddingHorizontal: 12,
      cellPaddingVertical: 6,
      wrapText: true,
      stripedRows: true,
      showHorizontalLines: true,
      showVerticalLines: true,
      emptyMessage: 'No customers',
      columns: [
        {
          id: 'name',
          header: 'Name',
          fieldPath: '/name',
          cellKind: 'text',
          fixedCaption: '',
          buttonIcon: null,
          footer: '2 customers',
          widthMode: 'dynamic',
          width: 180,
          minWidth: 160,
          maxWidth: null,
          flex: 2,
          headerAlign: 'start',
          cellAlign: 'start',
        },
        {
          id: 'avatar',
          header: 'Avatar',
          fieldPath: '/avatar',
          cellKind: 'image',
          fixedCaption: '',
          buttonIcon: null,
          footer: '',
          widthMode: 'fixed',
          width: 72,
          minWidth: 72,
          maxWidth: 72,
          flex: 1,
          headerAlign: 'center',
          cellAlign: 'center',
        },
        {
          id: 'action',
          header: 'Action',
          fieldPath: '/name',
          cellKind: 'button',
          fixedCaption: 'Open customer',
          buttonIcon: 'eye',
          footer: '',
          widthMode: 'dynamic',
          width: 180,
          minWidth: 120,
          maxWidth: 260,
          flex: 1,
          headerAlign: 'center',
          cellAlign: 'center',
        },
        {
          id: 'active',
          header: 'Active',
          fieldPath: '/active',
          cellKind: 'checkbox',
          fixedCaption: 'Enabled',
          buttonIcon: null,
          footer: '',
          widthMode: 'fixed',
          width: 88,
          minWidth: 88,
          maxWidth: 88,
          flex: 1,
          headerAlign: 'end',
          cellAlign: 'end',
        },
      ],
    };
    grid.bindApiClient(api);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain('No customers');

    const clicked: WebDataGridCellEventDetail[] = [];
    grid.bindEvent('OnCellClick', (_sender, event) => {
      clicked.push((event as CustomEvent<WebDataGridCellEventDetail>).detail);
    });
    await api.execute('LoadCustomers');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(host.querySelector('.wr-data-grid-header-row')?.className).toContain(
      'wr-data-grid-sticky-header',
    );
    expect(host.querySelector('.wr-data-grid-footer-row')?.className).toContain(
      'wr-data-grid-sticky-footer',
    );
    expect(host.querySelector('.wr-data-grid-content')?.className).toContain(
      'wr-data-grid-has-footer',
    );
    expect(host.querySelectorAll('.wr-data-grid-body-row')).toHaveLength(2);
    expect(host.querySelector('[role="grid"]')?.getAttribute('aria-rowcount')).toBe('4');
    expect(
      Array.from(host.querySelectorAll('[role="row"]'), (row) => row.getAttribute('aria-rowindex')),
    ).toEqual(['1', '2', '3', '4']);
    expect(host.querySelector('.wr-data-grid-body-row .wr-data-grid-cell')?.textContent).toBe(
      'Ada',
    );
    expect(host.querySelector<HTMLImageElement>('img')?.src).toBe('https://example.test/ada.png');
    expect(host.querySelector<HTMLButtonElement>('.wr-data-grid-button')?.textContent).toBe(
      'Open customer',
    );
    expect(host.querySelector('.wr-data-grid-button-caption')?.textContent).toBe('Open customer');
    const buttonIcon = host.querySelector<SVGSVGElement>(
      '.wr-data-grid-button .wr-button-icon.wr-data-grid-button-icon',
    );
    expect(buttonIcon?.parentElement?.classList.contains('wr-data-grid-button-icon-slot')).toBe(
      true,
    );
    expect(buttonIcon?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(buttonIcon?.dataset.webradButtonIcon).toBe('');
    expect(buttonIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(buttonIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(host.querySelector('.wr-data-grid-checkbox-caption')?.textContent).toBe('Enabled');
    expect(host.querySelector('.wr-data-grid-checkbox-control')).not.toBeNull();
    expect(host.querySelector('.wr-data-grid-footer-cell')?.textContent).toBe('2 customers');
    const content = host.querySelector<HTMLElement>('.wr-data-grid-content');
    expect(content?.dataset.webradRowHeightMode).toBe('fixed');
    expect(content?.dataset.webradWrapText).toBe('true');
    expect(content?.style.getPropertyValue('--wr-data-grid-columns')).toBe('160px 72px 120px 88px');
    expect(content?.style.getPropertyValue('--wr-data-grid-fixed-row-height')).toBe('48px');
    expect(content?.style.getPropertyValue('--wr-data-grid-config-horizontal-line-width')).toBe(
      '1px',
    );
    expect(content?.style.getPropertyValue('--wr-data-grid-config-vertical-line-width')).toBe(
      '1px',
    );

    grid.dataGridConfig = {
      ...grid.dataGridConfig,
      columns: grid.dataGridConfig.columns.map((column) => ({ ...column, fixedCaption: '' })),
    };
    expect(host.querySelector<HTMLButtonElement>('.wr-data-grid-button')?.textContent).toBe('Ada');
    expect(host.querySelector('.wr-data-grid-checkbox-caption')).toBeNull();

    grid.dataGridConfig = {
      ...grid.dataGridConfig,
      columns: grid.dataGridConfig.columns.map((column) =>
        column.id === 'action' ? { ...column, fieldPath: '' } : column,
      ),
    };
    const iconOnlyButton = host.querySelector<HTMLButtonElement>('.wr-data-grid-button');
    expect(iconOnlyButton?.textContent).toBe('');
    expect(iconOnlyButton?.getAttribute('aria-label')).toBe('Action');
    expect(iconOnlyButton?.querySelector('.wr-data-grid-button-caption')).toBeNull();
    expect(iconOnlyButton?.querySelector('.wr-button-icon')).not.toBeNull();

    grid.dataGridConfig = {
      ...grid.dataGridConfig,
      columns: grid.dataGridConfig.columns.map((column) =>
        column.id === 'name' ? { ...column, fieldPath: '' } : column,
      ),
    };
    expect(host.querySelector('.wr-data-grid-body-row .wr-data-grid-cell')?.textContent).toBe('');

    const firstCell = host.querySelector<HTMLDivElement>(
      '.wr-data-grid-body-row .wr-data-grid-cell',
    );
    const nextCell = firstCell?.nextElementSibling as HTMLDivElement | null;
    expect(firstCell?.tabIndex).toBe(0);
    firstCell?.focus();
    firstCell?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    expect(document.activeElement).toBe(nextCell);
    nextCell?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(clicked).toEqual([
      expect.objectContaining({
        rowIndex: 0,
        columnIndex: 1,
        value: 'https://example.test/ada.png',
        row: expect.objectContaining({ name: 'Ada' }),
      }),
    ]);
    expect(clicked[0]?.getValue<string>('name')).toBe('Ada');
    expect(clicked[0]?.getValue<boolean>('/active')).toBe(true);
    expect(clicked[0]?.getValue('missing')).toBeUndefined();

    host.querySelector<HTMLButtonElement>('button')?.click();
    expect(clicked).toEqual([
      expect.objectContaining({ rowIndex: 0, columnIndex: 1 }),
      expect.objectContaining({
        rowIndex: 0,
        columnIndex: 2,
        value: undefined,
        row: expect.objectContaining({ name: 'Ada' }),
      }),
    ]);
    expect(clicked[1]?.getValue<string>('name')).toBe('Ada');
    grid.dataGridConfig = {
      ...grid.dataGridConfig,
      columns: grid.dataGridConfig.columns.map((column) =>
        column.id === 'action' ? { ...column, buttonIcon: null } : column,
      ),
    };
    expect(host.querySelector('.wr-data-grid-button .wr-button-icon')).toBeNull();
    host.remove();
  });

  it('updates every grid bound to one API client after each successful execution', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payload: {
              customers: [
                { name: 'Ada', status: 'Active' },
                { name: 'Linus', status: 'Pending' },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payload: {
              customers: [{ name: 'Grace', status: 'Suspended' }],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
    const api = new WebApiClient({
      id: 'customers-api',
      fetch: fetchMock,
      apiClientConfig: {
        schemaVersion: 1,
        defaultHeaders: [],
        timeoutMs: 30_000,
        operations: [
          {
            id: 'load-customers',
            name: 'LoadCustomers',
            method: 'GET',
            path: 'https://api.example.test/customers',
            headers: [],
            query: [],
            body: { kind: 'none', content: '' },
            credentials: 'omit',
            timeoutMs: null,
            responseSchema: {
              version: 1,
              root: {
                id: 'response',
                name: 'Response',
                path: '',
                kind: 'object',
                fieldType: 'object',
                nullable: false,
                children: [
                  {
                    id: 'customers',
                    name: 'customers',
                    path: '/payload/customers',
                    kind: 'list',
                    fieldType: 'list',
                    nullable: false,
                    children: [],
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const namesHost = document.createElement('div');
    const statusesHost = document.createElement('div');
    document.body.append(namesHost, statusesHost);

    const bindGrid = (
      host: HTMLDivElement,
      id: string,
      header: string,
      fieldPath: string,
    ): WebDataGrid => {
      const grid = new WebDataGrid(host);
      const configuration: WebDataGridConfiguration = {
        schemaVersion: 2,
        apiClientId: 'customers-api',
        operationId: 'load-customers',
        listPath: '/payload/customers',
        columnCount: 1,
        showHeader: true,
        stickyHeader: true,
        showFooter: false,
        stickyFooter: true,
        rowHeightMode: 'dynamic',
        fixedRowHeight: 40,
        minRowHeight: 36,
        maxRowHeight: null,
        cellPaddingHorizontal: 10,
        cellPaddingVertical: 8,
        wrapText: false,
        stripedRows: false,
        showHorizontalLines: true,
        showVerticalLines: false,
        emptyMessage: 'No customers',
        columns: [
          {
            id,
            header,
            fieldPath,
            cellKind: 'text',
            fixedCaption: '',
            buttonIcon: null,
            footer: '',
            widthMode: 'dynamic',
            width: 180,
            minWidth: 96,
            maxWidth: null,
            flex: 1,
            headerAlign: 'start',
            cellAlign: 'start',
          },
        ],
      };
      grid.dataGridConfig = configuration;
      grid.bindApiClient(api);
      return grid;
    };

    const namesGrid = bindGrid(namesHost, 'name', 'Name', '/name');
    const statusesGrid = bindGrid(statusesHost, 'status', 'Status', '/status');
    try {
      expect(namesHost.textContent).toContain('No customers');
      expect(statusesHost.textContent).toContain('No customers');

      await api.execute('LoadCustomers');

      expect(namesHost.querySelectorAll('.wr-data-grid-body-row')).toHaveLength(2);
      expect(statusesHost.querySelectorAll('.wr-data-grid-body-row')).toHaveLength(2);
      expect(namesHost.textContent).toContain('Ada');
      expect(namesHost.textContent).toContain('Linus');
      expect(statusesHost.textContent).toContain('Active');
      expect(statusesHost.textContent).toContain('Pending');

      await api.execute('LoadCustomers');

      expect(namesHost.querySelectorAll('.wr-data-grid-body-row')).toHaveLength(1);
      expect(statusesHost.querySelectorAll('.wr-data-grid-body-row')).toHaveLength(1);
      expect(namesHost.textContent).toContain('Grace');
      expect(namesHost.textContent).not.toContain('Ada');
      expect(statusesHost.textContent).toContain('Suspended');
      expect(statusesHost.textContent).not.toContain('Pending');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      namesGrid.dispose();
      statusesGrid.dispose();
      namesHost.remove();
      statusesHost.remove();
    }
  });
});
