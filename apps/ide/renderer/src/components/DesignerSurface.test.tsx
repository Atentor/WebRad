// @vitest-environment jsdom

import {
  createDefaultComponentLayout,
  createDefaultRepeatingGroupConfiguration,
  createPage,
  createReusableElement,
  DEFAULT_PROJECT_SETTINGS,
  type ComponentNode,
  type PageModel,
  type ReusableElementModel,
} from '@webrad/project-model';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerSurface } from './DesignerSurface';
import { WEBRAD_REUSABLE_ELEMENT_DRAG_TYPE } from './ToolPalette';

afterEach(cleanup);

it.each(['fixed', 'align-to-parent', 'row', 'column'] as const)(
  'keeps one editable Repeating Group template with the full %s layout contract',
  (mode) => {
    const page = responsivePage();
    const root = page.components[0];
    const button = page.components[1];
    if (root === undefined || button === undefined) throw new Error('Missing Designer fixture.');
    const group: ComponentNode = {
      ...button,
      id: 'group',
      name: 'RepeatingGroup1',
      type: 'WebRepeatingGroup',
      parentId: root.id,
      bounds: { x: 10, y: 20, width: 320, height: 300 },
      props: {
        repeatingGroupConfig: {
          ...createDefaultRepeatingGroupConfiguration(),
          rowHeightMode: 'fixed',
          fixedRowHeight: 160,
        },
      },
      children: [button.id],
      layout: {
        ...button.layout,
        container: { ...button.layout.container, mode, paddingLeft: 12, gap: 8, wrap: true },
      },
    };
    const child = {
      ...button,
      parentId: group.id,
      layout: {
        ...button.layout,
        item: {
          ...button.layout.item,
          width: 'stretch' as const,
          alignSelf: 'end' as const,
          horizontalAnchor: 'stretch' as const,
        },
      },
    };
    const { container } = renderSurface({
      ...page,
      components: [{ ...root, children: [group.id] }, group, child],
    });
    const groupElement = container.querySelector<HTMLElement>('[data-component-id="group"]');
    const host = groupElement?.querySelector<HTMLElement>('[data-designer-parent-id="group"]');
    expect(groupElement?.querySelectorAll('[data-webrad-repeating-row]').length).toBe(1);
    expect(host?.dataset.webradRepeatingRow).toBe('template');
    expect(host?.style.height).toBe('160px');
    expect(host?.style.paddingLeft).toBe(mode === 'fixed' ? '' : '12px');
    const childElement = host?.querySelector<HTMLElement>('[data-designer-node-id="first"]');
    expect(childElement?.classList.contains(`wr-runtime-item-${mode}`)).toBe(true);
    if (mode === 'row' || mode === 'column') expect(childElement?.style.alignSelf).toBe('flex-end');
    expect(groupElement?.querySelector('[role="columnheader"]')).toBeNull();
  },
);

it('keeps an empty Repeating Group row as a real editable child host', () => {
  const page = responsivePage();
  const current = {
    ...page,
    components: page.components.map((component) =>
      component.id === 'first'
        ? {
            ...component,
            type: 'WebRepeatingGroup',
            props: { repeatingGroupConfig: createDefaultRepeatingGroupConfiguration() },
          }
        : component,
    ),
  };
  const { container } = renderSurface(current);
  const host = container.querySelector<HTMLElement>('[data-designer-parent-id="first"]');
  expect(host).not.toBeNull();
  expect(host?.textContent).toContain('Drop components to design one repeated row');
  expect(host?.style.minHeight).toBe('80px');
});

it('applies Margin to the Designer layout host once, including components with a selected style', () => {
  const page = responsivePage();
  const { container } = renderSurface({
    ...page,
    components: page.components.map((node) =>
      node.id === 'first'
        ? {
            ...node,
            props: { ...node.props, margin: 12, marginTop: 3, marginLeft: 0 },
            styleId: 'selected-style',
          }
        : node,
    ),
  });
  const button = container.querySelector<HTMLElement>('[data-component-id="first"]');
  expect(button?.style.margin).toBe('0px');
  expect(button?.parentElement?.style.margin).toBe('3px 12px 12px 0px');
});

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
    width: 1280,
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

