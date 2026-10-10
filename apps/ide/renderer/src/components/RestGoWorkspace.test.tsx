// @vitest-environment jsdom
import { DEFAULT_REST_GO_PROJECT_SETTINGS } from '@webrad/project-model';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RestGoWorkspace } from './RestGoWorkspace';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'webrad');
});

function renderWorkspace(open: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'webrad', {
    configurable: true,
    value: {
      links: { open },
      restgoAdmin: {
        status: vi.fn(),
      },
    },
  });
  render(
    <RestGoWorkspace
      projectId="test-project"
      settings={DEFAULT_REST_GO_PROJECT_SETTINGS}
      section="connection"
      onSaveSettings={vi.fn()}
    />,
  );
}

describe('RestGO workspace browser link', () => {
  it('opens RestGO in the default browser', async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(open);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Open RestGO' }));

    expect(open).toHaveBeenCalledWith('restgo');
  });

  it('reports a failure to launch the default browser', async () => {
    const open = vi.fn().mockRejectedValue(new Error('Browser unavailable'));
    renderWorkspace(open);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Open RestGO' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not open RestGO in your default browser: Browser unavailable',
    );
  });
});
