// @vitest-environment jsdom

import { defaultComponentRegistry } from '@webrad/component-registry';
import {
  createComponentStyle,
  createDefaultApiClientConfiguration,
  createDefaultComponentLayout,
  createPage,
  type ComponentNode,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectInspector } from './ObjectInspector';

afterEach(cleanup);

const button: ComponentNode = {
  id: 'button-id',
  name: 'ButtonSave',
  type: 'WebButton',
  parentId: 'page-id',
  bounds: { x: 20, y: 24, width: 120, height: 36 },
  layout: createDefaultComponentLayout(),
  props: { caption: 'Save', icon: 'save' },
  events: { OnClick: 'ButtonSaveClick' },
  children: [],
};

describe('ObjectInspector', () => {
  it('edits the Panel progress enable flag and percentage independently of Panel visibility', () => {
    const onPropertyChange = vi.fn();
    const node = defaultComponentRegistry.createComponent('WebPanel', {
      id: 'panel',
      name: 'Panel1',
    });
    render(
      <ObjectInspector
        selection={[node]}
        onPropertyChange={onPropertyChange}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Enable border progress'));
    expect(onPropertyChange).toHaveBeenLastCalledWith(
      'progressEnabled',
      true,
      expect.objectContaining({ source: 'props' }),
    );
    fireEvent.change(screen.getByLabelText('Progress (%)'), { target: { value: '35' } });
    expect(onPropertyChange).toHaveBeenLastCalledWith(
      'progressValue',
      35,
      expect.objectContaining({ source: 'props' }),
    );
    expect((screen.getByLabelText('Visible') as HTMLInputElement).checked).toBe(true);
  });
  it('edits Panel background configuration through Registry properties', () => {
    const onPropertyChange = vi.fn();
    const node = defaultComponentRegistry.createComponent('WebPanel', {
      id: 'panel',
      name: 'Panel1',
    });
    render(
      <ObjectInspector
        selection={[node]}
        onPropertyChange={onPropertyChange}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Background image'), {
      target: { value: 'assets/imported/background.png' },
    });
    expect(onPropertyChange).toHaveBeenLastCalledWith(
      'backgroundImage',
      'assets/imported/background.png',
      expect.objectContaining({ source: 'props' }),
    );
    for (const [label, name, value] of [
      ['Background size', 'backgroundSize', 'contain'],
      ['Background position', 'backgroundPosition', 'right bottom'],
      ['Background repeat', 'backgroundRepeat', 'repeat-x'],
    ]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
      expect(onPropertyChange).toHaveBeenLastCalledWith(
        name,
        value,
        expect.objectContaining({ source: 'props' }),
      );
    }
  });
  it('offers saved Video Player aspect ratios through Registry metadata', () => {
    const onPropertyChange = vi.fn();
    const node = defaultComponentRegistry.createComponent('WebVideoPlayer', {
      id: 'video',
      name: 'VideoPlayer1',
    });
    render(
      <ObjectInspector
        selection={[node]}
        onPropertyChange={onPropertyChange}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('Aspect ratio') as HTMLSelectElement;
    expect(select.value).toBe('none');
    expect(Array.from(select.options, (option) => option.value)).toEqual(['none', '16:9', '9:16']);
    fireEvent.change(select, { target: { value: '9:16' } });
    expect(onPropertyChange).toHaveBeenLastCalledWith(
      'aspectRatio',
      '9:16',
      expect.objectContaining({ source: 'props' }),
    );
  });
  it('edits numeric Margin on every visual component and keeps it off nonvisual services', () => {
    const onPropertyChange = vi.fn();
    const props = { onPropertyChange, onEventChange: vi.fn(), onEventDoubleClick: vi.fn() };
    const { rerender } = render(<ObjectInspector {...props} selection={[]} />);
    for (const definition of defaultComponentRegistry.list()) {
      const node = defaultComponentRegistry.createComponent(definition.type, {
        id: `inspector-${definition.type}`,
        name: `Inspect${definition.type}`,
      });
      rerender(<ObjectInspector {...props} selection={[node]} />);
      if (!definition.visual) {
        expect(screen.queryByLabelText('Margin')).toBeNull();
        continue;
      }
      const input = screen.getByLabelText('Margin') as HTMLInputElement;
      expect(input.closest('details')?.querySelector('summary')?.textContent).toBe('Spacing');
      expect(input.type).toBe('number');
      expect(input.value).toBe('0');
      fireEvent.change(input, { target: { value: '12' } });
      expect(onPropertyChange).toHaveBeenLastCalledWith(
        'margin',
        12,
        expect.objectContaining({ name: 'margin', source: 'props' }),
      );
      rerender(
        <ObjectInspector
          {...props}
          selection={[{ ...node, props: { ...node.props, margin: 12 } }]}
        />,
      );
      expect((screen.getByLabelText('Margin') as HTMLInputElement).value).toBe('12');
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const sideInput = screen.getByLabelText(`Margin ${side.toLowerCase()}`) as HTMLInputElement;
        expect(
          sideInput.closest('.wr-inspector-row')?.classList.contains('wr-inspector-row-compact'),
        ).toBe(true);
        expect(sideInput.value).toBe('12');
        fireEvent.change(sideInput, { target: { value: '0' } });
        expect(onPropertyChange).toHaveBeenLastCalledWith(
          `margin${side}`,
          0,
          expect.objectContaining({ name: `margin${side}`, source: 'props' }),
        );
      }
      rerender(
        <ObjectInspector
          {...props}
          selection={[{ ...node, props: { ...node.props, margin: 12, marginLeft: 0 } }]}
        />,
      );
      expect((screen.getByLabelText('Margin left') as HTMLInputElement).value).toBe('0');
      expect((screen.getByLabelText('Margin right') as HTMLInputElement).value).toBe('12');
      if (definition.properties.some((property) => property.name === 'itemAlignSelf')) {
        const alignment = screen.getByLabelText('Item alignment');
        expect((alignment as HTMLSelectElement).value).toBe('auto');
        expect(alignment.closest('details')?.querySelector('summary')?.textContent).toBe(
          'Responsive size',
        );
        fireEvent.change(alignment, { target: { value: 'end' } });
        expect(onPropertyChange).toHaveBeenLastCalledWith(
          'itemAlignSelf',
          'end',
          expect.objectContaining({ source: 'layout-item' }),
        );
      }
    }
  });

  it('searches common properties without losing mixed values or editor callbacks', async () => {
    const user = userEvent.setup();
    const onPropertyChange = vi.fn();
    const second = {
      ...button,
      id: 'second-button',
      name: 'ButtonCancel',
      props: { ...button.props, marginLeft: 8 },
    };
    render(
      <ObjectInspector
        selection={[button, second]}
        onPropertyChange={onPropertyChange}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );
    const search = screen.getByRole('searchbox', { name: 'Search properties' });
    await user.click(screen.getByText('Spacing'));
    expect(screen.getByText('Spacing').closest('details')?.open).toBe(false);
    await user.type(search, 'margin left');
    expect(screen.getByText('Spacing').closest('details')?.open).toBe(true);
    expect(screen.queryByLabelText('Width')).toBeNull();
    expect((screen.getByLabelText('Margin left') as HTMLInputElement).placeholder).toBe(
      '(multiple values)',
    );
    fireEvent.change(screen.getByLabelText('Margin left'), { target: { value: '3' } });
    expect(onPropertyChange).toHaveBeenLastCalledWith(
      'marginLeft',
      3,
      expect.objectContaining({ source: 'props' }),
    );
    await user.clear(search);
    await user.type(search, 'not-a-property');
    expect(screen.getByRole('status').textContent).toBe('No properties match your search.');
    await user.click(screen.getByRole('button', { name: 'Clear property search' }));
    expect(screen.getByText('Spacing').closest('details')?.open).toBe(false);
    expect(screen.getByLabelText('Width')).toBeTruthy();
    await user.type(search, 'responsive');
    expect(
      screen.getByLabelText('Responsive width').closest('details')?.querySelector('summary')
        ?.textContent,
    ).toBe('Responsive size');
    await user.keyboard('{Escape}');
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('updates registry-defined read-only behavior when an API Client binds to RestGo', async () => {
    const user = userEvent.setup();
    const onPropertyChange = vi.fn();
    const customClient = defaultComponentRegistry.createComponent('WebApiClient', {
      id: 'custom-api',
      props: { baseUrl: 'https://api.example.test' },
    });
    const props = {
      onPropertyChange,
      onEventChange: vi.fn(),
      onEventDoubleClick: vi.fn(),
    };
    const { rerender } = render(<ObjectInspector {...props} selection={[customClient]} />);
    expect((screen.getByLabelText('Base URL') as HTMLInputElement).readOnly).toBe(false);
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://custom.example.test' },
    });
    expect(onPropertyChange).toHaveBeenCalledWith(
      'baseUrl',
      'https://custom.example.test',
      expect.objectContaining({ name: 'baseUrl' }),
    );
    onPropertyChange.mockClear();

    const boundClient = {
      ...customClient,
      props: {
        ...customClient.props,
        apiClientConfig: { ...createDefaultApiClientConfiguration(), connection: 'restgo-session' },
      },
    };
    rerender(<ObjectInspector {...props} selection={[boundClient]} />);
    const fixedUrl = screen.getByLabelText('Base URL') as HTMLInputElement;
    expect(fixedUrl.readOnly).toBe(true);
    expect(fixedUrl.closest('.wr-inspector-row')?.getAttribute('title')).toContain(
      'RestGo integration',
    );
    await user.type(fixedUrl, '/override');
    fireEvent.change(fixedUrl, { target: { value: 'https://escaped.example.test' } });
    expect(onPropertyChange).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps mixed custom and RestGo-bound selections read-only (bound first: %s)',
    (boundFirst) => {
      const onPropertyChange = vi.fn();
      const customClient = defaultComponentRegistry.createComponent('WebApiClient', {
        id: 'custom-api',
        props: { baseUrl: 'https://custom.example.test' },
      });
      const boundClient = defaultComponentRegistry.createComponent('WebApiClient', {
        id: 'bound-api',
        props: {
          baseUrl: '',
          apiClientConfig: {
            ...createDefaultApiClientConfiguration(),
            connection: 'restgo-session',
          },
        },
      });
      render(
        <ObjectInspector
          selection={boundFirst ? [boundClient, customClient] : [customClient, boundClient]}
          onPropertyChange={onPropertyChange}
          onEventChange={vi.fn()}
          onEventDoubleClick={vi.fn()}
        />,
      );
      const fixedUrl = screen.getByLabelText('Base URL') as HTMLInputElement;
      expect(fixedUrl.readOnly).toBe(true);
      fireEvent.change(fixedUrl, { target: { value: 'https://escaped.example.test' } });
      expect(onPropertyChange).not.toHaveBeenCalled();
    },
  );

  it('preserves static read-only property metadata alongside dynamic predicates', () => {
    const onPropertyChange = vi.fn();
    const original = defaultComponentRegistry.require('WebButton');
    const definition = {
      ...original,
      properties: original.properties.map((property) =>
        property.name === 'caption'
          ? { ...property, readOnly: true, readOnlyWhen: () => false }
          : property,
      ),
    };
    render(
      <ObjectInspector
        selection={[button]}
        definition={definition}
        onPropertyChange={onPropertyChange}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );
    const caption = screen.getByLabelText('Caption') as HTMLInputElement;
    expect(caption.readOnly).toBe(true);
    fireEvent.change(caption, { target: { value: 'Edited caption' } });
    expect(onPropertyChange).not.toHaveBeenCalled();
  });

  it('offers typed RestGO page events in Interaction from the central registry', async () => {
    const user = userEvent.setup();
    const onEventDoubleClick = vi.fn();
    render(
      <ObjectInspector
        selection={[]}
        page={createPage('PageMain')}
        definition={defaultComponentRegistry.get('WebPage')}
        onPropertyChange={vi.fn()}
        onEventChange={vi.fn()}
        onEventDoubleClick={onEventDoubleClick}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Events' }));
    expect(screen.getByText('RestGO')).toBeTruthy();
    for (const name of ['OnLogin', 'OnLogout']) {
      await user.dblClick(screen.getByLabelText(name));
      expect(onEventDoubleClick).toHaveBeenCalledWith(
        name,
        expect.objectContaining({
          name,
          category: 'RestGO',
          eventDetailProperties: ['user'],
          eventDetailType:
            name === 'OnLogin' ? 'WebPageLoginEventDetail' : 'WebPageLogoutEventDetail',
        }),
      );
    }
    await user.dblClick(screen.getByLabelText('OnUnauthenticated'));
    expect(onEventDoubleClick).toHaveBeenCalledWith(
      'OnUnauthenticated',
      expect.objectContaining({ name: 'OnUnauthenticated', category: 'RestGO' }),
    );
  });
  it('keeps property, style, and event editors usable after collapsing sections and changing tabs', async () => {
    const user = userEvent.setup();
    const onPropertyChange = vi.fn();
    const onStyleChange = vi.fn();
    const onEventChange = vi.fn();
    const onEventDoubleClick = vi.fn();
    const style = createComponentStyle('Primary', 'WebButton');
    const { container } = render(
      <ObjectInspector
        selection={[button]}
        styles={[style]}
        onPropertyChange={onPropertyChange}
        onStyleChange={onStyleChange}
        onEventChange={onEventChange}
        onEventDoubleClick={onEventDoubleClick}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Properties' }).textContent).toBe('Visual');
    expect(screen.getByRole('tab', { name: 'Events' }).textContent).toBe('Interaction');
    expect(container.querySelector('.wr-inspector-selection-icon')?.getAttribute('data-icon')).toBe(
      defaultComponentRegistry.get('WebButton')?.icon,
    );

    const geometrySummary = screen.getByText('Size & position');
    const geometrySection = geometrySummary.closest('details');
    expect(geometrySection?.open).toBe(true);
    await user.click(geometrySummary);
    expect(geometrySection?.open).toBe(false);
    await user.click(geometrySummary);
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '160' } });
    expect(onPropertyChange).toHaveBeenCalledWith(
      'width',
      160,
      expect.objectContaining({ source: 'bounds' }),
    );

    await user.selectOptions(screen.getByLabelText('Style'), style.id);
    expect(onStyleChange).toHaveBeenCalledWith(style.id);

    await user.click(screen.getByRole('tab', { name: 'Events' }));
    fireEvent.change(screen.getByLabelText('OnClick'), { target: { value: 'HandleSave' } });
    expect(onEventChange).toHaveBeenCalledWith(
      'OnClick',
      'HandleSave',
      expect.objectContaining({ name: 'OnClick' }),
    );
    await user.dblClick(screen.getByLabelText('OnClick'));
    expect(onEventDoubleClick).toHaveBeenCalledWith(
      'OnClick',
      expect.objectContaining({ name: 'OnClick' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Properties' }));
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('120');
  });

  it('inspects the page root with hidden interactions when the host has no component selection', () => {
    const page = createPage('PageMain');
    render(
      <ObjectInspector
        selection={[]}
        page={page}
        definition={defaultComponentRegistry.get('WebPage')}
        eventsEnabled={false}
        onPropertyChange={vi.fn()}
        onEventChange={vi.fn()}
        onEventDoubleClick={vi.fn()}
      />,
    );

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('PageMain');
    expect(screen.queryByRole('tab', { name: 'Events' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
