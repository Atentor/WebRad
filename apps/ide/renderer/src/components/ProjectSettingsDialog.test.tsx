// @vitest-environment jsdom

import { createProject } from '@webrad/project-model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByRole('dialog', { name: 'Configurações de Portal' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Variáveis de ambiente' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Ícones' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Autenticação e JWT' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'CORS e origens' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'CORS e origens' }));
    expect(screen.getByRole('heading', { name: 'CORS e origens confiáveis' })).toBeDefined();
    expect(screen.getByText('Métodos e cabeçalhos permitidos')).toBeDefined();
    expect(screen.getByText(/As opções em Geral são salvas no projeto/i)).toBeDefined();
    expect(screen.getByRole('note').textContent).toContain('estrutura de dados');
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

    const applicationName = screen.getByRole('textbox', { name: /^Nome da aplicação/ });
    await user.clear(applicationName);
    await user.type(applicationName, 'Portal do Cliente');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Idioma e região/ }), 'en-US');
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar grade no Designer' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tamanho da grade' }), '16');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

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

    await user.click(screen.getByRole('tab', { name: 'Variáveis de ambiente' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar variável' }));
    const name = screen.getByRole('textbox', { name: 'Nome da variável' });
    await user.type(name, 'API_BASE_URL');
    const developmentValue = screen.getByRole('textbox', { name: /^Valor para Desenvolvimento/ });
    await user.type(developmentValue, 'http://localhost:3000');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^Ambiente usado em Preview e Build/ }),
      'production',
    );
    const productionValue = screen.getByRole('textbox', { name: /^Valor para Produção/ });
    await user.type(productionValue, 'https://api.example.test');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

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
