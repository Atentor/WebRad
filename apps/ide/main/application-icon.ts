import path from 'node:path';
import { app } from 'electron';

/** The same product icon for IDE and Preview windows, in development and packaged builds. */
export function applicationWindowIconPath(): string {
  const fileName = process.platform === 'win32' ? 'Icon.ico' : 'Icon.png';
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.resolve(__dirname, '..', '..', fileName);
}
