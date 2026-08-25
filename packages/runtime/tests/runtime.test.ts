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
  WebPage,
  WebImage,
  WebLabel,
  WebListBox,
  WebNonvisualComponent,
  WebPanel,
  WebTextArea,
  mountPage,
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
  type RuntimePageModel,
} from '../src/index.js';

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
      height: 'fit-content',
      'flex-basis': '0px',
      'flex-grow': '2',
      'flex-shrink': '1',
    });
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
