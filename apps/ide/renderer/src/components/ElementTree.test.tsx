// @vitest-environment jsdom

import { ComponentRegistry, defaultComponentRegistry } from '@webrad/component-registry';
import {
  createDefaultComponentLayout,
  createPage,
  type ComponentNode,
  type PageModel,
} from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementTree } from './ElementTree';

afterEach(cleanup);

function hierarchicalPage(): PageModel {
  let sequence = 0;
  const page = createPage('PageMain', { idFactory: () => `tree-${String((sequence += 1))}` });
  const root = page.components[0];
  if (root === undefined) throw new Error('Expected page root.');
  const node = (
    id: string,
    type: string,
    name: string,
    parentId: string,
    children: readonly string[] = [],
  ): ComponentNode => ({
    id,
    type,
    name,
    parentId,
    layout: createDefaultComponentLayout(),
    bounds: { x: 0, y: 0, width: 120, height: 36 },
    props: { visible: true },
    events: {},
    children,
  });
  // Intentionally store nodes in a different order from the authored hierarchy.
  return {
    ...page,
    components: [
      { ...root, children: ['header', 'footer', 'popup', 'client'] },
      node('popup-button', 'WebButton', 'ConfirmButton', 'popup'),
      node('footer', 'WebLabel', 'FooterText', root.id),
      node('header', 'WebPanel', 'HeaderGroup', root.id, ['image', 'button']),
      node('client', 'WebApiClient', 'OrdersClient', root.id),
      node('button', 'WebButton', 'BuyButton', 'header'),
      node('image', 'WebImage', 'HeroImage', 'header'),
      {
        ...node('popup', 'WebPopup', 'ConfirmPopup', root.id, ['popup-button']),
        props: { visible: false },
      },
    ],
  };
}