it('projects individual item alignment onto the Designer layout hosts', () => {
  const page = responsivePage();
  const { container } = renderSurface({
    ...page,
    components: page.components.map((node) =>
      node.id === 'first'
        ? {
            ...node,
            layout: { ...node.layout, item: { ...node.layout.item, alignSelf: 'center' } },
          }
        : node.id === 'second'
          ? { ...node, layout: { ...node.layout, item: { ...node.layout.item, alignSelf: 'end' } } }
          : node,
    ),
  });
  expect(
    container.querySelector<HTMLElement>('[data-component-id="first"]')?.parentElement?.style
      .alignSelf,
  ).toBe('center');
  expect(
    container.querySelector<HTMLElement>('[data-component-id="second"]')?.parentElement?.style
      .alignSelf,
  ).toBe('flex-end');
});

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
  readonly zoom?: number;
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
  readonly onMoveComponents?: (ids: readonly string[], delta: { x: number; y: number }) => void;
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
  const onMoveComponents = options.onMoveComponents ?? vi.fn();
  const onResizeComponent = options.onResizeComponent ?? vi.fn();
  const renderDesignerSurface = (
    selectedIds: readonly string[],
    currentPage = page,
    currentZoom = options.zoom ?? 100,
  ) => (
    <DesignerSurface
      page={currentPage}
      reusableElements={options.reusableElements}
      settings={DEFAULT_PROJECT_SETTINGS}
      selectedIds={selectedIds}
      selectedPaletteType={options.selectedPaletteType ?? null}
      zoom={currentZoom}
      onSelect={onSelect}
      onAddComponent={onAddComponent}
      onAddReusableElement={onAddReusableElement}
      onMoveComponents={onMoveComponents}
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
    />
  );
  const view = render(renderDesignerSurface(options.selectedIds ?? []));
  return {
    ...view,
    rerenderWithSelectedIds: (selectedIds: readonly string[]) =>
      view.rerender(renderDesignerSurface(selectedIds)),
    rerenderWithPage: (currentPage: PageModel) =>
      view.rerender(renderDesignerSurface(options.selectedIds ?? [], currentPage)),
    rerenderWithZoom: (currentZoom: number) =>
      view.rerender(renderDesignerSurface(options.selectedIds ?? [], page, currentZoom)),
    onSelect,
    onAddComponent,
    onAddReusableElement,
    onReorderComponents,
    onComponentActivate,
    onOpenReusableElement,
    onMoveComponents,
    onResizeComponent,
  };
}

function fixedPage(): PageModel {
  const page = responsivePage();
  return {
    ...page,
    components: page.components.map((node) =>
      node.id === page.rootComponentId
        ? {
            ...node,
            layout: { ...node.layout, container: { ...node.layout.container, mode: 'fixed' } },
          }
        : node.id === 'first'
          ? { ...node, bounds: { ...node.bounds, x: 24, y: 24 } }
          : node,
    ),
  };
}

function measuredPanel(sizing: 'fixed' | 'stretch' | 'fit-content', width: number, childX: number) {
  const page = fixedPage();
  const first = page.components.find((node) => node.id === 'first');
  if (first === undefined) throw new Error('Expected panel node.');
  const projected: PageModel = {
    ...page,
    components: [
      ...page.components.map((node) => {
        if (node.id === page.rootComponentId) return { ...node, children: ['first'] };
        if (node.id === 'first')
          return {
            ...node,
            type: 'WebPanel',
            bounds: { ...node.bounds, width: 300, height: 200 },
            layout: { ...node.layout, item: { ...node.layout.item, width: sizing } },
            children: ['second', 'third'],
          };
        return { ...node, parentId: 'first', bounds: { ...node.bounds, x: childX, y: 17 } };
      }),
      {
        ...first,
        id: 'third',
        name: 'ThirdButton',
        parentId: 'first',
        bounds: { x: width - 100, y: 17, width: 86, height: 36 },
      },
    ],
  };
  const rectangle = (x: number, y: number, rectangleWidth: number, height: number): DOMRect => ({
    x,
    y,
    left: x,
    top: y,
    width: rectangleWidth,
    height,
    right: x + rectangleWidth,
    bottom: y + height,
    toJSON: () => ({}),
  });
  const measure = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('wr-page-surface')) return rectangle(0, 0, 1280, 720);
      if (this.dataset.designerNodeId === 'first' || this.dataset.componentId === 'first')
        return rectangle(24, 24, width, 200);
      if (this.dataset.designerParentId === 'first') return rectangle(31, 31, width - 14, 186);
      if (this.dataset.designerNodeId === 'second' || this.dataset.designerNodeId === 'third') {
        const stored = projected.components.find(
          (node) => node.id === this.dataset.designerNodeId,
        )!;
        return rectangle(
          31 +
            (Number.parseFloat(this.style.left) || stored.bounds.x) +
            (Number.parseFloat(this.style.marginLeft) || 0),
          31 +
            (Number.parseFloat(this.style.top) || stored.bounds.y) +
            (Number.parseFloat(this.style.marginTop) || 0),
          Number.parseFloat(this.style.width) || stored.bounds.width,
          stored.bounds.height,
        );
      }
      return rectangle(0, 0, 0, 0);
    });
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.dataset.designerParentId === 'first' ? width - 14 : 0;
    });
  const clientHeight = vi
    .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.dataset.designerParentId === 'first' ? 186 : 0;
    });
  return {
    page: projected,
    restore: () => {
      cleanup();
      measure.mockRestore();
      clientWidth.mockRestore();
      clientHeight.mockRestore();
    },
  };
}

