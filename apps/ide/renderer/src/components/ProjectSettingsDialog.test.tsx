// @vitest-environment jsdom

import { createProject, type ProjectSettings } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

afterEach(cleanup);

function projectSettings() {
  return createProject('Portal').settings;
}

describe('ProjectSettingsDialog', () => {
  it('saves the complete RestGO integration and Authorization token and reopens them', async () => {
    const user = userEvent.setup();
    let saved: ProjectSettings = projectSettings();
    const onSave = vi.fn((settings: ProjectSettings) => {
      saved = settings;
    });
    const view = render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={saved}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByText(/SDK renews the JWT automatically/i)).toBeDefined();
    await user.click(screen.getByRole('checkbox', { name: 'Enable native RestGO integration' }));
    await user.type(
      screen.getByRole('textbox', { name: /^RestGO instance URL/ }),
      'https://api.example.test/restgo',
    );
    expect(screen.queryByRole('tab', { name: 'Authentication and JWT' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'APIs and integrations' })).toBeNull();
    expect(screen.getAllByRole('tab', { name: 'RestGo integration' })).toHaveLength(1);
    await user.type(screen.getByLabelText(/^Authorization token/), 'rgo.portal-token');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Session storage/ }), 'session');
    const storageKey = screen.getByRole('textbox', { name: /^Session storage key/ });
    await user.clear(storageKey);
    await user.type(storageKey, 'portal-restgo-session');

    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    expect(
      (screen.getByRole('textbox', { name: /^RestGO instance URL/ }) as HTMLInputElement).value,
    ).toBe('https://api.example.test/restgo');
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Dynamic API version/ }), {
      target: { value: '2' },
    });
    await user.type(screen.getByRole('textbox', { name: /^Default database slug/ }), 'clientes');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(saved.restGo).toEqual({
      apiToken: 'rgo.portal-token',
      enabled: true,
      baseUrl: 'https://api.example.test/restgo',
      apiVersion: 2,
      defaultDatabase: 'clientes',
      persistSession: true,
      sessionStorage: 'session',
      storageKey: 'portal-restgo-session',
    });
    view.unmount();

    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={saved}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    expect((screen.getByLabelText(/^Authorization token/) as HTMLInputElement).value).toBe(
      'rgo.portal-token',
    );
    expect(
      (screen.getByRole('textbox', { name: /^Default database slug/ }) as HTMLInputElement).value,
    ).toBe('clientes');
    expect(
      (screen.getByRole('combobox', { name: /^Session storage/ }) as HTMLSelectElement).value,
    ).toBe('session');
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('cancels native RestGO edits without mutating the project settings', async () => {
    const user = userEvent.setup();
    const settings = projectSettings();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={settings}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    await user.click(screen.getByRole('checkbox', { name: 'Enable native RestGO integration' }));
    await user.type(
      screen.getByRole('textbox', { name: /^RestGO instance URL/ }),
      'https://api.example.test',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Persist the user session' }));
    await user.type(screen.getByLabelText(/^Authorization token/), 'rgo.discarded-token');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(settings.restGo.enabled).toBe(false);
    expect(settings.restGo.baseUrl).toBe('');
    expect(settings.restGo.persistSession).toBe(true);
    expect(settings.restGo.apiToken).toBe('');
  });

  it('rejects missing URLs, embedded credentials and invalid API versions before saving', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    await user.click(screen.getByRole('checkbox', { name: 'Enable native RestGO integration' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter the RestGO instance URL');
    const instanceUrl = screen.getByRole('textbox', { name: /^RestGO instance URL/ });
    await user.type(instanceUrl, 'https://master:secret@api.example.test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('without credentials');
    await user.clear(instanceUrl);
    await user.type(instanceUrl, 'https://api.example.test');
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Dynamic API version/ }), {
      target: { value: '0' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

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
    expect(screen.getByRole('tab', { name: 'RestGo integration' })).toBeDefined();
    for (const name of ['CORS and origins', 'Headers and CSP', 'Logs and monitoring']) {
      expect(screen.queryByRole('tab', { name })).toBeNull();
    }
    expect(screen.queryByText('Security')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Build and publishing' }));
    expect(screen.getByRole('heading', { name: 'Build and publishing' })).toBeDefined();
    expect(screen.getByText('Output directory and build profile')).toBeDefined();
    expect(
      screen.getByText(
        /General settings, scrollbar styles, environment variables, application icons, and SEO metadata/i,
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

  it('saves the complete Aurora scrollbar style from General settings', async () => {
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

    expect(screen.getByText('Aurora default')).toBeDefined();
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Vertical width/ }), {
      target: { value: '14' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Horizontal height/ }), {
      target: { value: '15' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Track border/ }), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Thumb border/ }), {
      target: { value: '3' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Track radius/ }), {
      target: { value: '11' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Thumb radius/ }), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByLabelText('Track color'), { target: { value: '#112233' } });
    fireEvent.change(screen.getByLabelText('Track border color'), {
      target: { value: '#223344' },
    });
    fireEvent.change(screen.getByLabelText('Thumb color'), { target: { value: '#334455' } });
    fireEvent.change(screen.getByLabelText('Thumb hover color'), {
      target: { value: '#445566' },
    });
    fireEvent.change(screen.getByLabelText('Thumb active color'), {
      target: { value: '#556677' },
    });
    fireEvent.change(screen.getByLabelText('Thumb border color'), {
      target: { value: '#667788' },
    });
    fireEvent.change(screen.getByLabelText('Corner color'), { target: { value: '#778899' } });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        scrollbar: {
          width: 14,
          height: 15,
          trackColor: '#112233',
          trackBorderColor: '#223344',
          trackBorderWidth: 2,
          trackBorderRadius: 11,
          thumbColor: '#334455',
          thumbHoverColor: '#445566',
          thumbActiveColor: '#556677',
          thumbBorderColor: '#667788',
          thumbBorderWidth: 3,
          thumbBorderRadius: 12,
          cornerColor: '#778899',
        },
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

  it('rejects an Authorization token with Bearer before saving', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    await user.type(screen.getByLabelText(/^Authorization token/), 'Bearer rgo.token');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('without Bearer');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('enables saving when only the Authorization token changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const settings = projectSettings();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={settings}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'RestGo integration' }));
    await user.type(screen.getByLabelText(/^Authorization token/), 'rgo.updated-token');
    expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(
      false,
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith({
      ...settings,
      restGo: { ...settings.restGo, apiToken: 'rgo.updated-token' },
    });
  });
});
