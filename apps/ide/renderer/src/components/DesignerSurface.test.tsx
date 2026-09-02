// @vitest-environment jsdom

import {
  createDefaultComponentLayout,
  createPage,
  createReusableElement,
  DEFAULT_PROJECT_SETTINGS,
  type ComponentNode,
  type PageModel,
  type ReusableElementModel,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerSurface } from './DesignerSurface';
import { WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';

afterEach(cleanup);

function responsivePage(): PageModel {
  const initial = createPage('PageMain', {
    idFactory: (() => {
      let sequence = 0;
      return () => `designer-${String((sequence += 1))}`;
    })(),
  });
  const root = initial.components[0];
  if (root === undefined) throw new Error('Expected page root.');
  const first = {
    id: 'first',
    type: 'WebButton',
    name: 'FirstButton',
    parentId: root.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 20, y: 20, width: 120, height: 36 },
    props: { caption: 'First', enabled: true },
    events: {},
    children: [],
  } as const;
  const second = {
    id: 'second',
    type: 'WebButton',
    name: 'SecondButton',
    parentId: root.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 180, y: 20, width: 120, height: 36 },
    props: { caption: 'Second', enabled: true },
    events: {},
    children: [],
  } as const;
  return {
    ...initial,
    components: [
      {
        ...root,
        layout: {
          ...root.layout,
          container: { ...root.layout.container, mode: 'row' as const, gap: 12, wrap: true },
        },
        children: [first.id, second.id],
      },
      first,
      second,
    ],
  };
}

function pageWithApiClient(): PageModel {
  const page = responsivePage();
  const root = page.components.find((component) => component.id === page.rootComponentId);
  if (root === undefined) throw new Error('Expected page root.');
  const apiClient: ComponentNode = {
    id: 'api-client',
    type: 'WebApiClient',
    name: 'ApiClient1',
    parentId: root.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    props: { baseUrl: '' },
    events: {},
    children: [],
  };
  return {
    ...page,
    components: [
      ...page.components.map((component) =>
        component.id === root.id
          ? { ...component, children: [...component.children, apiClient.id] }
          : component,
      ),
      apiClient,
    ],
  };
}

function pageWithPopup(): PageModel {
  const page = responsivePage();
  const root = page.components.find((component) => component.id === page.rootComponentId);
  if (root === undefined) throw new Error('Expected page root.');
  const popup: ComponentNode = {
    id: 'popup',
    type: 'WebPopup',
    name: 'Popup1',
    parentId: root.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width: 360, height: 200 },
    props: {
      modal: true,
      visible: false,
      collapseWhenHidden: true,
      enabled: true,
    },
    events: { OnShow: null, OnHide: null, OnClose: null, OnCancel: null },
    children: [],
  };
  return {
    ...page,
    components: [
      ...page.components.map((component) =>
        component.id === root.id
          ? { ...component, children: [...component.children, popup.id] }
          : component,
      ),
      popup,
    ],
  };
}

function pageWithPopupChild(): PageModel {
  const page = pageWithPopup();
  const popup = page.components.find((component) => component.id === 'popup');
  if (popup === undefined) throw new Error('Expected Popup.');
  const child: ComponentNode = {
    id: 'popup-button',
    type: 'WebButton',
    name: 'PopupButton',
    parentId: popup.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 16, y: 12, width: 140, height: 36 },
    props: { caption: 'Save', visible: true, enabled: true },
    events: { OnClick: null },
    children: [],
  };
  return {
    ...page,
    components: [
      ...page.components.map((component) =>
        component.id === popup.id
          ? {
              ...component,
              children: [child.id],
              layout: {
                ...component.layout,
                container: {
                  ...component.layout.container,
                  mode: 'row' as const,
                  gap: 10,
                },
              },
            }
          : component,
      ),
      child,
    ],
  };
}

