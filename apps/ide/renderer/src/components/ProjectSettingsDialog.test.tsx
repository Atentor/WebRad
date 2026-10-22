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
  it('organizes implemented web application configuration areas', async () => {
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
    expect(screen.queryByRole('tab', { name: 'RestGo integration' })).toBeNull();
    for (const name of ['CORS and origins', 'Headers and CSP', 'Logs and monitoring']) {
      expect(screen.queryByRole('tab', { name })).toBeNull();
    }
    expect(screen.queryByText('Security')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Build and publishing' }));
    expect(screen.getByRole('heading', { name: 'Build and publishing' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /^Deploy directory/ })).toBeDefined();
    expect(screen.queryByText('Planned options')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: 'PWA and metadata' }));
    expect(screen.getByRole('checkbox', { name: 'Enable PWA installation' })).toBeDefined();
  });

  it('chooses a deploy destination and saves delivery options without changing Preview environment', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onChooseDeployDirectory = vi.fn().mockResolvedValue('C:\\Hosting\\Portal');
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
        onChooseDeployDirectory={onChooseDeployDirectory}
        initialSectionId="build"
      />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Browser routing' }), 'hash');
    fireEvent.change(screen.getByRole('textbox', { name: 'Application base path' }), {
      target: { value: '/portal/' },
    });
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: /^Deploy directory/ }) as HTMLInputElement).value,
      ).toBe('C:\\Hosting\\Portal'),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Deploy environment/ }),
      'development',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Minify JavaScript and CSS' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Include source maps for troubleshooting' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onChooseDeployDirectory).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'development',
        routingMode: 'hash',
        routingBasePath: '/portal/',
        build: {
          deployDirectory: 'C:\\Hosting\\Portal',
          environment: 'development',
          minify: false,
          sourceMaps: true,
        },
      }),
    );
  });

  it('preserves the deploy directory when native folder selection is canceled', async () => {
    const user = userEvent.setup();
    const settings = projectSettings();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={{ ...settings, build: { ...settings.build, deployDirectory: 'hosting' } }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onChooseDeployDirectory={vi.fn().mockResolvedValue(null)}
        initialSectionId="build"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: /^Deploy directory/ }) as HTMLInputElement).value,
      ).toBe('hosting'),
    );
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('validates unsafe deploy paths before saving', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
        initialSectionId="build"
      />,
    );
    await user.type(screen.getByRole('textbox', { name: /^Deploy directory/ }), '../hosting');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert').textContent).toContain('without . or ..');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves PWA installation metadata and retains unsaved changes across sections', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
        initialSectionId="pwa"
      />,
    );
    const shortName = screen.getByRole('textbox', { name: /^Short name/ }) as HTMLInputElement;
    expect(shortName.matches(':disabled')).toBe(true);
    expect(shortName.closest('fieldset')?.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Enable PWA installation' }));
    await user.type(shortName, ' Client Portal ');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Display mode' }), 'fullscreen');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Orientation' }), 'portrait');
    fireEvent.change(screen.getByLabelText(/^Theme color/), { target: { value: '#123456' } });
    fireEvent.change(screen.getByLabelText(/^Background color/), { target: { value: '#abcdef' } });
    await user.click(
      screen.getByRole('checkbox', { name: 'Keep the application available offline' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Build and publishing' }));
    await user.type(screen.getByRole('textbox', { name: /^Deploy directory/ }), 'hosting/portal');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        pwa: {
          enabled: true,
          shortName: 'Client Portal',
          display: 'fullscreen',
          orientation: 'portrait',
          themeColor: '#123456',
          backgroundColor: '#abcdef',
          offline: false,
        },
        build: expect.objectContaining({ deployDirectory: 'hosting/portal' }),
      }),
    );
  });

  it('saves general metadata and Designer preferences as one project settings update', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const settings = {
      ...projectSettings(),
      restGo: {
        ...projectSettings().restGo,
        enabled: true,
        baseUrl: 'https://api.example.test/backend',
        apiToken: 'application-token',
      },
    };
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={settings}
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
        restGo: settings.restGo,
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

  it('edits and persists Native Application settings with compatible target choices', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onChooseNativeDirectory = vi.fn().mockResolvedValue('C:\\Native\\Portal');
    const onChooseDeployDirectory = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
        onChooseNativeDirectory={onChooseNativeDirectory}
        onChooseDeployDirectory={onChooseDeployDirectory}
      />,
    );
    await user.click(screen.getByRole('tab', { name: 'Native Application' }));
    expect(screen.getByRole('heading', { name: 'Native Application' })).toBeDefined();
    expect(screen.getByRole('textbox', { name: 'Application Name' })).toBeDefined();
    expect(screen.getByRole('spinbutton', { name: 'Initial Width' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'Safe Area' })).toBeDefined();
    expect(screen.queryByLabelText('Splash Screen')).toBeNull();
    expect(screen.getByText(/Custom splash images are not supported/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(onChooseNativeDirectory).toHaveBeenCalledOnce();
    expect(onChooseDeployDirectory).not.toHaveBeenCalled();
    await user.clear(screen.getByRole('textbox', { name: /^Application Identifier/ }));
    await user.type(
      screen.getByRole('textbox', { name: /^Application Identifier/ }),
      'com.example.portal',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target Platform' }), 'android');
    expect(
      (screen.getByRole('combobox', { name: 'Target Architecture' }) as HTMLSelectElement).value,
    ).toBe('arm64');
    expect(screen.queryByRole('option', { name: 'MSI' })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Bundle Format' }), 'aab');
    await user.type(
      screen.getByRole('textbox', { name: /^Allowed Network Origins/ }),
      'https://api.example.test',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Android Keystore Password Environment Variable' }),
      'ANDROID_KEYSTORE_PASSWORD',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeApplication: expect.objectContaining({
          identifier: 'com.example.portal',
          build: expect.objectContaining({
            platform: 'android',
            architecture: 'arm64',
            bundleFormat: 'aab',
            outputDirectory: 'C:\\Native\\Portal',
          }),
          security: { networkOrigins: ['https://api.example.test'] },
          signing: expect.objectContaining({
            androidKeystorePasswordEnvironmentVariable: 'ANDROID_KEYSTORE_PASSWORD',
          }),
        }),
      }),
    );
  });

  it('prevents saving invalid Native Application metadata and accepts a native icon', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        projectName="Portal"
        settings={projectSettings()}
        onClose={vi.fn()}
        onSave={onSave}
        initialSectionId="native"
      />,
    );
    await user.clear(screen.getByRole('textbox', { name: /^Application Identifier/ }));
    await user.type(
      screen.getByRole('textbox', { name: /^Application Identifier/ }),
      'invalid identifier',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('reverse-DNS')),
    ).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: /^Application Identifier/ }));
    await user.type(
      screen.getByRole('textbox', { name: /^Application Identifier/ }),
      'com.example.portal',
    );
    fireEvent.change(screen.getByLabelText('Application Icon'), {
      target: { files: [new File(['native icon'], 'native.png', { type: 'image/png' })] },
    });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Application Icon preview' })).toBeDefined(),
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeApplication: expect.objectContaining({
          icon: expect.objectContaining({ fileName: 'native.png', mediaType: 'image/png' }),
        }),
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
