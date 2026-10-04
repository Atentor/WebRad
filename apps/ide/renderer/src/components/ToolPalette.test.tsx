// @vitest-environment jsdom
import { ComponentRegistry, defaultComponentRegistry } from '@webrad/component-registry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolPalette, WEBRAD_COMPONENT_DRAG_TYPE } from './ToolPalette';
afterEach(cleanup);
describe('ToolPalette compact registry presentation', () => {
  it('renders registry icon metadata for newly registered components and preserves insertion', () => {
    const registry = new ComponentRegistry([
      {
        ...defaultComponentRegistry.require('WebButton'),
        type: 'WebProductCatalog',
        displayName: 'Product Catalog',
        palette: { caption: 'Catalog', category: 'Visual Elements' },
        icon: 'database',
      },
    ]);
    const onSelect = vi.fn();
    const onInsert = vi.fn();
    render(<ToolPalette compact registry={registry} onSelect={onSelect} onInsert={onInsert} />);
    const item = screen.getByRole('button', { name: 'Catalog' });
    expect(item.querySelectorAll('svg path').length).toBe(3);
    expect(item.querySelector('.wr-palette-item-icon')?.textContent).toBe('');
    fireEvent.doubleClick(item);
    expect(onSelect).toHaveBeenLastCalledWith('WebProductCatalog');
    expect(onInsert).toHaveBeenLastCalledWith('WebProductCatalog');
  });
  it('filters by search and retains categorized nonvisual tools', () => {
    const { container } = render(<ToolPalette compact onSelect={vi.fn()} onInsert={vi.fn()} />);
    expect(container.querySelector('.wr-panel-header')).toBeNull();
    expect(screen.getByRole('button', { name: 'API Client' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search components' }), {
      target: { value: 'image' },
    });
    expect(screen.getByRole('button', { name: 'Image' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Button' })).toBeNull();
  });
  it('keeps component drag data compatible with the designer', () => {
    const onSelect = vi.fn();
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: '' };
    render(<ToolPalette onSelect={onSelect} onInsert={vi.fn()} />);
    fireEvent.dragStart(screen.getByRole('button', { name: 'Button' }), { dataTransfer });
    expect(onSelect).toHaveBeenLastCalledWith('WebButton');
    expect(setData).toHaveBeenCalledWith(WEBRAD_COMPONENT_DRAG_TYPE, 'WebButton');
    expect(dataTransfer.effectAllowed).toBe('copy');
  });
});
