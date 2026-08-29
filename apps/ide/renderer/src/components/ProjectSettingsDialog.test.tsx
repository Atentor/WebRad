// @vitest-environment jsdom

import { createProject } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

afterEach(cleanup);

function projectSettings() {
  return createProject('Portal').settings;
}

describe('ProjectSettingsDialog', () => {
  it('organizes web application configuration areas while keeping future sections in planning', async () => {
    const user = userEvent.setup();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Settings for Portal' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Environment variables' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Icons' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'SEO and sharing' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Authentication and JWT' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'CORS and origins' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'CORS and origins' }));
    expect(screen.getByRole('heading', { name: 'CORS and trusted origins' })).toBeDefined();
    expect(screen.getByText('Allowed methods and headers')).toBeDefined();
    expect(
      screen.getByText(
        /General settings, environment variables, application icons, and SEO metadata/i,
      ),
    ).toBeDefined();
    expect(screen.getByRole('note').textContent).toContain('Data structures');
  });

  it('saves general metadata and Designer preferences as one project settings update', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const applicationName = screen.getByRole('textbox', { name: /^Application name/ });
    await user.clear(applicationName);
    await user.type(applicationName, 'Portal do Cliente');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Language and region/ }),
      'en-US',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Show grid in Designer' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Grid size' }), '16');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationName: 'Portal do Cliente',
        locale: 'en-US',
        showGrid: false,
        gridSize: 16,
      }),
    );
  });

  it('edits values per environment and saves a Monaco-visible variable', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Environment variables' }));
    await user.click(screen.getByRole('button', { name: 'Add variable' }));
    const name = screen.getByRole('textbox', { name: 'Variable name' });
    await user.type(name, 'API_BASE_URL');
    const developmentValue = screen.getByRole('textbox', { name: /^Value for Development/ });
    await user.type(developmentValue, 'http://localhost:3000');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Environment used for Preview and Build/ }),
      'production',
    );
    const productionValue = screen.getByRole('textbox', { name: /^Value for Production/ });
    await user.type(productionValue, 'https://api.example.test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        environmentVariables: [
          {
            name: 'API_BASE_URL',
            values: {
              development: 'http://localhost:3000',
              production: 'https://api.example.test',
            },
          },
        ],
      }),
    );
  });

  it('accepts an SVG application icon and persists it with the project settings', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Icons' }));
    const icon = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'portal-icon.svg', {
      type: 'image/svg+xml',
    });
    fireEvent.change(screen.getByTestId('application-icon-input'), {
      target: { files: [icon] },
    });

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Application icon preview' })).toBeDefined();
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationIcon: expect.objectContaining({
          fileName: 'portal-icon.svg',
          mediaType: 'image/svg+xml',
          dataUrl: expect.stringMatching(/^data:image\/svg\+xml;base64,/),
        }),
      }),
    );
  });

  it('saves SEO and social sharing metadata for generated HTML', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'SEO and sharing' }));
    await user.type(
      screen.getByRole('textbox', { name: /^Canonical URL/ }),
      'https://portal.example.test',
    );
    await user.type(screen.getByRole('textbox', { name: /^Keywords/ }), 'customers, support');
    await user.click(
      screen.getByRole('checkbox', { name: 'Allow search engines to index this application' }),
    );
    await user.type(screen.getByRole('textbox', { name: /^Share title/ }), 'Customer portal');
    await user.type(
      screen.getByRole('textbox', { name: /^Share description/ }),
      'Manage your account.',
    );
    const image = new File(['share image'], 'portal-share.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('social-image-input'), { target: { files: [image] } });
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Social share image preview' })).toBeDefined();
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        seo: {
          canonicalUrl: 'https://portal.example.test',
          keywords: 'customers, support',
          allowIndexing: false,
          socialTitle: 'Customer portal',
          socialDescription: 'Manage your account.',
          socialImage: expect.objectContaining({
            fileName: 'portal-share.png',
            mediaType: 'image/png',
            dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
          }),
        },
      }),
    );
  });

  it('closes with Escape and returns its close action', () => {
    const onClose = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
