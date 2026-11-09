import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import type { PackageToolchain } from '../shared/package-contracts';

export interface NpmToolchain extends PackageToolchain {
  readonly nodePath?: string;
  readonly npmCliPath?: string;
}
export function packageProcessEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(?:NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|npm_config_.*)$/i.test(key),
    ),
  );
}

export async function executeNpm(
  toolchain: NpmToolchain,
  args: readonly string[],
  rootPath: string,
  signal: AbortSignal,
  output: (stream: 'stdout' | 'stderr', message: string) => void,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (toolchain.nodePath === undefined || toolchain.npmCliPath === undefined)
    throw new Error(
      toolchain.message ?? 'Install Node.js and NPM, add them to PATH, and restart WebRAD.',
    );
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const logs = createPackageLogFilter(output);
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    const child = spawn(toolchain.nodePath!, [toolchain.npmCliPath!, ...args], {
      cwd: rootPath,
      shell: false,
      windowsHide: true,
      env: packageProcessEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const abort = (): void => {
      child.kill();
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => logs.write('stdout', stdoutDecoder.write(chunk)));
    child.stderr.on('data', (chunk: Buffer) => logs.write('stderr', stderrDecoder.write(chunk)));
    child.once('error', (error) => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('close', (code, exitSignal) => {
      logs.write('stdout', stdoutDecoder.end());
      logs.write('stderr', stderrDecoder.end());
      logs.flush();
      signal.removeEventListener('abort', abort);
      resolve({ code, signal: exitSignal });
    });
  });
}

let cached: Promise<NpmToolchain> | undefined;
export async function detectNpmToolchain(refresh = false): Promise<NpmToolchain> {
  if (refresh || cached === undefined) cached = inspectNpmToolchain();
  const inspection = cached;
  const result = await inspection;
  // A transient inspection failure must not poison later package operations.
  if (!result.available && cached === inspection) cached = undefined;
  return result;
}
async function inspectNpmToolchain(): Promise<NpmToolchain> {
  const bins = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const nodes: string[] = [];
  const npmCandidates: string[] = [];
  for (const bin of bins) {
    nodes.push(path.join(bin, process.platform === 'win32' ? 'node.exe' : 'node'));
    npmCandidates.push(
      path.join(bin, 'node_modules/npm/bin/npm-cli.js'),
      path.resolve(bin, '../lib/node_modules/npm/bin/npm-cli.js'),
    );
    try {
      npmCandidates.push(await fs.realpath(path.join(bin, 'npm')));
    } catch {
      /* Try the next installed toolchain. */
    }
  }
  const find = async (
    candidates: readonly string[],
    executable: boolean,
  ): Promise<string | undefined> => {
    for (const candidate of candidates) {
      try {
        if (executable || candidate.endsWith('npm-cli.js')) {
          await fs.access(candidate);
          if ((await fs.stat(candidate)).isFile()) return candidate;
        }
      } catch {
        /* PATH entries may be absent or inaccessible. */
      }
    }
    return undefined;
  };
  const [nodePath, npmCliPath] = await Promise.all([find(nodes, true), find(npmCandidates, false)]);
  if (nodePath === undefined || npmCliPath === undefined)
    return {
      available: false,
      message:
        'Install Node.js with NPM, ensure node and npm are on PATH, and restart WebRAD. The packaged IDE does not include an NPM toolchain.',
    };
  const inspect = (args: readonly string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn(nodePath, args, {
        shell: false,
        windowsHide: true,
        env: packageProcessEnvironment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error('Node.js detection timed out after 5000ms. Check the installed toolchain.'),
        );
      }, 5000);
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output = `${output}${chunk.toString('utf8')}`.slice(-8192);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(output.trim());
        else reject(new Error(`Node.js/NPM inspection exited with code ${String(code)}.`));
      });
    });
  try {
    // npm --version loads the full CLI and workspace configuration. Its own
    // version comes from this manifest; read it without starting that machinery.
    const [nodeVersion, npmManifestText] = await Promise.all([
      inspect(['--version']),
      fs.readFile(path.resolve(path.dirname(npmCliPath), '..', 'package.json'), 'utf8'),
    ]);
    const npmManifest: unknown = JSON.parse(npmManifestText);
    if (
      typeof npmManifest !== 'object' ||
      npmManifest === null ||
      !('name' in npmManifest) ||
      npmManifest.name !== 'npm' ||
      !('version' in npmManifest) ||
      typeof npmManifest.version !== 'string'
    )
      throw new Error('The selected NPM CLI does not have a valid npm package manifest.');
    const npmVersion = npmManifest.version;
    const nodeMajor = Number(/^v?(\d+)\./.exec(nodeVersion)?.[1] ?? 0);
    const npmMajor = Number(/^(\d+)\./.exec(npmVersion)?.[1] ?? 0);
    if (nodeMajor < 20 || npmMajor < 10)
      return {
        available: false,
        nodeVersion,
        npmVersion,
        message:
          'Project packages require Node.js 20 or newer and NPM 10 or newer. Update the external toolchain and restart WebRAD.',
      };
    return { available: true, nodeVersion, npmVersion, nodePath, npmCliPath };
  } catch (error) {
    return { available: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Registry and npm logs can contain credentials; never forward them verbatim. */
export function redactPackageLog(text: string): string {
  return text
    .replace(/(?:https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, 'https://[redacted]@')
    .replace(/(authorization\s*[=:]\s*)(?:bearer\s+|basic\s+)?[^\s]+/gi, '$1[redacted]')
    .replace(
      /((?:_authToken|_auth|authorization|password|token)\s*[=:]\s*)[^\s]+/gi,
      '$1[redacted]',
    )
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, '[redacted]');
}

/** Redact complete lines so credentials split between process chunks stay private. */
export function createPackageLogFilter(
  output: (stream: 'stdout' | 'stderr', message: string) => void,
): {
  readonly write: (stream: 'stdout' | 'stderr', chunk: string) => void;
  readonly flush: () => void;
} {
  const states = {
    stdout: { pending: '', discarding: false },
    stderr: { pending: '', discarding: false },
  };
  const limit = 65_536;
  return {
    write: (stream, chunk) => {
      const state = states[stream];
      let remaining = chunk;
      if (state.discarding) {
        const end = remaining.search(/[\r\n]/);
        if (end === -1) return;
        remaining = remaining.slice(end + 1);
        state.discarding = false;
      }
      state.pending += remaining;
      let end = state.pending.search(/[\r\n]/);
      while (end !== -1) {
        const line = state.pending.slice(0, end);
        output(
          stream,
          line.length > limit ? '[Long package log line omitted]\n' : `${redactPackageLog(line)}\n`,
        );
        state.pending = state.pending.slice(end + 1);
        end = state.pending.search(/[\r\n]/);
      }
      if (state.pending.length > limit) {
        state.pending = '';
        state.discarding = true;
        output(stream, '[Long package log line omitted]\n');
      }
    },
    flush: () => {
      for (const stream of ['stdout', 'stderr'] as const) {
        const state = states[stream];
        if (state.pending) output(stream, redactPackageLog(state.pending));
        state.pending = '';
        state.discarding = false;
      }
    },
  };
}
