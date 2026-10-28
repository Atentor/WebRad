import { app, type BrowserWindow, Menu, type MenuItemConstructorOptions, shell } from 'electron';
import type { IdeCommand } from '../shared/contracts';
import { EXTERNAL_LINKS } from '../shared/external-links';

const applicationMenus = new WeakMap<BrowserWindow, Menu>();
const previewMenuModes = new WeakMap<BrowserWindow, boolean>();

export function setPreviewMenuMode(window: BrowserWindow, preview: boolean): void {
  const menu = applicationMenus.get(window);
  if (menu === undefined || window.isDestroyed()) return;
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(preview ? null : menu);
  } else {
    // Detach it as well as hiding it, so Alt cannot reveal the menu in Preview.
    window.setMenu(preview ? null : menu);
    window.setMenuBarVisibility(!preview);
  }
  previewMenuModes.set(window, preview);
}

export function isPreviewMenuMode(window: BrowserWindow, preview: boolean): boolean {
  return previewMenuModes.get(window) === preview;
}

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
        commandItem(window, 'Debugger', 'view.debugger'),
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Project',
      submenu: [
        commandItem(window, 'Add Page', 'project.addPage'),
        commandItem(window, 'Add Reusable Component', 'project.addReusableElement'),
        commandItem(window, 'Add Model', 'project.addModel'),
        commandItem(window, 'Add Unit', 'project.addUnit'),
        commandItem(window, 'Import Asset\u2026', 'project.importAsset'),
        { type: 'separator' },
        commandItem(window, 'Build Application…', 'project.buildApplication'),
      ],
    },
    {
      label: 'Run',
      submenu: [
        commandItem(window, 'Run', 'run.run', 'F9'),
        commandItem(window, 'Stop Preview', 'run.stop'),
        { type: 'separator' },
        commandItem(window, 'Start / Continue Debugging', 'debug.start', 'F5'),
        commandItem(window, 'Pause', 'debug.pause'),
        commandItem(window, 'Step Over', 'debug.stepOver', 'F10'),
        commandItem(window, 'Step Into', 'debug.stepInto', 'F11'),
        commandItem(window, 'Step Out', 'debug.stepOut', 'Shift+F11'),
        commandItem(window, 'Stop Debugging', 'debug.stop', 'Shift+F5'),
        commandItem(window, 'Restart Debugging', 'debug.restart', 'CmdOrCtrl+Shift+F5'),
      ],
    },
    { label: 'Tools', submenu: [commandItem(window, 'Toggle Theme', 'view.toggleTheme')] },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            void shell.openExternal(EXTERNAL_LINKS.documentation).catch((error: unknown) => {
              console.error('[IDE] Failed to open documentation:', error);
            });
          },
        },
        commandItem(window, 'Check for Updates...', 'help.checkUpdates'),
        commandItem(window, 'About WebRAD', 'help.about'),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  applicationMenus.set(window, menu);
  previewMenuModes.set(window, false);
  Menu.setApplicationMenu(menu);
}
