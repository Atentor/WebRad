import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';
import type { IdeCommand } from '../shared/contracts';

function commandItem(
  window: BrowserWindow,
  label: string,
  command: IdeCommand,
  accelerator?: string,
  registerAccelerator = true,
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    registerAccelerator,
    click: () => window.webContents.send('webrad:menu-command', command),
  };
}

export function installApplicationMenu(window: BrowserWindow): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        commandItem(window, 'New Project', 'file.newProject', 'CmdOrCtrl+N'),
        commandItem(window, 'Open Project…', 'file.openProject', 'CmdOrCtrl+O'),
        commandItem(window, 'Close Project', 'file.closeProject'),
        { type: 'separator' },
        commandItem(window, 'Save', 'file.save', 'CmdOrCtrl+S'),
        commandItem(window, 'Save All', 'file.saveAll', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        commandItem(window, 'Undo', 'edit.undo', 'CmdOrCtrl+Z', false),
        commandItem(window, 'Redo', 'edit.redo', 'CmdOrCtrl+Y', false),
        { type: 'separator' },
        commandItem(window, 'Cut', 'edit.cut', 'CmdOrCtrl+X', false),
        commandItem(window, 'Copy', 'edit.copy', 'CmdOrCtrl+C', false),
        commandItem(window, 'Paste', 'edit.paste', 'CmdOrCtrl+V', false),
        commandItem(window, 'Delete', 'edit.delete', 'Delete', false),
      ],
    },
    {
      label: 'Search',
      submenu: [commandItem(window, 'Find', 'search.find', 'CmdOrCtrl+F')],
    },
    {
      label: 'View',
      submenu: [
        commandItem(window, 'Designer', 'view.design'),
        commandItem(window, 'Code', 'view.code'),
        commandItem(window, 'Preview', 'view.preview'),
        { type: 'separator' },
        commandItem(window, 'Project Explorer', 'view.projectExplorer'),
        commandItem(window, 'Object Inspector', 'view.objectInspector'),
        commandItem(window, 'Tool Palette', 'view.toolPalette'),
        commandItem(window, 'Output', 'view.output'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Project',
      submenu: [
        commandItem(window, 'Add Form', 'project.addForm'),
        commandItem(window, 'Build', 'project.build'),
      ],
    },
    {
      label: 'Run',
      submenu: [commandItem(window, 'Run', 'run.run', 'F9')],
    },
    { label: 'Component', submenu: [] },
    { label: 'Tools', submenu: [] },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About WebRAD',
          click: () => window.webContents.send('webrad:menu-command', 'view.output'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