describe('DesignerSurface pointer transactions', () => {
  function targets(container: HTMLElement) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const hit = container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="first"]');
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    const surface = container.querySelector<HTMLElement>('.wr-page-surface');
    if (hit === null || overlay === null || surface === null)
      throw new Error('Expected canvas targets.');
    return { hit, overlay, surface };
  }

  it.each([50, 100, 150])(
    'commits the pointerup position at %s%% even without a pointermove',
    (zoom) => {
      const { container, onMoveComponents } = renderSurface(fixedPage(), { zoom });
      const { hit, overlay } = targets(container);
      const scale = zoom / 100;
      fireEvent.pointerDown(hit, {
        button: 0,
        pointerId: 31,
        clientX: 30 * scale,
        clientY: 30 * scale,
      });
      fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 70 * scale, clientY: 30 * scale });
      expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['first'], { x: 40, y: 0 });
    },
  );

  it('uses the final coordinates when several moves arrive before a preview frame', () => {
    const { container, onMoveComponents } = renderSurface(fixedPage());
    const { hit, overlay } = targets(container);
    fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 46, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 54, clientY: 30 });
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['first'], { x: 40, y: 0 });
  });

  it('keeps off-grid geometry unchanged on clicks and focuses canvas keyboard actions', () => {
    const page = fixedPage();
    const offGrid = {
      ...page,
      components: page.components.map((node) =>
        node.id === 'first' ? { ...node, bounds: { ...node.bounds, x: 21, y: 21 } } : node,
      ),
    };
    const { container, onMoveComponents, onResizeComponent } = renderSurface(offGrid, {
      selectedIds: ['first'],
    });
    const { hit, overlay, surface } = targets(container);
    fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 31, clientY: 31 });
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 31, clientY: 31 });
    expect(onMoveComponents).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(surface);
    const handle = hit.querySelector<HTMLElement>('.handle-e');
    if (handle === null) throw new Error('Expected resize handle.');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 32, clientX: 141, clientY: 31 });
    fireEvent.pointerUp(overlay, { pointerId: 32, clientX: 141, clientY: 31 });
    expect(onResizeComponent).not.toHaveBeenCalled();
    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['first'], { x: 1, y: 0 });
  });

  it('ignores secondary buttons and pointers during a transaction', () => {
    const { container, onMoveComponents, onResizeComponent } = renderSurface(fixedPage(), {
      selectedIds: ['first'],
    });
    const { hit, overlay } = targets(container);
    const handle = hit.querySelector<HTMLElement>('.handle-e');
    if (handle === null) throw new Error('Expected resize handle.');
    fireEvent.pointerDown(handle, { button: 2, pointerId: 30, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(overlay, { pointerId: 30, clientX: 40, clientY: 0 });
    expect(onResizeComponent).not.toHaveBeenCalled();
    fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 30, clientY: 30 });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 32, clientX: 144, clientY: 30 });
    fireEvent.pointerUp(overlay, { pointerId: 32, clientX: 184, clientY: 30 });
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['first'], { x: 40, y: 0 });
    expect(onResizeComponent).not.toHaveBeenCalled();
  });

  it.each(['escape', 'blur', 'capture', 'cancel', 'page', 'zoom', 'viewport'] as const)(
    'discards a drag when interrupted by %s',
    (reason) => {
      const page = fixedPage();
      const view = renderSurface(page);
      const { hit, overlay } = targets(view.container);
      fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 30, clientY: 30 });
      fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
      if (reason === 'escape') fireEvent.keyDown(window, { key: 'Escape' });
      else if (reason === 'blur') fireEvent(window, new Event('blur'));
      else if (reason === 'capture') fireEvent.lostPointerCapture(hit, { pointerId: 31 });
      else if (reason === 'cancel') fireEvent.pointerCancel(overlay, { pointerId: 31 });
      else if (reason === 'page') view.rerenderWithPage({ ...page, id: 'another-page' });
      else if (reason === 'zoom') view.rerenderWithZoom(150);
      else fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'mobile' } });
      fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
      expect(view.onMoveComponents).not.toHaveBeenCalled();
    },
  );

  it('resizes from the release coordinates without an intermediate preview event', () => {
    const { container, onResizeComponent } = renderSurface(fixedPage(), { selectedIds: ['first'] });
    const { hit, overlay } = targets(container);
    const handle = hit.querySelector<HTMLElement>('.handle-e');
    if (handle === null) throw new Error('Expected resize handle.');
    fireEvent.pointerDown(handle, { button: 0, pointerId: 32, clientX: 144, clientY: 30 });
    fireEvent.pointerUp(overlay, { pointerId: 32, clientX: 184, clientY: 30 });
    expect(onResizeComponent).toHaveBeenCalledExactlyOnceWith('first', {
      x: 24,
      y: 24,
      width: 160,
      height: 36,
    });
  });

  it('previews a selected parent and child with one movement on their common root', async () => {
    const page = fixedPage();
    const nested: PageModel = {
      ...page,
      components: page.components.map((node) => {
        if (node.id === page.rootComponentId) return { ...node, children: ['first'] };
        if (node.id === 'first')
          return {
            ...node,
            type: 'WebPanel',
            bounds: { ...node.bounds, width: 300, height: 200 },
            children: ['second'],
          };
        return { ...node, parentId: 'first', bounds: { x: 16, y: 16, width: 120, height: 36 } };
      }),
    };
    const { container, onMoveComponents } = renderSurface(nested, {
      selectedIds: ['first', 'second'],
    });
    const { hit, overlay } = targets(container);
    fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
    await waitFor(() =>
      expect(
        container.querySelector<HTMLElement>('[data-designer-node-id="first"]')?.style.left,
      ).toBe('64px'),
    );
    expect(
      container.querySelector<HTMLElement>('[data-designer-node-id="second"]')?.style.left,
    ).toBe('16px');
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 70, clientY: 30 });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['first'], { x: 40, y: 0 });
  });

  it('bounds a nested child preview to the same parent limits used on commit', async () => {
    const page = fixedPage();
    const nested: PageModel = {
      ...page,
      components: page.components.map((node) => {
        if (node.id === page.rootComponentId) return { ...node, children: ['first'] };
        if (node.id === 'first')
          return {
            ...node,
            type: 'WebPanel',
            bounds: { ...node.bounds, width: 300, height: 200 },
            children: ['second'],
          };
        return { ...node, parentId: 'first', bounds: { x: 16, y: 16, width: 120, height: 36 } };
      }),
    };
    const { container, onMoveComponents } = renderSurface(nested, { selectedIds: ['second'] });
    const overlay = container.querySelector<HTMLElement>('.wr-design-overlay');
    const hit = container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="second"]');
    targets(container);
    if (overlay === null || hit === null) throw new Error('Expected nested component.');
    fireEvent.pointerDown(hit, { button: 0, pointerId: 31, clientX: 44, clientY: 44 });
    fireEvent.pointerMove(overlay, { pointerId: 31, clientX: 600, clientY: 44 });
    await waitFor(() =>
      expect(
        container.querySelector<HTMLElement>('[data-designer-node-id="second"]')?.style.left,
      ).toBe('180px'),
    );
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 600, clientY: 44 });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second'], { x: 164, y: 0 });
  });

  it('preserves spacing on a keyboard move across different parents', () => {
    const page = fixedPage();
    const first = page.components.find((node) => node.id === 'first');
    if (first === undefined) throw new Error('Expected first component.');
    const nested: PageModel = {
      ...page,
      components: [
        ...page.components.map((node) =>
          node.id === 'first'
            ? {
                ...node,
                type: 'WebPanel',
                bounds: { ...node.bounds, width: 300, height: 200 },
                children: ['third'],
              }
            : node,
        ),
        {
          ...first,
          id: 'third',
          name: 'ThirdButton',
          parentId: 'first',
          bounds: { x: 176, y: 16, width: 120, height: 36 },
        },
      ],
    };
    const { container, onMoveComponents } = renderSurface(nested, {
      selectedIds: ['second', 'third'],
    });
    const { surface } = targets(container);
    fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
    expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second', 'third'], { x: 4, y: 0 });
  });

  it('keeps the original selection when a marquee is cancelled', () => {
    const { container, onSelect } = renderSurface(fixedPage(), { selectedIds: ['first'] });
    const { overlay } = targets(container);
    fireEvent.pointerDown(overlay, { button: 0, pointerId: 33, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(overlay, { pointerId: 33, clientX: 400, clientY: 200 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(overlay, { pointerId: 33, clientX: 400, clientY: 200 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['fixed', 'stretch', 'fixed', ['n', 's']],
    ['fixed', 'fixed', 'fit-content', ['e', 'w']],
    ['fixed', 'fit-content', 'stretch', []],
    ['row', 'fixed', 'fixed', ['e', 'se', 's']],
    ['column', 'stretch', 'fixed', ['s']],
    ['row', 'fixed', 'fit-content', ['e']],
    ['align-to-parent', 'fixed', 'fixed', []],
  ] as const)(
    'projects only working handles in %s with %s/%s sizing',
    (mode, width, height, handles) => {
      const page = fixedPage();
      const current: PageModel = {
        ...page,
        components: page.components.map((node) =>
          node.id === page.rootComponentId
            ? { ...node, layout: { ...node.layout, container: { ...node.layout.container, mode } } }
            : node.id === 'first'
              ? {
                  ...node,
                  layout: { ...node.layout, item: { ...node.layout.item, width, height } },
                }
              : node,
        ),
      };
      const { container } = renderSurface(current, { selectedIds: ['first'] });
      const { hit } = targets(container);
      expect(
        Array.from(
          hit.querySelectorAll<HTMLElement>('[data-resize-handle]'),
          (element) => element.dataset.resizeHandle,
        ),
      ).toEqual(handles);
    },
  );

  it.each([50, 100, 150])(
    'uses the real child host origin including border, padding and scroll at %s%%',
    (zoom) => {
      const page = fixedPage();
      const panel: PageModel = {
        ...page,
        components: page.components.map((node) =>
          node.id === 'first'
            ? { ...node, type: 'WebPanel', bounds: { ...node.bounds, width: 300, height: 200 } }
            : node,
        ),
      };
      const scale = zoom / 100;
      const rectangle = (x: number, y: number, width: number, height: number): DOMRect => ({
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON: () => ({}),
      });
      const measure = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          if (this.classList.contains('wr-page-surface'))
            return rectangle(100, 80, 1280 * scale, 720 * scale);
          if (this.dataset.designerNodeId === 'first')
            return rectangle(100 + 24 * scale, 80 + 24 * scale, 300 * scale, 200 * scale);
          if (this.dataset.designerParentId === 'first')
            return rectangle(100 + 31 * scale, 80 + 31 * scale, 286 * scale, 186 * scale);
          return rectangle(0, 0, 0, 0);
        });
      try {
        const { container, onAddComponent } = renderSurface(panel, { zoom });
        const { overlay } = targets(container);
        const host = container.querySelector<HTMLElement>('[data-designer-parent-id="first"]');
        if (host === null)
          throw new Error('Expected child host in the empty registered container.');
        Object.defineProperties(host, {
          clientLeft: { value: 2 },
          clientTop: { value: 3 },
          scrollLeft: { value: 12 },
          scrollTop: { value: 20 },
        });
        const event = new MouseEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: 100 + 51 * scale,
          clientY: 80 + 54 * scale,
        });
        Object.defineProperty(event, 'dataTransfer', {
          value: {
            getData: (type: string) =>
              type === 'application/x-webrad-component' ? 'WebButton' : '',
          },
        });
        fireEvent(overlay, event);
        expect(onAddComponent).toHaveBeenCalledExactlyOnceWith(
          'WebButton',
          { x: 30, y: 40 },
          'first',
        );
      } finally {
        cleanup();
        measure.mockRestore();
      }
    },
  );

  it.each(['stretch', 'fit-content'] as const)(
    'moves a child within the actual %s parent width beyond its stored bounds fallback',
    (sizing) => {
      const projection = measuredPanel(sizing, 700, 121);
      try {
        const { container, onMoveComponents } = renderSurface(projection.page, {
          selectedIds: ['second'],
        });
        const { overlay } = targets(container);
        const child = container.querySelector<HTMLElement>(
          '.wr-design-hit[data-component-id="second"]',
        );
        if (child === null) throw new Error('Expected nested child.');
        fireEvent.pointerDown(child, { button: 0, pointerId: 35, clientX: 160, clientY: 52 });
        fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 240, clientY: 52 });
        expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second'], { x: 80, y: 0 });
      } finally {
        projection.restore();
      }
    },
  );

  it('clamps child dragging inside the parent child host, excluding its visual border and padding', async () => {
    const projection = measuredPanel('fixed', 300, 16);
    try {
      const { container, onMoveComponents } = renderSurface(projection.page, {
        selectedIds: ['second'],
      });
      const { overlay } = targets(container);
      const child = container.querySelector<HTMLElement>(
        '.wr-design-hit[data-component-id="second"]',
      );
      if (child === null) throw new Error('Expected nested child.');
      fireEvent.pointerDown(child, { button: 0, pointerId: 35, clientX: 50, clientY: 52 });
      fireEvent.pointerMove(overlay, { pointerId: 35, clientX: 700, clientY: 52 });
      await waitFor(() =>
        expect(
          container.querySelector<HTMLElement>('[data-designer-node-id="second"]')?.style.left,
        ).toBe('166px'),
      );
      fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 700, clientY: 52 });
      expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second'], { x: 150, y: 0 });
    } finally {
      projection.restore();
    }
  });

  it('clamps child resizing to its parent child host instead of its outer painted size', () => {
    const projection = measuredPanel('fixed', 300, 16);
    try {
      const { container, onResizeComponent } = renderSurface(projection.page, {
        selectedIds: ['second'],
      });
      const { overlay } = targets(container);
      const handle = container.querySelector<HTMLElement>(
        '.wr-design-hit[data-component-id="second"] [data-resize-handle="e"]',
      );
      if (handle === null) throw new Error('Expected nested resize handle.');
      fireEvent.pointerDown(handle, { button: 0, pointerId: 35, clientX: 167, clientY: 52 });
      fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 700, clientY: 52 });
      expect(onResizeComponent).toHaveBeenCalledExactlyOnceWith('second', {
        x: 16,
        y: 17,
        width: 270,
        height: 36,
      });
    } finally {
      projection.restore();
    }
  });

  it('accounts for visual margins when bounding the resize inside its parent host', () => {
    const projection = measuredPanel('fixed', 300, 16);
    try {
      const page: PageModel = {
        ...projection.page,
        components: projection.page.components.map((node) =>
          node.id === 'second' ? { ...node, props: { ...node.props, marginLeft: 12 } } : node,
        ),
      };
      const { container, onResizeComponent } = renderSurface(page, { selectedIds: ['second'] });
      const { overlay } = targets(container);
      const handle = container.querySelector<HTMLElement>(
        '.wr-design-hit[data-component-id="second"] [data-resize-handle="e"]',
      );
      if (handle === null) throw new Error('Expected nested resize handle.');
      fireEvent.pointerDown(handle, { button: 0, pointerId: 35, clientX: 179, clientY: 52 });
      fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 700, clientY: 52 });
      expect(onResizeComponent).toHaveBeenCalledExactlyOnceWith('second', {
        x: 16,
        y: 17,
        width: 258,
        height: 36,
      });
    } finally {
      projection.restore();
    }
  });

  it('reserves trailing margins as well as the projected origin during a corner resize', () => {
    const projection = measuredPanel('fixed', 300, 16);
    try {
      const page: PageModel = {
        ...projection.page,
        components: projection.page.components.map((node) =>
          node.id === 'second'
            ? {
                ...node,
                props: {
                  ...node.props,
                  marginLeft: 12,
                  marginRight: 8,
                  marginTop: 7,
                  marginBottom: 5,
                },
              }
            : node,
        ),
      };
      const { container, onResizeComponent } = renderSurface(page, { selectedIds: ['second'] });
      const { overlay } = targets(container);
      const handle = container.querySelector<HTMLElement>(
        '.wr-design-hit[data-component-id="second"] [data-resize-handle="se"]',
      );
      if (handle === null) throw new Error('Expected nested corner handle.');
      fireEvent.pointerDown(handle, { button: 0, pointerId: 35, clientX: 179, clientY: 91 });
      fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 700, clientY: 700 });
      expect(onResizeComponent).toHaveBeenCalledExactlyOnceWith('second', {
        x: 16,
        y: 17,
        width: 250,
        height: 157,
      });
    } finally {
      projection.restore();
    }
  });

  it.each([
    { requested: -1000, expected: -16 },
    { requested: 1000, expected: 130 },
  ])(
    'keeps all margins inside the host when dragging by $requested pixels',
    ({ requested, expected }) => {
      const projection = measuredPanel('fixed', 300, 16);
      try {
        const page: PageModel = {
          ...projection.page,
          components: projection.page.components.map((node) =>
            node.id === 'second'
              ? { ...node, props: { ...node.props, marginLeft: 12, marginRight: 8 } }
              : node,
          ),
        };
        const { container, onMoveComponents } = renderSurface(page, { selectedIds: ['second'] });
        const { overlay } = targets(container);
        const child = container.querySelector<HTMLElement>(
          '.wr-design-hit[data-component-id="second"]',
        );
        if (child === null) throw new Error('Expected nested child.');
        fireEvent.pointerDown(child, { button: 0, pointerId: 35, clientX: 60, clientY: 52 });
        fireEvent.pointerUp(overlay, { pointerId: 35, clientX: 60 + requested, clientY: 52 });
        expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second'], { x: expected, y: 0 });
      } finally {
        projection.restore();
      }
    },
  );

  it('uses available parent host space for keyboard nudges beyond stored fallback dimensions', () => {
    const projection = measuredPanel('stretch', 700, 185);
    try {
      const { container, onMoveComponents } = renderSurface(projection.page, {
        selectedIds: ['second'],
      });
      const { surface } = targets(container);
      fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
      expect(onMoveComponents).toHaveBeenCalledExactlyOnceWith(['second'], { x: 8, y: 0 });
    } finally {
      projection.restore();
    }
  });
});

