// @vitest-environment jsdom

import {
  createDefaultComponentLayout,
  createPage,
  DEFAULT_PROJECT_SETTINGS,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesignerSurface } from './DesignerSurface';

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

interface RenderSurfaceOptions {
  readonly onSelect?: (ids: readonly string[], primaryId?: string) => void;
  readonly onReorderComponents?: (
    parentId: string,
    componentIds: readonly string[],
    beforeComponentId: string | null,
  ) => void;
  readonly onComponentActivate?: (componentId: string) => void;
  readonly onDefaultEvent?: (componentId: string) => void;
}

function renderSurface(page: PageModel = responsivePage(), options: RenderSurfaceOptions = {}) {
  const onSelect = options.onSelect ?? vi.fn();
  const onReorderComponents = options.onReorderComponents ?? vi.fn();
  const onComponentActivate = options.onComponentActivate ?? vi.fn();
  const onDefaultEvent = options.onDefaultEvent ?? vi.fn();
  const view = render(
    <DesignerSurface
      page={page}
      settings={DEFAULT_PROJECT_SETTINGS}
      selectedIds={[]}
      selectedPaletteType={null}
      zoom={100}
      onSelect={onSelect}
      onAddComponent={vi.fn()}
      onMoveComponents={vi.fn()}
      onReorderComponents={onReorderComponents}
      onResizeComponent={vi.fn()}
      onDeleteSelection={vi.fn()}
      onCopy={vi.fn()}
      onPaste={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onBringToFront={vi.fn()}
      onSendToBack={vi.fn()}
      onZoomChange={vi.fn()}
      onComponentActivate={onComponentActivate}
      onDefaultEvent={onDefaultEvent}
    />,
  );
  return { ...view, onSelect, onReorderComponents, onComponentActivate, onDefaultEvent };
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
});
