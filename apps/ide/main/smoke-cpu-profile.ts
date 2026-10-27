import { promises as fs } from 'node:fs';
import { Session } from 'node:inspector/promises';
import path from 'node:path';

/** Local inspector only: never expose a debugging port or change the workflow result. */
export async function profileMenuSmoke(
  run: () => Promise<void>,
  log: (message: string) => void,
): Promise<void> {
  const logArgument = process.argv.find((value) => value.startsWith('--webrad-smoke-log='));
  if (
    process.platform !== 'darwin' ||
    process.arch !== 'x64' ||
    !process.argv.includes('--webrad-smoke') ||
    !process.argv.includes('--webrad-smoke-auto-exit') ||
    logArgument === undefined
  ) {
    await run();
    return;
  }
  const session = new Session();
  let started = false;
  try {
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
    started = true;
  } catch (error) {
    log(`[IDE] Menu CPU profile unavailable: ${String(error)}`);
  }
  try {
    await run();
  } finally {
    try {
      if (started) {
        const { profile } = await session.post('Profiler.stop');
        const directory = path.join(
          path.dirname(logArgument.slice('--webrad-smoke-log='.length)),
          'native-diagnostics',
        );
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'menu-main.cpuprofile'), JSON.stringify(profile));
        await fs.copyFile(
          path.join(__dirname, 'main.cjs.map'),
          path.join(directory, 'main.cjs.map'),
        );
      }
    } catch (error) {
      log(`[IDE] Menu CPU profile could not be saved: ${String(error)}`);
    } finally {
      session.disconnect();
    }
  }
}
