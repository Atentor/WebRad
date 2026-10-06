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