describe('ElementTree hierarchy and selection', () => {
  it('projects authored child order and tray descendants without modifying the page', () => {
    const page = hierarchicalPage();
    const before = JSON.stringify(page);
    render(<ElementTree page={page} selectedIds={[]} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('treeitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'PageMain',
      'HeaderGroup',
      'HeroImage',
      'BuyButton',
      'FooterText',
      'ConfirmPopup',
      'ConfirmButton',
      'OrdersClient',
    ]);
    expect(screen.getByRole('treeitem', { name: 'HeroImage' }).getAttribute('aria-level')).toBe(
      '3',
    );
    expect(screen.getByRole('treeitem', { name: 'ConfirmPopup' }).classList.contains('tray')).toBe(
      true,
    );
    expect(screen.getByTitle('Hidden at runtime')).toBeTruthy();
    expect(JSON.stringify(page)).toBe(before);
  });

  it('collapses a group without selecting it and searches through collapsed ancestors', () => {
    const onSelect = vi.fn();
    render(<ElementTree page={hierarchicalPage()} selectedIds={[]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse HeaderGroup' }));
    expect(screen.queryByRole('treeitem', { name: 'HeroImage' })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search elements' }), {
      target: { value: 'hero' },
    });
    expect(screen.getAllByRole('treeitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'PageMain',
      'HeaderGroup',
      'HeroImage',
    ]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search elements' }), {
      target: { value: '' },
    });
    expect(screen.queryByRole('treeitem', { name: 'HeroImage' })).toBeNull();
  });

  it('reveals and marks a nested component selected from the designer', () => {
    const page = hierarchicalPage();
    const onSelect = vi.fn();
    const { rerender } = render(<ElementTree page={page} selectedIds={[]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse ConfirmPopup' }));
    expect(screen.queryByRole('treeitem', { name: 'ConfirmButton' })).toBeNull();

    rerender(<ElementTree page={page} selectedIds={['popup-button']} onSelect={onSelect} />);
    expect(
      screen.getByRole('treeitem', { name: 'ConfirmButton' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses stable IDs for selection after a component rename', () => {
    const page = hierarchicalPage();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ElementTree page={page} selectedIds={['image']} onSelect={onSelect} />,
    );
    const renamed = {
      ...page,
      components: page.components.map((node) =>
        node.id === 'image' ? { ...node, name: 'BannerImage' } : node,
      ),
    };
    rerender(<ElementTree page={renamed} selectedIds={['image']} onSelect={onSelect} />);

    const item = screen.getByRole('treeitem', { name: 'BannerImage' });
    expect(item.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(item);
    expect(onSelect).toHaveBeenLastCalledWith(['image'], 'image');
  });

  it('supports additive, toggled, and visible-range selection with mouse modifiers', () => {
    const page = hierarchicalPage();
    const onSelect = vi.fn();
    const { rerender } = render(
      <ElementTree page={page} selectedIds={['image']} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('treeitem', { name: 'BuyButton' }), { ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(['image', 'button'], 'button');

    rerender(<ElementTree page={page} selectedIds={['image', 'button']} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('treeitem', { name: 'BuyButton' }), { metaKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(['image'], 'image');
    fireEvent.click(screen.getByRole('treeitem', { name: 'HeroImage' }));
    fireEvent.click(screen.getByRole('treeitem', { name: 'FooterText' }), { shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(['image', 'button', 'footer'], 'footer');
  });

  it('navigates, expands, collapses, and selects using the keyboard', () => {
    const onSelect = vi.fn();
    render(<ElementTree page={hierarchicalPage()} selectedIds={[]} onSelect={onSelect} />);
    const header = screen.getByRole('treeitem', { name: 'HeaderGroup' });
    header.focus();
    fireEvent.keyDown(header, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'HeroImage' })).toBeNull();
    fireEvent.keyDown(header, { key: 'ArrowRight' });
    fireEvent.keyDown(header, { key: 'ArrowRight' });
    const image = screen.getByRole('treeitem', { name: 'HeroImage' });
    expect(document.activeElement).toBe(image);
    fireEvent.keyDown(image, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(['image'], 'image');
    fireEvent.keyDown(image, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'BuyButton' }));
    fireEvent.keyDown(screen.getByRole('treeitem', { name: 'BuyButton' }), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(header);
  });

  it('searches registry display names and renders plugin icons with a safe unknown-type fallback', () => {
    const definition = defaultComponentRegistry.require('WebButton');
    const registry = new ComponentRegistry([
      { ...definition, type: 'WebPlugin', displayName: 'Product Catalog', icon: 'database' },
    ]);
    const page = hierarchicalPage();
    const pluginPage = {
      ...page,
      components: page.components.map((node) =>
        node.id === 'button' ? { ...node, type: 'WebPlugin' } : node,
      ),
    };
    render(
      <ElementTree page={pluginPage} selectedIds={[]} onSelect={vi.fn()} registry={registry} />,
    );
    expect(
      screen.getByRole('treeitem', { name: 'HeroImage' }).querySelector('svg path'),
    ).toBeTruthy();
    const pluginItem = screen.getByRole('treeitem', { name: 'BuyButton' });
    expect(pluginItem.querySelectorAll('.wr-element-icon svg path').length).toBe(3);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search elements' }), {
      target: { value: 'catalog' },
    });
    expect(screen.getAllByRole('treeitem').map((item) => item.getAttribute('aria-label'))).toEqual([
      'PageMain',
      'HeaderGroup',
      'BuyButton',
    ]);
  });

  it('shows a useful empty state without a page', () => {
    render(<ElementTree page={null} selectedIds={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('Open a page to view its elements.')).toBeTruthy();
    expect(screen.queryByRole('treeitem')).toBeNull();
  });
  it('routes editing shortcuts from the selected tree item without changing selection or bubbling', () => {
    const onSelect = vi.fn();
    const onEditCommand = vi.fn();
    const ancestorKeyDown = vi.fn();
    render(
      <div onKeyDown={ancestorKeyDown}>
        <ElementTree
          page={hierarchicalPage()}
          selectedIds={['image']}
          onSelect={onSelect}
          onEditCommand={onEditCommand}
        />
      </div>,
    );
    const item = screen.getByRole('treeitem', { name: 'HeroImage', selected: true });
    const remove = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    fireEvent(item, remove);
    expect(remove.defaultPrevented).toBe(true);
    fireEvent.keyDown(item, { key: 'C', ctrlKey: true });
    fireEvent.keyDown(item, { key: 'x', metaKey: true });
    fireEvent.keyDown(item, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(item, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(item, { key: 'z', metaKey: true, shiftKey: true });
    fireEvent.keyDown(item, { key: 'y', ctrlKey: true });
    expect(onEditCommand.mock.calls.map(([command]) => command)).toEqual([
      'edit.delete',
      'edit.copy',
      'edit.cut',
      'edit.paste',
      'edit.undo',
      'edit.redo',
      'edit.redo',
    ]);
    expect(ancestorKeyDown).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(item.getAttribute('aria-selected')).toBe('true');
  });

  it('retains hierarchy navigation and leaves unsupported edit shortcuts untouched', () => {
    const onEditCommand = vi.fn();
    const onSelect = vi.fn();
    render(
      <ElementTree
        page={hierarchicalPage()}
        selectedIds={['image']}
        onSelect={onSelect}
        onEditCommand={onEditCommand}
      />,
    );
    const item = screen.getByRole('treeitem', { name: 'HeroImage' });
    fireEvent.keyDown(item, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'BuyButton' }));
    const letter = new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true });
    fireEvent(item, letter);
    expect(letter.defaultPrevented).toBe(false);
    expect(onEditCommand).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
