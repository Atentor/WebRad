// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBuildDiagnostic, type EditorProblem } from '../editor-problems';
import { BottomPanel, type BottomPanelProps, type OutputEntry } from './BottomPanel';

afterEach(cleanup);

const output: readonly OutputEntry[] = [
  { id: 'project', category: 'PROJECT', message: 'Opened Demo.', timestamp: '10:00:00' },
  { id: 'compiler', category: 'COMPILER', message: 'Build started.', timestamp: '10:00:01' },
];

function problem(
  category: 'error' | 'warning' | 'info',
  message: string,
  line: number,
): EditorProblem {
  return normalizeBuildDiagnostic(
    {
      category,
      source: 'typescript',
      code: category === 'error' ? 2304 : undefined,
      message,
      file: 'pages/PageMain.ts',
      line,
      column: 3,
      length: 4,
    },
    { resolveResource: (file) => `file:///C:/Projects/Demo/${file}` },
  );
}

const problems: readonly EditorProblem[] = [
  problem('error', "Cannot find name 'MissingType'.", 4),
  problem('warning', 'Unused declaration.', 8),
  problem('info', 'Suggestion available.', 12),
];

function props(overrides: Partial<BottomPanelProps> = {}): BottomPanelProps {
  return {
    activeTab: 'problems',
    problems,
    output,
    building: false,
    onActiveTabChange: vi.fn(),
    onProblemActivate: vi.fn(),
    ...overrides,
  };
}

describe('BottomPanel', () => {
  it('offers the debugger tab when functional debugger content is provided', async () => {
    const user = userEvent.setup();
    const onActiveTabChange = vi.fn();
    render(
      <BottomPanel
        {...props({
          activeTab: 'debug',
          debugContent: <div>Debugger controls</div>,
          onActiveTabChange,
        })}
      />,
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('Debugger controls');
    await user.click(screen.getByRole('tab', { name: 'Debugger' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('debug');
  });

  it('renders only Problems, Output, and Build as externally controlled tabs', async () => {
    const user = userEvent.setup();
    const onActiveTabChange = vi.fn();
    const initialProps = props({ activeTab: 'output', onActiveTabChange });
    const { rerender } = render(<BottomPanel {...initialProps} />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByRole('tab', { name: 'Terminal' })).toBeNull();
    expect(screen.getByRole('tabpanel').textContent).toContain('Opened Demo.');

    await user.click(screen.getByRole('tab', { name: /^Problems/ }));
    expect(onActiveTabChange).toHaveBeenCalledWith('problems');
    expect(screen.getByRole('tabpanel').textContent).toContain('Opened Demo.');

    rerender(<BottomPanel {...initialProps} activeTab="problems" />);
    expect(screen.getByRole('tabpanel').textContent).toContain("Cannot find name 'MissingType'.");
  });

  it('reports deduplicated severity counts in the tab and summary', () => {
    render(<BottomPanel {...props()} />);

    expect(
      screen
        .getByRole('tab', {
          name: 'Problems, 1 error, 1 warning, 1 information',
        })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getAllByLabelText('Problems, 1 error, 1 warning, 1 information')).toHaveLength(2);
    expect(screen.getAllByLabelText('1 error')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('1 warning')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('1 information')).not.toHaveLength(0);
  });

  it('activates a located problem with mouse and keyboard and exposes its metadata', async () => {
    const user = userEvent.setup();
    const onProblemActivate = vi.fn();
    render(<BottomPanel {...props({ onProblemActivate })} />);
    const row = screen.getByRole('button', {
      name: /Error\. Cannot find name 'MissingType'\.\. pages\/PageMain\.ts:4:3\. typescript 2304/,
    });

    expect(row.textContent).toContain('typescript 2304');
    expect(row.textContent).toContain('pages/PageMain.ts:4:3');
    await user.click(row);
    expect(onProblemActivate).toHaveBeenLastCalledWith(problems[0]);

    row.focus();
    await user.keyboard('{Enter}');
    expect(onProblemActivate).toHaveBeenCalledTimes(2);
  });

  it('renders a global, non-navigable problem as text rather than a misleading button', () => {
    const globalProblem = normalizeBuildDiagnostic({
      category: 'error',
      source: 'compiler',
      message: 'The compiler service is unavailable.',
    });
    render(<BottomPanel {...props({ problems: [globalProblem] })} />);

    expect(screen.getByText('The compiler service is unavailable.')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /The compiler service is unavailable/ }),
    ).toBeNull();
  });

  it('shows real compiler activity and progress in Build without unrelated output', () => {
    render(<BottomPanel {...props({ activeTab: 'build', building: true })} />);

    expect(screen.getByRole('status').textContent).toContain('Building the browser application');
    expect(screen.getByText('Build started.')).toBeTruthy();
    expect(screen.queryByText('Opened Demo.')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Build' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows truthful empty states for Problems, Output, and Build', () => {
    const emptyProps = props({ problems: [], output: [] });
    const { rerender } = render(<BottomPanel {...emptyProps} activeTab="problems" />);
    expect(screen.getByText('No problems detected.')).toBeTruthy();

    rerender(<BottomPanel {...emptyProps} activeTab="output" />);
    expect(screen.getByText('WebRAD is ready.')).toBeTruthy();

    rerender(<BottomPanel {...emptyProps} activeTab="build" />);
    expect(screen.getByText('No build activity yet.')).toBeTruthy();
  });
});
