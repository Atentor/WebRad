import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';

const menu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => template),
  setApplicationMenu: vi.fn(),
}));

vi.mock('electron', () => ({ app: { quit: vi.fn() }, Menu: menu }));

import { installApplicationMenu } from './menu';
import { IDE_COMMANDS } from '../shared/contracts';

describe('application menu', () => {
  it('dispatches the registered About command from Help', () => {
    const send = vi.fn();
    installApplicationMenu({ webContents: { send } } as unknown as BrowserWindow);
    const template = menu.buildFromTemplate.mock.calls[0]?.[0];
    const help = template?.find((item) => item.label === 'Help');
    const submenu = help?.submenu;
    if (!Array.isArray(submenu)) throw new Error('Missing Help submenu');
    const about = submenu.find((item: MenuItemConstructorOptions) => item.label === 'About WebRAD');
    expect(about?.click).toBeTypeOf('function');
    const click = about?.click as (() => void) | undefined;
    click?.();
    expect(IDE_COMMANDS).toContain('help.about');
    expect(send).toHaveBeenCalledExactlyOnceWith('webrad:menu-command', 'help.about');
  });
});
