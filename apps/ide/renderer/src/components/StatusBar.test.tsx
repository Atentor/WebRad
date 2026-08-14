// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProblemCounts } from '../editor-problems';
import { StatusBar, type StatusBarProps } from './StatusBar';

afterEach(cleanup);

const problemCounts: ProblemCounts = {
  total: 5,
  error: 2,
  warning: 1,
  info: 2,
};

function props(overrides: Partial<StatusBarProps> = {}): StatusBarProps {
  return {
    status: { kind: 'code', line: 14, column: 9, selectionLength: 12 },
    dirty: true,
    problemCounts,
    onShowProblems: vi.fn(),
    ...overrides,
  };
}

describe('StatusBar', () => {
  it('shows problems, cursor, selection, and complete TypeScript file metadata', () => {
    render(<StatusBar {...props()} />);

    expect(screen.getByText('Modified')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Problems, 2 errors, 1 warning' })).toBeTruthy();
    expect(screen.getByLabelText('Line 14, column 9').textContent).toBe('Ln 14, Col 9');
    expect(screen.getByText('12 selected')).toBeTruthy();
    expect(screen.getByText('Spaces: 2')).toBeTruthy();
    expect(screen.getByText('LF')).toBeTruthy();
    expect(screen.getByText('TypeScript')).toBeTruthy();
    expect(screen.getByText('UTF-8')).toBeTruthy();
  });

  it('opens Problems from its accessible severity summary', async () => {
    const user = userEvent.setup();
    const onShowProblems = vi.fn();
    render(<StatusBar {...props({ onShowProblems })} />);

    await user.click(screen.getByRole('button', { name: 'Show Problems, 2 errors, 1 warning' }));
    expect(onShowProblems).toHaveBeenCalledOnce();
  });

  it('uses singular and zero-count labels and omits an empty selection', () => {
    render(
      <StatusBar
        {...props({
          dirty: false,
          problemCounts: { total: 1, error: 1, warning: 0, info: 0 },
          status: { kind: 'code', line: 1, column: 1, selectionLength: 0 },
        })}
      />,
    );

    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show Problems, 1 error, 0 warnings' })).toBeTruthy();
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it('retains designer component geometry and zoom status', () => {
    render(
      <StatusBar
        {...props({
          status: {
            kind: 'designer',
            name: 'Button1',
            bounds: { x: 16, y: 24, width: 120, height: 32 },
            zoom: 125,
          },
        })}
      />,
    );

    expect(screen.getByText('Button1')).toBeTruthy();
    expect(screen.getByText(/X: 16\s+Y: 24\s+W: 120\s+H: 32/)).toBeTruthy();
    expect(screen.getByText('Zoom: 125%')).toBeTruthy();
    expect(screen.getByText('UTF-8')).toBeTruthy();
  });
});