describe('DesignerSurface responsive projection', () => {
  it('keeps the page and floating editors inside the shared project style surface', () => {
    const { container } = renderSurface(pageWithPopupChild(), { selectedIds: ['popup'] });
    const surface = container.querySelector('.wr-page-surface');
    expect(surface?.classList.contains('wr-project-surface')).toBe(true);
    expect(surface?.querySelector('.wr-designer-floating-layer')).not.toBeNull();
  });
  it.each([50, 100, 150])(
    'fills the available Default width at %s%% zoom and tracks host resizing',
    (zoom) => {
      let hostWidth = 964;
      let notifyResize: (() => void) | undefined;
      const disconnect = vi.fn();
      const clientWidth = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.classList.contains('wr-designer-scroll') ? hostWidth : 0;
        });
      vi.stubGlobal(
        'ResizeObserver',
        class {
          public constructor(private readonly callback: () => void) {}
          public observe(host: HTMLElement): void {
            if (host.classList.contains('wr-designer-scroll')) notifyResize = this.callback;
          }
          public disconnect = disconnect;
        },
      );
      const page = responsivePage();
      const originalPage = JSON.stringify(page);
      try {
        const { container, unmount } = renderSurface(page, { zoom });
        const host = container.querySelector<HTMLElement>('.wr-designer-scroll');
        if (host === null) throw new Error('Expected scroll host.');
        host.style.padding = '40px 32px';
        act(() => notifyResize?.());
        const surface = container.querySelector<HTMLElement>('.wr-page-surface');
        const frame = container.querySelector<HTMLElement>('.wr-page-zoom-frame');
        expect((Number.parseFloat(surface?.style.width ?? '') * zoom) / 100).toBeCloseTo(900);
        expect(Number.parseFloat(frame?.style.width ?? '')).toBeCloseTo(900);

        hostWidth = 704;
        act(() => notifyResize?.());
        expect(Number.parseFloat(frame?.style.width ?? '')).toBeCloseTo(640);

        fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'tablet' } });
        expect(surface?.style.width).toBe('768px');
        hostWidth = 804;
        act(() => notifyResize?.());
        expect(surface?.style.width).toBe('768px');
        fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'mobile' } });
        expect(surface?.style.width).toBe('390px');
        fireEvent.change(screen.getByLabelText('Viewport'), { target: { value: 'desktop' } });
        expect(Number.parseFloat(frame?.style.width ?? '')).toBeCloseTo(740);
        expect(JSON.stringify(page)).toBe(originalPage);
        unmount();
        expect(disconnect).toHaveBeenCalled();
      } finally {
        cleanup();
        clientWidth.mockRestore();
        vi.unstubAllGlobals();
      }
    },
  );

  it('updates Default on window resize when ResizeObserver is unavailable', () => {
    let hostWidth = 900;
    vi.stubGlobal('ResizeObserver', undefined);
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('wr-designer-scroll') ? hostWidth : 0;
      });
    try {
      const { container } = renderSurface();
      const surface = container.querySelector<HTMLElement>('.wr-page-surface');
      expect(surface?.style.width).toBe('900px');
      hostWidth = 700;
      fireEvent(window, new Event('resize'));
      expect(surface?.style.width).toBe('700px');
    } finally {
      cleanup();
      clientWidth.mockRestore();
      vi.unstubAllGlobals();
    }
  });

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

  it('grows a fit-content page frame around its rendered children instead of shrinking them', async () => {
    const page = responsivePage();
    const contentSizedPage: PageModel = {
      ...page,
      height: 50,
      components: page.components.map((component) =>
        component.id === page.rootComponentId
          ? {
              ...component,
              bounds: { ...component.bounds, height: 50 },
              layout: {
                ...component.layout,
                container: { ...component.layout.container, mode: 'column', gap: 8 },
                item: { ...component.layout.item, height: 'fit-content' },
              },
            }
          : component,
      ),
    };
    const zoomScale = 0.5;
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
        if (this.classList.contains('wr-page-surface')) {
          return rectangle(
            0,
            0,
            1280 * zoomScale,
            (Number.parseFloat(this.style.height) || 50) * zoomScale,
          );
        }
        if (this.dataset.componentId === contentSizedPage.rootComponentId) {
          return rectangle(
            0,
            0,
            1280 * zoomScale,
            (Number.parseFloat(this.parentElement?.style.height ?? '') || 50) * zoomScale,
          );
        }
        if (this.dataset.designerNodeId === 'first') return rectangle(10, 10, 60, 18);
        if (this.dataset.designerNodeId === 'second') return rectangle(10, 42, 60, 18);
        return rectangle(0, 0, 0, 0);
      });

    try {
      const { container } = renderSurface(contentSizedPage, { zoom: 50 });
      await waitFor(() => {
        expect(
          Number.parseFloat(
            container.querySelector<HTMLElement>('.wr-page-surface')?.style.height ?? '0',
          ),
        ).toBeGreaterThanOrEqual(120);
      });
      expect(
        container.querySelector<HTMLElement>('.wr-runtime-children-column')?.style.height,
      ).toBe('max-content');
      expect(
        container.querySelector<HTMLElement>('.wr-design-hit[data-component-id="second"]')?.style
          .top,
      ).toBe('84px');
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('shrinks an empty fit-content page frame to its configured minimum', async () => {
    const page = responsivePage();
    const emptyContentPage: PageModel = {
      ...page,
      height: 50,
      components: page.components
        .filter((component) => component.id === page.rootComponentId)
        .map((component) => ({
          ...component,
          children: [],
          bounds: { ...component.bounds, height: 50 },
          layout: {
            ...component.layout,
            item: { ...component.layout.item, height: 'fit-content', minHeight: 24 },
          },
        })),
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
        if (this.classList.contains('wr-page-surface')) {
          return rectangle(0, 0, 1280, Number.parseFloat(this.style.height) || 50);
        }
        if (this.dataset.componentId === emptyContentPage.rootComponentId) {
          return rectangle(
            0,
            0,
            1280,
            Number.parseFloat(this.parentElement?.style.height ?? '') || 50,
          );
        }
        return rectangle(0, 0, 0, 0);
      });

    try {
      const { container } = renderSurface(emptyContentPage);
      await waitFor(() => {
        expect(container.querySelector<HTMLElement>('.wr-page-surface')?.style.height).toBe('24px');
      });
    } finally {
      getBoundingClientRect.mockRestore();
    }
  });

  it('leaves a fit-content leaf control on its browser intrinsic size', () => {
    const page = responsivePage();
    const intrinsicLeafPage: PageModel = {
      ...page,
      components: page.components.map((component) =>
        component.id !== 'first'
          ? component
          : {
              ...component,
              type: 'WebEdit',
              name: 'IntrinsicEdit',
              layout: {
                ...component.layout,
                item: {
                  ...component.layout.item,
                  width: 'fit-content',
                  height: 'fit-content',
                },
              },
              props: { value: 'Do not squeeze', visible: true, enabled: true },
            },
      ),
    };

    const { container } = renderSurface(intrinsicLeafPage);
    const item = container.querySelector<HTMLElement>('[data-designer-node-id="first"]');
    expect(item?.style.width).toBe('max-content');
    expect(item?.style.height).toBe('max-content');
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
    const { container } = renderSurface(pageWithApiClient(), {
      onSelect,
      onComponentActivate,
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
    expect(runtimeNode.style.right).toBe('32px');
    expect(runtimeNode.style.bottom).toBe('48px');
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

  it('keeps an in-flow fit-content reusable definition intrinsically sized before measuring it', () => {
    const fixture = pageWithFloatingReusableElement();
    const page: PageModel = {
      ...fixture.page,
      components: fixture.page.components.map((component) =>
        component.id !== fixture.instance.id
          ? component
          : {
              ...component,
              layout: {
                ...component.layout,
                item: {
                  ...component.layout.item,
                  width: 'fit-content',
                  height: 'fit-content',
                },
              },
              props: { ...component.props, placement: 'in-flow' },
            },
      ),
    };
    const { container } = renderSurface(page, { reusableElements: [fixture.reusableElement] });
    const instance = container.querySelector<HTMLElement>(
      '[data-designer-node-id="customer-card-instance"]',
    );
    const definition = container.querySelector<HTMLElement>(
      `[data-reusable-element-id="${fixture.reusableElement.id}"]`,
    );
    if (instance === null || definition === null) {
      throw new Error('Expected an in-flow reusable component instance.');
    }

    expect(instance.style.flexShrink).toBe('0');
    expect(definition.classList).toContain('wr-reusable-definition-fit-width');
    expect(definition.classList).toContain('wr-reusable-definition-fit-height');
  });

  it('lets an in-flow reusable fit-content placement maximum override its intrinsic floor', () => {
    const fixture = pageWithFloatingReusableElement();
    const page: PageModel = {
      ...fixture.page,
      components: fixture.page.components.map((component) =>
        component.id !== fixture.instance.id
          ? component
          : {
              ...component,
              layout: {
                ...component.layout,
                item: {
                  ...component.layout.item,
                  width: 'fit-content',
                  height: 'fit-content',
                  maxWidth: 120,
                  maxHeight: 48,
                },
              },
              props: { ...component.props, placement: 'in-flow' },
            },
      ),
    };
    const { container } = renderSurface(page, { reusableElements: [fixture.reusableElement] });
    const definition = container.querySelector<HTMLElement>(
      `[data-reusable-element-id="${fixture.reusableElement.id}"]`,
    );
    if (definition === null) throw new Error('Expected an in-flow reusable definition.');

    expect(definition.classList).not.toContain('wr-reusable-definition-fit-width');
    expect(definition.classList).not.toContain('wr-reusable-definition-fit-height');
    expect(definition.classList).toContain('wr-reusable-definition-constrained-fit-width');
    expect(definition.classList).toContain('wr-reusable-definition-constrained-fit-height');
  });

  it('measures a nested reusable fit-content placement in its own definition instance', async () => {
    const fixture = pageWithFloatingReusableElement();
    let reusableIdSequence = 0;
    const nestedElement = createReusableElement('NestedCard', {
      idFactory: () => `nested-card-${String((reusableIdSequence += 1))}`,
    });
    const nestedRoot = nestedElement.components.find(
      (component) => component.id === nestedElement.rootComponentId,
    );
    const outerRoot = fixture.reusableElement.components.find(
      (component) => component.id === fixture.reusableElement.rootComponentId,
    );
    if (nestedRoot === undefined || outerRoot === undefined) {
      throw new Error('Expected reusable definition roots.');
    }
    const nestedChild: ComponentNode = {
      id: 'nested-card-child',
      type: 'WebPanel',
      name: 'NestedCardChild',
      parentId: nestedRoot.id,
      layout: createDefaultComponentLayout(),
      bounds: { x: -50, y: -10, width: 160, height: 40 },
      props: { visible: true, enabled: true },
      events: {},
      children: [],
    };
    const nestedDefinition: ReusableElementModel = {
      ...nestedElement,
      components: [{ ...nestedRoot, children: [nestedChild.id] }, nestedChild],
    };
    const nestedPlacementLayout = createDefaultComponentLayout();
    const nestedPlacement: ComponentNode = {
      id: 'nested-card-placement',
      type: 'WebReusableElement',
      name: 'NestedCardPlacement',
      parentId: outerRoot.id,
      layout: {
        ...nestedPlacementLayout,
        item: {
          ...nestedPlacementLayout.item,
          width: 'fit-content',
          height: 'fit-content',
        },
      },
      bounds: { x: 24, y: 36, width: 200, height: 100 },
      props: {
        reusableElementId: nestedDefinition.id,
        placement: 'in-flow',
        visible: true,
        enabled: true,
      },
      events: {},
      children: [],
    };
    const outerDefinition: ReusableElementModel = {
      ...fixture.reusableElement,
      components: [
        ...fixture.reusableElement.components.map((component) =>
          component.id === outerRoot.id
            ? { ...component, children: [...component.children, nestedPlacement.id] }
            : component,
        ),
        nestedPlacement,
      ],
    };
    const page: PageModel = {
      ...fixture.page,
      components: fixture.page.components.map((component) =>
        component.id === fixture.instance.id
          ? { ...component, props: { ...component.props, placement: 'in-flow' } }
          : component,
      ),
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
        if (this.dataset.componentId === nestedPlacement.id) return rectangle(0, 0, 0, 0);
        if (this.dataset.designerDefinitionNodeId === nestedChild.id) {
          return rectangle(-50, -10, 160, 40);
        }
        return rectangle(0, 0, 0, 0);
      });

    try {
      const { container } = renderSurface(page, {
        reusableElements: [outerDefinition, nestedDefinition],
      });
      const nestedWrapper = container.querySelector<HTMLElement>(
        `[data-designer-definition-node-id="${nestedPlacement.id}"]`,
      );
      if (nestedWrapper === null) throw new Error('Expected nested reusable placement.');

      await waitFor(() => {
        expect(nestedWrapper.style.width).toMatch(/^\d+px$/u);
        expect(nestedWrapper.style.height).toMatch(/^\d+px$/u);
        expect(Number.parseFloat(nestedWrapper.style.width)).toBeGreaterThanOrEqual(160);
        expect(Number.parseFloat(nestedWrapper.style.height)).toBeGreaterThanOrEqual(40);
      });
    } finally {
      getBoundingClientRect.mockRestore();
    }
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
