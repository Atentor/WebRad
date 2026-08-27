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
  WebTextArea,
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
      classNames: [
        'wr-component',
        'wr-webbutton',
        'wr-button-content-text-icon',
        'wr-button-icon-left',
      ],
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

  it('projects Data Grid line, surface, and inner-control properties through CSS variables', () => {
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

    const clicked: unknown[] = [];
    grid.bindEvent('OnCellClick', (_sender, event) => {
      clicked.push((event as CustomEvent).detail);
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
      expect.objectContaining({ rowIndex: 0, row: expect.objectContaining({ name: 'Ada' }) }),
    ]);

    host.querySelector<HTMLButtonElement>('button')?.click();
    expect(clicked).toEqual([
      expect.objectContaining({ rowIndex: 0, row: expect.objectContaining({ name: 'Ada' }) }),
      expect.objectContaining({ rowIndex: 0, row: expect.objectContaining({ name: 'Ada' }) }),
    ]);
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