function pageWithFloatingReusableElement(): {
  readonly page: PageModel;
  readonly reusableElement: ReusableElementModel;
  readonly instance: ComponentNode;
} {
  const page = responsivePage();
  const pageRoot = page.components.find((component) => component.id === page.rootComponentId);
  if (pageRoot === undefined) throw new Error('Expected page root.');

  let reusableIdSequence = 0;
  const reusableElement = createReusableElement('CustomerCard', {
    idFactory: () => `customer-card-${String((reusableIdSequence += 1))}`,
  });
  const reusableRoot = reusableElement.components.find(
    (component) => component.id === reusableElement.rootComponentId,
  );
  if (reusableRoot === undefined) throw new Error('Expected reusable root.');
  const reusableLabel: ComponentNode = {
    id: 'customer-card-label',
    type: 'WebLabel',
    name: 'CustomerCardLabel',
    parentId: reusableRoot.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 12, y: 12, width: 180, height: 28 },
    props: { caption: 'Customer summary', visible: true, enabled: true },
    events: { OnClick: null },
    children: [],
  };
  const reusableDefinition: ReusableElementModel = {
    ...reusableElement,
    components: [{ ...reusableRoot, children: [reusableLabel.id] }, reusableLabel],
  };
  const instance: ComponentNode = {
    id: 'customer-card-instance',
    type: 'WebReusableElement',
    name: 'CustomerCardInstance',
    parentId: pageRoot.id,
    layout: createDefaultComponentLayout(),
    bounds: { x: 32, y: 48, width: 360, height: 240 },
    props: {
      reusableElementId: reusableDefinition.id,
      placement: 'floating',
      floatingHorizontalAnchor: 'right',
      floatingVerticalAnchor: 'bottom',
      floatingZIndex: 240,
      visible: true,
      enabled: true,
    },
    events: {},
    children: [],
  };
  return {
    page: {
      ...page,
      components: [
        ...page.components.map((component) =>
          component.id === pageRoot.id
            ? { ...component, children: [...component.children, instance.id] }
            : component,
        ),
        instance,
      ],
    },
    reusableElement: reusableDefinition,
    instance,
  };
}

interface RenderSurfaceOptions {
  readonly selectedIds?: readonly string[];
  readonly selectedPaletteType?: string | null;
  readonly onAddComponent?: (
    type: string,
    point: { x: number; y: number },
    parentId: string,
  ) => void;
  readonly onAddReusableElement?: (
    reusableElementId: string,
    point: { x: number; y: number },
    parentId: string,
  ) => void;
  readonly onSelect?: (ids: readonly string[], primaryId?: string) => void;
  readonly onReorderComponents?: (
    parentId: string,
    componentIds: readonly string[],
    beforeComponentId: string | null,
  ) => void;
  readonly onComponentActivate?: (componentId: string) => void;
  readonly onOpenReusableElement?: (reusableElementId: string) => void;
  readonly onDefaultEvent?: (componentId: string) => void;
  readonly onResizeComponent?: (id: string, bounds: ComponentNode['bounds']) => void;
  readonly reusableElements?: readonly ReusableElementModel[];
}

