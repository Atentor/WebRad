import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { createMacOSBundleDiagnostics } from './smoke-macos-diagnostics.mjs';

/** Terminate only this smoke's owned process tree, including inherited output handles. */
async function terminateProcessTree(child, processGroup) {
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      execFile(
        'taskkill.exe',
        ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true, timeout: 5_000 },
        (error) => {
          if (error === null) {
            resolve();
          } else {
            child.kill('SIGKILL');
            reject(error);
          }
        },
      );
    });
    return;
  }

  const signal = (value) => {
    try {
      if (processGroup) process.kill(-pid, value);
      else child.kill(value);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 250));
  // The group can still contain Electron after Forge has already exited.
  signal('SIGKILL');
}

/** Enforce a fixed process deadline, optionally separating startup and renderer work. */
export function waitForSmokeProcess(
  child,
  {
    logPath,
    timeoutMilliseconds,
    functionalTimeoutMilliseconds,
    pollMilliseconds = 100,
    processGroup = false,
  },
) {
  const diagnostics = createMacOSBundleDiagnostics(child.pid, logPath);
  return new Promise((resolve, reject) => {
    let settled = false;
    let phase = functionalTimeoutMilliseconds === undefined ? 'process' : 'startup';
    let lastProgress = 'No smoke log progress yet.';
    let timeout;
    let poll;
    let timedOut;
    let stopping = false;
    let processExit;

    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(poll);
      child.off('error', fail);
      child.off('exit', finish);
    };
    const settle = (error, terminationError) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Finish the already bounded sampling before the runner preserves/removes its files.
      void diagnostics.finish().then(() => {
        if (error !== undefined) {
          reject(
            terminationError === undefined
              ? error
              : new AggregateError(
                  [error, terminationError],
                  'Smoke failed during process cleanup.',
                ),
          );
          return;
        }
        resolve({
          exitCode: processExit?.code ?? (processExit?.signal === null ? 1 : 2),
          timedOut,
          lastProgress,
          ...(terminationError === undefined ? {} : { terminationError: String(terminationError) }),
        });
      });
    };
    const stop = async (error) => {
      if (settled || stopping) return;
      stopping = true;
      clearTimeout(timeout);
      clearTimeout(poll);
      let terminationError;
      try {
        await terminateProcessTree(child, processGroup);
      } catch (cleanupError) {
        terminationError = cleanupError;
      }
      // Never wait indefinitely for an exit event or an inherited pipe to close.
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.destroy();
      child.unref();
      settle(error, terminationError);
    };
    const fail = (error) => void stop(error);
    const finish = (code, signal) => {
      processExit = { code, signal };
      if (!stopping) settle();
    };
    const armDeadline = (milliseconds) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (settled) return;
        timedOut = { phase, milliseconds, lastProgress };
        void stop();
      }, milliseconds);
    };
    const inspectProgress = async () => {
      try {
        const log = await fs.readFile(logPath, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return '';
          throw error;
        });
        if (settled || stopping) return;
        diagnostics.inspect(log);
        const lines = log.trim().split(/\r?\n/u).filter(Boolean);
        lastProgress = lines.at(-1) ?? lastProgress;
        if (phase === 'startup' && log.includes('renderer loaded:')) {
          phase = 'functional';
          armDeadline(functionalTimeoutMilliseconds);
        }
        poll = setTimeout(() => void inspectProgress(), pollMilliseconds);
      } catch (error) {
        fail(error);
      }
    };

    child.once('error', fail);
    child.once('exit', finish);
    armDeadline(timeoutMilliseconds);
    void inspectProgress();
  });
}

/** Keep cold Forge startup separate from the actual renderer smoke budget. */
export function waitForDevelopmentSmoke(
  child,
  { startupTimeoutMilliseconds = 120_000, functionalTimeoutMilliseconds = 120_000, ...options },
) {
  return waitForSmokeProcess(child, {
    ...options,
    timeoutMilliseconds: startupTimeoutMilliseconds,
    functionalTimeoutMilliseconds,
  });
}
