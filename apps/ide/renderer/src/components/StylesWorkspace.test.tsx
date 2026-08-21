// @vitest-environment jsdom

import { createComponentStyle } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StylesWorkspace } from './StylesWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StylesWorkspace', () => {
  it('offers every registered visual type, including Page, and excludes nonvisual types', async () => {
    const user = userEvent.setup();
    render(
      <StylesWorkspace
        styles={[]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'New style' })[0]!);
    const componentType = screen.getByLabelText('Component type') as HTMLSelectElement;
    const labels = [...componentType.options].map((option) => option.text);

    expect(labels).toContain('Page');
    expect(labels).toContain('Button');
    expect(labels).not.toContain('API Client');
  });

  it('forces the selected interaction state in the live preview', async () => {
    const user = userEvent.setup();
    const style = createComponentStyle('Interactive Button', 'WebButton', {
      idFactory: () => 'interactive-style',
      states: {
        base: { backgroundColor: '#2563eb' },
        hover: { backgroundColor: '#1d4ed8' },
        focus: { ringWidth: { value: 2, unit: 'px' }, ringColor: '#0ea5e9' },
        active: { scale: 95 },
        disabled: { opacity: 45 },
      },
    });
    render(
      <StylesWorkspace
        styles={[style]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
      />,
    );

    const previewButton = (): HTMLButtonElement =>
      document.querySelector<HTMLButtonElement>(
        '[data-style-preview] [data-component-type="WebButton"]',
      )!;
    expect(previewButton().classList.contains('bg-[#2563eb]')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    expect(previewButton().classList.contains('bg-[#1d4ed8]')).toBe(true);
    expect(previewButton().classList.contains('hover:bg-[#1d4ed8]')).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Focus' }));
    expect(previewButton().classList.contains('ring-[2px]')).toBe(true);
    expect(previewButton().classList.contains('ring-[#0ea5e9]')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Active' }));
    expect(previewButton().classList.contains('scale-[0.95]')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Disabled' }));
    expect(previewButton().classList.contains('opacity-[0.45]')).toBe(true);
    expect(previewButton().disabled).toBe(true);
  });

  it('keeps an unregistered style editable and deletable without attempting to render it', async () => {
    const style = createComponentStyle('Future Control', 'WebFutureControl', () => 'future-style');
    const onUpdateStyle = vi.fn();
    const onDeleteStyle = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <StylesWorkspace
        styles={[style]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={onUpdateStyle}
        onDeleteStyle={onDeleteStyle}
      />,
    );

    expect(
      screen.getByText(/Preview unavailable for unregistered or nonvisual component type/),
    ).toBeDefined();
    expect((screen.getByLabelText('Style name') as HTMLInputElement).value).toBe('Future Control');
    expect(screen.queryByRole('tab', { name: 'Advanced' })).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    const styleName = screen.getByLabelText('Style name');
    fireEvent.change(styleName, { target: { value: 'Renamed Future Control' } });
    fireEvent.blur(styleName);
    expect(onUpdateStyle).toHaveBeenCalledWith({ ...style, name: 'Renamed Future Control' });

    await user.click(screen.getByRole('button', { name: 'Delete Future Control' }));
    expect(onDeleteStyle).toHaveBeenCalledWith(style.id);
  });

  it('rejects duplicate names using the same Unicode normalization as the project model', () => {
    const style = createComponentStyle('Café', 'WebButton', {
      idFactory: () => 'normalized-style',
    });
    const secondStyle = createComponentStyle('Secondary', 'WebButton', {
      idFactory: () => 'secondary-style',
    });
    const onUpdateStyle = vi.fn();
    render(
      <StylesWorkspace
        styles={[style, secondStyle]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={onUpdateStyle}
        onDeleteStyle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('option', { name: /Secondary/ }));
    const styleName = screen.getByLabelText('Style name');
    fireEvent.change(styleName, { target: { value: 'Cafe\u0301' } });
    fireEvent.blur(styleName);

    expect(screen.getByRole('alert').textContent).toContain('already exists');
    expect(onUpdateStyle).not.toHaveBeenCalled();
  });
});
