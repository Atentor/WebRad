import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { waitForDevelopmentSmoke } from '../../scripts/smoke-process.mjs';

const scenario = process.argv[2];
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'webrad-smoke-process-')));
const logPath = path.join(root, 'progress.log');
const startupTimeoutMilliseconds = scenario === 'descendant-stall' ? 3_000 : 1_000;
const functionalTimeoutMilliseconds = scenario === 'separate-budgets' ? 800 : 250;
const childScript = `
  const fs = require('node:fs');
  const logPath = process.argv[1];
  const scenario = process.argv[2];
  const progress = (value) => fs.appendFileSync(logPath, value + '\\n');
  if (scenario === 'startup-stall') {
    progress('compiler passed: cold startup stalled');
    setInterval(() => {}, 1000);
  } else if (scenario === 'functional-stall') {
    progress('renderer loaded: http://localhost/');
    progress('renderer fixture interaction started');
    setInterval(() => {}, 1000);
  } else if (scenario === 'separate-budgets') {
    setTimeout(() => {
      progress('renderer loaded: http://localhost/');
      setTimeout(() => { progress('renderer all assertions passed'); process.exit(0); }, 500);
    }, 500);
  } else if (scenario === 'nonzero-exit') {
    progress('renderer loaded: http://localhost/');
    process.exit(37);
  } else if (scenario === 'descendant-stall') {
    const path = require('node:path');
    const { spawn } = require('node:child_process');
    const root = path.dirname(logPath);
    const descendantScript = [
      "const fs = require('node:fs');",
      "process.on('SIGTERM', () => {});",
      "process.stdout.on('error', () => {});",
      "fs.writeFileSync(process.argv[1], 'ready');",
      "fs.writeFileSync(process.argv[2], String(Date.now()));",
      "setInterval(() => { fs.writeFileSync(process.argv[2], String(Date.now())); process.stdout.write('descendant heartbeat\\\\n'); }, 50);",
    ].join('');
    const descendant = spawn(process.execPath, ['-e', descendantScript, path.join(root, 'descendant-ready'), path.join(root, 'descendant-heartbeat')], { stdio: 'inherit' });
    fs.writeFileSync(path.join(root, 'descendant-pid'), String(descendant.pid));
    process.on('SIGTERM', () => {});
    const ready = setInterval(() => {
      if (!fs.existsSync(path.join(root, 'descendant-ready'))) return;
      clearInterval(ready);
      progress('renderer loaded: http://localhost/');
      progress('renderer descendant fixture started');
    }, 5);
  } else {
    process.exit(99);
  }
`;

let bystander;
let child;
try {
  if (scenario === 'descendant-stall') {
    bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  child = spawn(process.execPath, ['-e', childScript, logPath, scenario], {
    stdio: scenario === 'descendant-stall' ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const closed = new Promise((resolve) => child.once('close', resolve));
  const started = performance.now();
  const result = await waitForDevelopmentSmoke(child, {
    logPath,
    startupTimeoutMilliseconds,
    functionalTimeoutMilliseconds,
    pollMilliseconds: 10,
    processGroup: process.platform !== 'win32',
  });
  const descendantClosed =
    scenario === 'descendant-stall'
      ? await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(false), 2_000);
          void closed.then(() => {
            clearTimeout(timeout);
            resolve(true);
          });
        })
      : undefined;
  let descendantStopped;
  if (scenario === 'descendant-stall') {
    const heartbeatPath = path.join(root, 'descendant-heartbeat');
    const before = await fs.readFile(heartbeatPath, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 250));
    descendantStopped = before === (await fs.readFile(heartbeatPath, 'utf8'));
  }
  process.stdout.write(
    JSON.stringify({
      ...result,
      elapsedMilliseconds: performance.now() - started,
      ...(descendantClosed === undefined
        ? {}
        : { descendantClosed, descendantStopped, bystanderAlive: bystander.exitCode === null }),
    }),
  );
} finally {
  const descendantPid = Number(
    await fs.readFile(path.join(root, 'descendant-pid'), 'utf8').catch(() => '0'),
  );
  if (Number.isSafeInteger(descendantPid) && descendantPid > 0) {
    try {
      process.kill(descendantPid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        process.stderr.write(`Could not clean up the fixture descendant: ${error}\n`);
        process.exitCode = 1;
      }
    }
  }
  if (bystander !== undefined) {
    const closed = new Promise((resolve) => bystander.once('close', resolve));
    bystander.kill('SIGKILL');
    await closed;
  }
  if (child !== undefined && child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
  await fs.rm(root, { recursive: true, force: true });
}