function renderSurface(page: PageModel = responsivePage(), options: RenderSurfaceOptions = {}) {
  const onSelect = options.onSelect ?? vi.fn();
  const onAddComponent = options.onAddComponent ?? vi.fn();
  const onAddReusableElement = options.onAddReusableElement ?? vi.fn();
  const onReorderComponents = options.onReorderComponents ?? vi.fn();
  const onComponentActivate = options.onComponentActivate ?? vi.fn();
  const onOpenReusableElement = options.onOpenReusableElement ?? vi.fn();
  const onDefaultEvent = options.onDefaultEvent ?? vi.fn();
  const onResizeComponent = options.onResizeComponent ?? vi.fn();
  const renderDesignerSurface = (selectedIds: readonly string[]) => (
    <DesignerSurface
      page={page}
      reusableElements={options.reusableElements}
      settings={DEFAULT_PROJECT_SETTINGS}
      selectedIds={selectedIds}
      selectedPaletteType={options.selectedPaletteType ?? null}
      zoom={100}
      onSelect={onSelect}
      onAddComponent={onAddComponent}
      onAddReusableElement={onAddReusableElement}
      onMoveComponents={vi.fn()}
      onReorderComponents={onReorderComponents}
      onResizeComponent={onResizeComponent}
      onDeleteSelection={vi.fn()}
      onCopy={vi.fn()}
      onPaste={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onBringToFront={vi.fn()}
      onSendToBack={vi.fn()}
      onZoomChange={vi.fn()}
      onComponentActivate={onComponentActivate}
      onOpenReusableElement={onOpenReusableElement}
      onDefaultEvent={onDefaultEvent}
    />
  );
  const view = render(renderDesignerSurface(options.selectedIds ?? []));
  return {
    ...view,
    rerenderWithSelectedIds: (selectedIds: readonly string[]) =>
      view.rerender(renderDesignerSurface(selectedIds)),
    onSelect,
    onAddComponent,
    onAddReusableElement,
    onReorderComponents,
    onComponentActivate,
    onOpenReusableElement,
    onDefaultEvent,
    onResizeComponent,
  };
}

describe('DesignerSurface responsive projection', () => {
  it('uses the runtime flow projection and changes the responsive canvas viewport', () => {
    const { container } = renderSurface();
    const children = container.querySelector<HTMLElement>('.wr-runtime-children-row');
    const firstItem = container.querySelector<HTMLElement>('[data-designer-node-id="first"]');
    const surface = container.querySelector<HTMLElement>('.wr-page-surface');

    expect(children?.style.display).toBe('flex');
    expect(children?.style.flexDirection).toBe('row');
    expect(firstItem?.style.position).toBe('relative');
    expect(surface?.style.width).toBe('1280px');

    fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'mobile' } });
    expect(surface?.style.width).toBe('390px');
  });

  it('removes an invisible component from the Designer layout when configured to collapse', () => {
    const page = responsivePage();
    const hiddenPage: PageModel = {
      ...page,
      components: page.components.map((component) =>
        component.id === 'second'
          ? { ...component, props: { ...component.props, visible: false } }
          : component,
      ),
    };
    const collapsed = renderSurface(hiddenPage);
    const collapsedNode = collapsed.container.querySelector<HTMLElement>(
      '[data-designer-node-id="second"]',
    );
    if (collapsedNode === null) throw new Error('Expected collapsed Designer node.');
    expect(collapsedNode.style.display).toBe('none');
    collapsed.unmount();

    const retainedPage: PageModel = {
      ...hiddenPage,
      components: hiddenPage.components.map((component) =>
        component.id === 'second'
          ? { ...component, props: { ...component.props, collapseWhenHidden: false } }
          : component,
      ),
    };
    const retained = renderSurface(retainedPage);
    const retainedNode = retained.container.querySelector<HTMLElement>(
      '[data-designer-node-id="second"]',
    );
    const retainedButton = retained.container.querySelector<HTMLButtonElement>(
      '[data-component-id="second"]',
    );
    if (retainedNode === null || retainedButton === null) {
      throw new Error('Expected retained Designer node.');
    }
    expect(retainedNode.style.display).not.toBe('none');
    expect(retainedButton.hidden).toBe(false);
    expect(retainedButton.style.visibility).toBe('hidden');
  });

  it('offers row siblings to the host as a reorder operation instead of an x/y move', () => {
    const onReorderComponents = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const { container } = renderSurface(responsivePage(), { onReorderComponents });
    const first = container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="first"]');
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    if (first === null || overlay === null) throw new Error('Expected designer hit targets.');

    fireEvent.pointerDown(first, { button: 0, pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 420, clientY: 38 });
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 420, clientY: 38 });

    expect(onReorderComponents).toHaveBeenCalledWith('designer-2', ['first'], null);
  });

  it('activates visual and nonvisual components through the generic callback', () => {
    const onSelect = vi.fn();
    const onComponentActivate = vi.fn();
    const onDefaultEvent = vi.fn();
    const { container } = renderSurface(pageWithApiClient(), {
      onSelect,
      onComponentActivate,
      onDefaultEvent,
    });
    const visual = container.querySelector<HTMLElement>(
      '.wr-design-hit[data-component-id="first"]',
    );
    if (visual === null) throw new Error('Expected visual component hit target.');

    fireEvent.doubleClick(visual);
    expect(onComponentActivate).toHaveBeenCalledWith('first');

    const apiClient = screen.getByRole('option', { name: 'ApiClient1, API Client' });
    expect(apiClient.getAttribute('title')).toBe(
      'ApiClient1: WebApiClient. Double-click to activate.',
    );
    fireEvent.doubleClick(apiClient);

    expect(onSelect).toHaveBeenLastCalledWith(['api-client'], 'api-client');
    expect(onComponentActivate).toHaveBeenLastCalledWith('api-client');
    expect(onComponentActivate).toHaveBeenCalledTimes(2);
    expect(onDefaultEvent).not.toHaveBeenCalled();
  });

  it('shows a runtime visual Popup in the nonvisual tray instead of canvas geometry', () => {
    const { container } = renderSurface(pageWithPopup());

    const popup = screen.getByRole('option', { name: 'Popup1, Popup' });
    expect(popup.getAttribute('title')).toBe('Popup1: WebPopup. Double-click to activate.');
    expect(container.querySelector('[data-component-id="popup"]')).toBeNull();
    expect(container.querySelector('[data-component-type="WebPopup"]')).toBeNull();
  });

  it('opens a selected Popup as a centered floating responsive container editor', () => {
    const { container } = renderSurface(pageWithPopupChild(), { selectedIds: ['popup'] });

    const editor = container.querySelector<HTMLElement>('[data-designer-node-id="popup"]');
    const popup = container.querySelector<HTMLElement>('[data-component-id="popup"]');
    const popupChildren = container.querySelector<HTMLElement>('[data-webrad-popup-children]');
    const responsiveChildren = popupChildren?.querySelector<HTMLElement>(
      '.wr-runtime-children-row',
    );
    const child = container.querySelector<HTMLElement>('[data-designer-node-id="popup-button"]');
    if (
      editor === null ||
      popup === null ||
      popupChildren === null ||
      responsiveChildren == null ||
      child === null
    ) {
      throw new Error('Expected the floating Popup editor and its child.');
    }

    expect(editor.parentElement?.className).toContain('wr-designer-floating-layer');
    expect(editor.style.left).toBe('460px');
    expect(editor.style.top).toBe('200px');
    expect(popup.hidden).toBe(false);
    expect(responsiveChildren.style.display).toBe('flex');
    expect(responsiveChildren.style.gap).toBe('10px');
    expect(child.parentElement).toBe(responsiveChildren);
    expect(child.style.display).toBe('flex');
  });

  it('keeps Popup child selection feedback aligned while its inner body scrolls', async () => {
    let childLeft = 500;
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
        if (this.classList.contains('wr-page-surface')) return rectangle(0, 0, 1280, 600);
        if (this.dataset.designerNodeId === 'popup') return rectangle(460, 200, 360, 200);
        if (this.dataset.designerNodeId === 'popup-button') {
          return rectangle(childLeft, 260, 140, 36);
        }
        return rectangle(0, 0, 0, 0);
      });

    try {
      const { container } = renderSurface(pageWithPopupChild(), { selectedIds: ['popup-button'] });
      const popupBody = container.querySelector<HTMLElement>('[data-webrad-popup-children]');
      if (popupBody === null) throw new Error('Expected the Popup child host.');

      await waitFor(() => {
        expect(
          container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="popup-button"]')
            ?.style.left,
        ).toBe('500px');
      });

      childLeft = 468;
      fireEvent.scroll(popupBody);

      await waitFor(() => {
        expect(
          container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="popup-button"]')
            ?.style.left,
        ).toBe('468px');
      });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('remeasures Popup child feedback after the floating editor closes and reopens', async () => {
    let childLeft = 500;
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
        if (this.classList.contains('wr-page-surface')) return rectangle(0, 0, 1280, 600);
        if (this.dataset.designerNodeId === 'popup') return rectangle(460, 200, 360, 200);
        if (this.dataset.designerNodeId === 'popup-button') {
          return rectangle(childLeft, 260, 140, 36);
        }
        return rectangle(0, 0, 0, 0);
      });

    try {
      const { container, rerenderWithSelectedIds } = renderSurface(pageWithPopupChild(), {
        selectedIds: ['popup-button'],
      });

      await waitFor(() => {
        expect(
          container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="popup-button"]')
            ?.style.left,
        ).toBe('500px');
      });

      rerenderWithSelectedIds([]);
      await waitFor(() => {
        expect(
          container.querySelector('.wr-design-hit[data-component-id="popup-button"]'),
        ).toBeNull();
      });

      childLeft = 468;
      rerenderWithSelectedIds(['popup-button']);

      await waitFor(() => {
        expect(
          container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="popup-button"]')
            ?.style.left,
        ).toBe('468px');
      });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('uses the floating Popup editor as the drop target and preserves its page-independent bounds', () => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const onAddComponent = vi.fn();
    const onResizeComponent = vi.fn();
    const { container } = renderSurface(pageWithPopup(), {
      selectedIds: ['popup'],
      onAddComponent,
      onResizeComponent,
    });
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    const popupHit = container.querySelector<HTMLElement>(
      '.wr-design-hit[data-component-id="popup"]',
    );
    const eastHandle = popupHit?.querySelector<HTMLElement>('.handle-e');
    if (overlay === null || popupHit === null || eastHandle == null) {
      throw new Error('Expected Popup editor design targets.');
    }

    const dropEvent = new MouseEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 500,
      clientY: 300,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        getData: (type: string) => (type === 'application/x-webrad-component' ? 'WebButton' : ''),
      },
    });
    fireEvent(overlay, dropEvent);
    expect(onAddComponent).toHaveBeenCalledWith('WebButton', { x: 40, y: 100 }, 'popup');

    fireEvent.pointerDown(eastHandle, {
      button: 0,
      pointerId: 8,
      clientX: 820,
      clientY: 360,
    });
    fireEvent.pointerMove(overlay, { pointerId: 8, clientX: 860, clientY: 360 });
    fireEvent.pointerUp(overlay, { pointerId: 8, clientX: 860, clientY: 360 });
    expect(onResizeComponent).toHaveBeenCalledWith(
      'popup',
      expect.objectContaining({ x: 0, y: 0, width: 404, height: 200 }),
    );
  });

  it('renders, selects, and opens a floating reusable-component instance', () => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const fixture = pageWithFloatingReusableElement();
    const onSelect = vi.fn();
    const onOpenReusableElement = vi.fn();
    const { container } = renderSurface(fixture.page, {
      onSelect,
      onOpenReusableElement,
      reusableElements: [fixture.reusableElement],
    });
    const instance = container.querySelector<HTMLElement>(
      '[data-component-id="customer-card-instance"][data-webrad-reusable-instance="true"]',
    );
    const renderedDefinition = container.querySelector<HTMLElement>(
      '[data-reusable-element-id="customer-card-1"]',
    );
    const hitTarget = container.querySelector<HTMLElement>(
      '.wr-design-hit[data-component-id="customer-card-instance"]',
    );
    const runtimeNode = container.querySelector<HTMLElement>(
      '[data-designer-node-id="customer-card-instance"]',
    );
    if (
      instance === null ||
      renderedDefinition === null ||
      hitTarget === null ||
      runtimeNode === null
    ) {
      throw new Error('Expected a rendered reusable component instance.');
    }

    expect(renderedDefinition.textContent).toContain('Customer summary');
    expect(runtimeNode.style.position).toBe('absolute');
    expect(runtimeNode.style.left).toBe('888px');
    expect(runtimeNode.style.top).toBe('312px');
    expect(runtimeNode.parentElement?.className).toContain('wr-designer-floating-layer');
    expect(hitTarget.style.zIndex).toBe('10240');

    fireEvent.pointerDown(hitTarget, {
      button: 0,
      pointerId: 3,
      clientX: 40,
      clientY: 56,
    });
    expect(onSelect).toHaveBeenCalledWith([fixture.instance.id], fixture.instance.id);

    fireEvent.doubleClick(hitTarget);
    expect(onOpenReusableElement).toHaveBeenCalledWith(fixture.reusableElement.id);
  });

  it('inserts a reusable component from the dedicated drag data type', () => {
    const fixture = pageWithFloatingReusableElement();
    const onAddReusableElement = vi.fn();
    const { container } = renderSurface(fixture.page, {
      onAddReusableElement,
      reusableElements: [fixture.reusableElement],
    });
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    if (overlay === null) throw new Error('Expected the design overlay.');

    // jsdom has no DragEvent implementation; MouseEvent preserves the drop
    // coordinates while dataTransfer supplies the reusable element payload.
    const dropEvent = new MouseEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 20,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        getData: (type: string) =>
          type === WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE ? fixture.reusableElement.id : '',
      },
    });
    fireEvent(overlay, dropEvent);

    expect(onAddReusableElement).toHaveBeenCalledWith(
      fixture.reusableElement.id,
      { x: 100, y: 20 },
      fixture.page.rootComponentId,
    );
  });

  it('resizes a right/bottom floating instance in viewport coordinates', () => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const fixture = pageWithFloatingReusableElement();
    const onResizeComponent = vi.fn();
    const { container } = renderSurface(fixture.page, {
      selectedIds: [fixture.instance.id],
      onResizeComponent,
      reusableElements: [fixture.reusableElement],
    });
    const handle = container.querySelector<HTMLElement>(
      `.wr-design-hit[data-component-id="${fixture.instance.id}"] .handle-se`,
    );
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    if (handle === null || overlay === null)
      throw new Error('Expected the floating resize handle.');

    fireEvent.pointerDown(handle, { pointerId: 9, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(overlay, { pointerId: 9, clientX: 20, clientY: 10 });
    fireEvent.pointerUp(overlay, { pointerId: 9, clientX: 20, clientY: 10 });

    expect(onResizeComponent).toHaveBeenCalledWith(fixture.instance.id, {
      x: 8,
      y: 40,
      width: 384,
      height: 248,
    });
  });
});
