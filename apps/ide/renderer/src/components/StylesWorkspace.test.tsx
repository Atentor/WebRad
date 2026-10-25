// @vitest-environment jsdom

import { ComponentRegistry, defaultComponentRegistry } from '@webrad/component-registry';
import { createComponentStyle } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StylesWorkspace } from './StylesWorkspace';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('StylesWorkspace', () => {
  it('duplicates a protected style and selects its editable copy while preserving the active state', async () => {
    const user = userEvent.setup();
    const source = createComponentStyle('Default Button', 'WebButton', { preset: 'default' });
    const copy = createComponentStyle('Default Button Copy', 'WebButton', {
      states: source.states,
    });
    const onDuplicateStyle = vi.fn((): string | null => null);
    const props = {
      onCreateStyle: vi.fn(() => null),
      onUpdateStyle: vi.fn(),
      onDeleteStyle: vi.fn(),
      onDuplicateStyle,
    };
    const { rerender } = render(
      <StylesWorkspace {...props} styles={[source]} selectedComponentType="WebButton" />,
    );
    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    await user.click(screen.getByRole('button', { name: 'Duplicate Default Button' }));
    expect(onDuplicateStyle).toHaveBeenCalledWith(source.id);
    expect((screen.getByLabelText('Style name') as HTMLInputElement).value).toBe(source.name);
    onDuplicateStyle.mockReturnValue(copy.id);
    await user.click(screen.getByRole('button', { name: 'Duplicate Default Button' }));
    rerender(
      <StylesWorkspace {...props} styles={[source, copy]} selectedComponentType="WebButton" />,
    );
    expect((screen.getByLabelText('Style name') as HTMLInputElement).value).toBe(copy.name);
    expect(screen.getByRole('tab', { name: 'Hover' }).getAttribute('aria-selected')).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Delete Default Button Copy' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('previews Panel progress at 50 percent without enabling it on new Panels', () => {
    const style = createComponentStyle('Panel Surface', 'WebPanel', {
      states: { base: { panelProgressColor: '#123456', panelProgressThickness: 5 } },
    });
    render(
      <StylesWorkspace
        styles={[style]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={vi.fn()}
        onDeleteStyle={vi.fn()}
      />,
    );
    const progress = screen.getByRole('progressbar');
    expect(progress.getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText('Panel progress')).toBeDefined();
    expect(
      defaultComponentRegistry.createComponent('WebPanel', { id: 'new-panel' }).props,
    ).toMatchObject({ progressEnabled: false, progressValue: 0 });
  });
  it('filters styles and starts creation with the selected component type', async () => {
    const user = userEvent.setup();
    const styles = [
      createComponentStyle('Label A', 'WebLabel', () => 'label-a'),
      createComponentStyle('Button A', 'WebButton', () => 'button-a'),
      createComponentStyle('Label B', 'WebLabel', () => 'label-b'),
    ];
    const props = {
      styles,
      onCreateStyle: vi.fn(() => 'new-style'),
      onUpdateStyle: vi.fn(),
      onDeleteStyle: vi.fn(),
      onSelectComponentType: vi.fn(),
    };
    const { rerender } = render(<StylesWorkspace {...props} selectedComponentType="WebLabel" />);
    expect(
      within(screen.getByRole('listbox', { name: 'Project styles' })).getAllByRole('option'),
    ).toHaveLength(2);
    expect(screen.queryByRole('option', { name: /Button A/ })).toBeNull();
    await user.click(screen.getByRole('option', { name: /Label B/ }));
    rerender(<StylesWorkspace {...props} selectedComponentType="WebButton" />);
    expect((screen.getByLabelText('Style name') as HTMLInputElement).value).toBe('Button A');
    expect(screen.queryByRole('option', { name: /Label B/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'New style' }));
    expect((screen.getByLabelText('Component type') as HTMLSelectElement).value).toBe('WebButton');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(props.onCreateStyle).toHaveBeenCalledWith('Button Style', 'WebButton');
    expect(props.onSelectComponentType).toHaveBeenCalledWith('WebButton');
    rerender(<StylesWorkspace {...props} selectedComponentType="WebReusableElement" />);
    expect(screen.queryByLabelText('Style name')).toBeNull();
    expect(screen.getByText('No styles yet')).toBeDefined();
  });

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
    expect(labels).toContain('Popup');
    expect(labels).not.toContain('API Client');
  });

  it('renders the hidden-by-default Popup visibly in the style preview', () => {
    const style = createComponentStyle('Popup Surface', 'WebPopup', {
      idFactory: () => 'popup-style',
      states: {
        base: {
          backgroundColor: '#f8fafc',
          borderColor: '#6366f1',
          borderWidth: { value: 2, unit: 'px' },
          borderStyle: 'solid',
        },
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

    const preview = document.querySelector<HTMLElement>(
      '[data-style-preview] [data-component-type="WebPopup"]',
    );
    if (preview === null) throw new Error('Expected the Popup preview root.');
    expect(preview.hidden).toBe(false);
    expect(preview.classList).toContain('bg-[#f8fafc]');
    expect(preview.classList).toContain('border-[#6366f1]');
    expect(preview.getAttribute('aria-label')).toBe('StylePreview');
    expect(preview.querySelector('[data-webrad-popup-children]')).not.toBeNull();
  });

  it('forces the selected interaction state in the live preview', async () => {
    const user = userEvent.setup();
    const style = createComponentStyle('Interactive Button', 'WebButton', {
      idFactory: () => 'interactive-style',
      states: {
        base: {
          textGradient: {
            kind: 'linear',
            direction: 'to-right',
            from: '#f59e0b',
            to: '#ef4444',
          },
          backgroundGradient: {
            kind: 'linear',
            direction: 'to-right',
            from: '#2563eb',
            to: '#7c3aed',
          },
          borderWidth: { value: 4, unit: 'px' },
          borderStyle: 'solid',
          borderGradient: {
            kind: 'linear',
            direction: 'to-bottom',
            from: '#22c55e',
            to: '#06b6d4',
          },
          borderRadius: { value: 40, unit: 'px' },
        },
        hover: {
          backgroundGradient: {
            kind: 'linear',
            direction: 'to-bottom',
            from: '#1d4ed8',
            to: '#0ea5e9',
          },
        },
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
    expect(previewButton().classList.contains('border-[4px]')).toBe(true);
    expect(previewButton().classList.contains('rounded-[40px]')).toBe(true);
    expect(
      previewButton().classList.contains(
        '[&_[data-webrad-text-content]]:bg-[linear-gradient(to_right,#f59e0b,#ef4444)]',
      ),
    ).toBe(true);
    expect(
      previewButton().classList.contains(
        '[background:linear-gradient(to_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
      ),
    ).toBe(true);
    expect(previewButton().querySelector('[data-webrad-text-content]')).not.toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    expect(
      previewButton().classList.contains(
        '[background:linear-gradient(to_bottom,#1d4ed8,#0ea5e9)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
      ),
    ).toBe(true);
    expect(
      previewButton().classList.contains(
        '[background:linear-gradient(to_right,#2563eb,#7c3aed)_padding-box,linear-gradient(to_bottom,#22c55e,#06b6d4)_border-box]',
      ),
    ).toBe(false);

    await user.click(screen.getByRole('tab', { name: 'Focus' }));
    expect(previewButton().classList.contains('ring-[2px]')).toBe(true);
    expect(previewButton().classList.contains('ring-[#0ea5e9]')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Active' }));
    expect(previewButton().classList.contains('scale-[0.95]')).toBe(true);

    await user.click(screen.getByRole('tab', { name: 'Disabled' }));
    expect(previewButton().classList.contains('opacity-[0.45]')).toBe(true);
    expect(previewButton().disabled).toBe(true);
  });

  it('renders representative Data Grid controls and projects their style classes onto the live preview root', () => {
    const style = createComponentStyle('Operations Grid', 'WebDataGrid', {
      idFactory: () => 'operations-grid-style',
      states: {
        base: {
          dataGridHorizontalLineVisibility: 'hide',
          dataGridVerticalLineVisibility: 'show',
          dataGridVerticalLineColor: '#0ea5e9',
          dataGridVerticalLineWidth: { value: 2, unit: 'px' },
          dataGridHeaderBackgroundColor: '#0f172a',
          dataGridHeaderBorderStyle: 'dashed',
          dataGridFooterBackgroundColor: '#fef3c7',
          dataGridFooterBorderWidth: { value: 3, unit: 'px' },
          dataGridFooterFontWeight: 'bold',
          dataGridButtonContentMode: 'icon',
          dataGridButtonIconPosition: 'bottom',
          dataGridButtonIconSize: { value: 24, unit: 'px' },
          dataGridButtonIconColor: '#f59e0b',
          dataGridButtonBackgroundColor: '#dbeafe',
          dataGridCheckboxAccentColor: '#2563eb',
        },
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

    const previewGrid = document.querySelector<HTMLElement>(
      '[data-style-preview] [data-component-type="WebDataGrid"]',
    );
    if (previewGrid === null) throw new Error('Expected the Data Grid preview root.');

    expect(screen.getByText('Footer 1')).toBeDefined();
    expect(previewGrid.querySelectorAll('.wr-data-grid-checkbox-control')).toHaveLength(3);
    expect(previewGrid.querySelectorAll('.wr-data-grid-button')).toHaveLength(3);
    expect(previewGrid.querySelectorAll('.wr-data-grid-button-icon')).toHaveLength(3);
    expect(screen.getAllByText('Enabled')).toHaveLength(3);
    expect(screen.getAllByText('View')).toHaveLength(3);
    expect(previewGrid.classList).toContain('[--wr-data-grid-horizontal-line-override-width:0px]');
    expect(previewGrid.classList).toContain(
      '[--wr-data-grid-vertical-line-override-width:var(--wr-data-grid-vertical-line-width,1px)]',
    );
    expect(previewGrid.classList).toContain('[--wr-data-grid-vertical-line-color:#0ea5e9]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-vertical-line-width:2px]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-header-background-color:#0f172a]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-header-border-style:dashed]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-footer-background-color:#fef3c7]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-footer-border-width:3px]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-footer-font-weight:700]');
    expect(previewGrid.classList).toContain('[&_.wr-data-grid-button-icon-slot]:block');
    expect(previewGrid.classList).toContain(
      '[&_.wr-data-grid-button_.wr-data-grid-button-caption]:sr-only',
    );
    expect(previewGrid.classList).toContain('[&_.wr-data-grid-button]:flex-col-reverse');
    expect(previewGrid.classList).toContain('[&_.wr-data-grid-button_.wr-button-icon]:w-[24px]!');
    expect(previewGrid.classList).toContain('[&_.wr-data-grid-button_.wr-button-icon]:h-[24px]!');
    expect(previewGrid.classList).toContain(
      '[&_.wr-data-grid-button_.wr-button-icon]:text-[#f59e0b]',
    );
    expect(previewGrid.classList).toContain('[--wr-data-grid-button-background-color:#dbeafe]');
    expect(previewGrid.classList).toContain('[--wr-data-grid-checkbox-accent-color:#2563eb]');
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

  it('keeps seeded default styles editable while protecting them from deletion', async () => {
    const style = createComponentStyle('Default Button', 'WebButton', {
      idFactory: () => 'default-button-style',
      preset: 'default',
    });
    const onUpdateStyle = vi.fn();
    const onDeleteStyle = vi.fn();
    const user = userEvent.setup();
    render(
      <StylesWorkspace
        styles={[style]}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={onUpdateStyle}
        onDeleteStyle={onDeleteStyle}
      />,
    );

    const deleteButton = screen.getByRole('button', {
      name: 'Default Button is a protected default style',
    });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);
    await user.click(deleteButton);
    expect(onDeleteStyle).not.toHaveBeenCalled();

    const styleName = screen.getByLabelText('Style name');
    fireEvent.change(styleName, { target: { value: 'Aurora Button' } });
    fireEvent.blur(styleName);
    expect(onUpdateStyle).toHaveBeenCalledWith({ ...style, name: 'Aurora Button' });
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

  it('passes registered essentials into the editor and saves property changes in the selected style state', async () => {
    const user = userEvent.setup();
    const style = createComponentStyle('Custom Essentials', 'WebButton', {
      idFactory: () => 'custom-essentials',
    });
    const registry = new ComponentRegistry([
      {
        ...defaultComponentRegistry.require('WebButton'),
        styleEditor: { essentialProperties: ['rotate'] },
      },
    ]);
    const onUpdateStyle = vi.fn();
    render(
      <StylesWorkspace
        styles={[style]}
        registry={registry}
        onCreateStyle={vi.fn(() => null)}
        onUpdateStyle={onUpdateStyle}
        onDeleteStyle={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Configure Rotate')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Appearance,/ })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Hover' }));
    await user.click(screen.getByLabelText('Configure Rotate'));
    expect(onUpdateStyle).toHaveBeenCalledWith({
      ...style,
      states: { ...style.states, hover: { rotate: 0 } },
    });
  });
});
