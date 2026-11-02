// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@webrad/project-model';
import { ProjectExplorer } from './ProjectExplorer';

afterEach(cleanup);

describe('Project Explorer packages', () => {
  function setup() {
    const project = createProject('Packages');
    const onManagePackages = vi.fn();
    const onPackageOperation = vi.fn();
    render(
      <ProjectExplorer
        project={project}
        activePageId={project.entryPage}
        onOpenPage={vi.fn()}
        onAddPage={vi.fn()}
        onDeletePage={vi.fn()}
        onRenamePage={vi.fn()}
        packages={[{ name: 'dayjs', requested: '^1', installedVersion: '1.11.13' }]}
        onManagePackages={onManagePackages}
        onPackageOperation={onPackageOperation}
      />,
    );
    return { onManagePackages, onPackageOperation };
  }

  it('shows only direct dependencies and runs package actions through the context menu', () => {
    const callbacks = setup();
    expect(screen.getByText('1.11.13')).toBeTruthy();
    const row = screen.getByText('dayjs').closest<HTMLElement>('[data-project-package]');
    if (!row) throw new Error('Package row missing');
    fireEvent.contextMenu(row, { clientX: 80, clientY: 80 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Update package' }));
    expect(callbacks.onPackageOperation).toHaveBeenCalledWith('update', 'dayjs');
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove package' }));
    expect(callbacks.onPackageOperation).toHaveBeenCalledWith('remove', 'dayjs');
    fireEvent.click(screen.getByRole('button', { name: 'Manage packages' }));
    expect(callbacks.onManagePackages).toHaveBeenCalledOnce();
  });

  it('includes packages when filtering the Explorer and preserves expansion', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Packages' }));
    expect(screen.queryByText('dayjs')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search project items' }));
    fireEvent.change(screen.getByLabelText('Filter project items'), { target: { value: 'dayjs' } });
    expect(screen.getByText('dayjs')).toBeTruthy();
    expect(screen.getByText('1 matching item')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close project search' }));
    expect(screen.queryByText('dayjs')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand Packages' })).toBeTruthy();
  });
});
