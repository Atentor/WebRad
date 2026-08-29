// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

afterEach(cleanup);

describe('ProjectSettingsDialog', () => {
  it('organizes web application configuration areas without presenting unsaved settings as active', async () => {
    const user = userEvent.setup();
    render(<ProjectSettingsDialog projectName="Portal" onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Configurações de Portal' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Variáveis de ambiente' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Ícones' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Autenticação e JWT' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'CORS e origens' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'CORS e origens' }));
    expect(screen.getByRole('heading', { name: 'CORS e origens confiáveis' })).toBeDefined();
    expect(screen.getByText('Métodos e cabeçalhos permitidos')).toBeDefined();
    expect(screen.getByText(/nenhuma configuração é salva ou aplicada ainda\./)).toBeDefined();
    expect(screen.getByRole('note').textContent).toContain('estrutura de dados');
  });

  it('closes with Escape and returns its close action', () => {
    const onClose = vi.fn();
    render(<ProjectSettingsDialog projectName="Portal" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
