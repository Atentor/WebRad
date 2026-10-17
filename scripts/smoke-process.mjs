import { promises as fs } from 'node:fs';
import { clearTimeout, setTimeout } from 'node:timers';

/** Keep cold Forge startup separate from the actual renderer smoke budget. */
export function waitForDevelopmentSmoke(
  child,
  {
    logPath,
    startupTimeoutMilliseconds = 120_000,
    functionalTimeoutMilliseconds = 120_000,
    pollMilliseconds = 100,
  },
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let phase = 'startup';
    let lastProgress = 'No smoke log progress yet.';
    let timeout;
    let poll;
    let timedOut;

    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(poll);
      child.off('error', fail);
      child.off('exit', finish);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill();
      reject(error);
    };
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        exitCode: code ?? (signal === null ? 1 : 2),
        timedOut,
        lastProgress,
      });
    };
    const armDeadline = (milliseconds) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (settled) return;
        timedOut = { phase, milliseconds, lastProgress };
        child.kill();
      }, milliseconds);
    };
    const inspectProgress = async () => {
      try {
        const log = await fs.readFile(logPath, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return '';
          throw error;
        });
        if (settled || timedOut !== undefined) return;
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
    armDeadline(startupTimeoutMilliseconds);
    void inspectProgress();
  });
}
