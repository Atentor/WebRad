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
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));
    fireEvent.change(screen.getByLabelText('Advanced Tailwind classes'), {
      target: { value: '[&>svg]:size-4' },
    });
    expect(onUpdateStyle).toHaveBeenCalledWith({
      ...style,
      classes: { ...style.classes, advanced: '[&>svg]:size-4' },
    });

    await user.click(screen.getByRole('button', { name: 'Delete Future Control' }));
    expect(onDeleteStyle).toHaveBeenCalledWith(style.id);
  });
});
