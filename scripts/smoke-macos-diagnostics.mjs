import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function execute(file, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function captureProcesses(rootPid, directory) {
  const listing = await execute('/bin/ps', ['-axo', 'pid=,ppid=,stat=,pcpu=,rss=,comm='], 2000);
  const processes = listing.split('\n').flatMap((line) => {
    const fields = /^\s*(\d+)\s+(\d+)\s+\S+\s+[\d.,]+\s+\d+\s+(.+)$/u.exec(line);
    return fields
      ? [{ pid: Number(fields[1]), parent: Number(fields[2]), command: fields[3], line }]
      : [];
  });
  // Inspect only this runner's live child tree, never unrelated applications.
  if (!processes.some((entry) => entry.pid === rootPid)) return;
  const owned = new Set([rootPid]);
  for (;;) {
    const previousSize = owned.size;
    for (const entry of processes) if (owned.has(entry.parent)) owned.add(entry.pid);
    if (owned.size === previousSize) break;
  }
  const descendants = processes.filter((entry) => owned.has(entry.pid));
  await fs.writeFile(
    path.join(directory, 'processes.txt'),
    'PID PPID STATE CPU_PERCENT RSS_KIB EXECUTABLE\n' +
      descendants.map((entry) => entry.line).join('\n') +
      '\n',
  );
  const browser =
    descendants.find((entry) => {
      const name = path.basename(entry.command);
      return name === 'Electron' || name === 'WebRad';
    }) ?? descendants.find((entry) => entry.pid === rootPid);
  const native = descendants.filter((entry) => path.basename(entry.command) === 'esbuild');
  const targets = [...(browser ? [{ ...browser, role: 'main' }] : [])];
  for (const entry of native) targets.push({ ...entry, role: 'esbuild' });
  await Promise.allSettled(
    targets.map(async (entry) => {
      const file = path.join(directory, `${entry.role}-${entry.pid}.sample.txt`);
      try {
        // Symbolication can outlive the sampled process. Keep its symbols and
        // let report generation finish after failure without extending the smoke.
        await execute(
          '/usr/bin/sample',
          [String(entry.pid), '1', '1', '-mayDie', '-file', file],
          30000,
        );
      } catch (error) {
        await fs.writeFile(`${file}.error.txt`, String(error) + '\n');
      }
    }),
  );
}

/** Observe stalled native work from the runner, even when Electron's event loop is blocked. */
export function createMacOSBundleDiagnostics(rootPid, logPath) {
  let capturedPhase;
  let pending;
  let sequence = 0;
  return {
    inspect(log) {
      if (process.platform !== 'darwin' || !Number.isSafeInteger(rootPid) || rootPid <= 0) return;
      if (pending) return;
      const phase = log
        .split(/\r?\n/u)
        .filter((line) => line.includes('[COMPILER] Preview ') && line.includes(' started ('))
        .at(-1);
      if (!phase?.includes('; bundle-build started (') || phase === capturedPhase) return;
      const started = Date.parse(phase.slice(0, 24));
      if (!Number.isFinite(started) || Date.now() - started < 3000) return;
      capturedPhase = phase;
      sequence += 1;
      const directory = path.join(
        path.dirname(logPath),
        'native-diagnostics',
        `bundle-${sequence}`,
      );
      pending = (async () => {
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'phase.txt'), phase + '\n');
        await captureProcesses(rootPid, directory);
      })()
        .catch(async (error) => {
          // Diagnostics must preserve the original smoke result, including if sampling fails.
          await fs
            .writeFile(path.join(directory, 'capture-error.txt'), String(error) + '\n')
            .catch(() => undefined);
        })
        .finally(() => {
          pending = undefined;
        });
    },
    async finish() {
      await pending;
    },
  };
}
