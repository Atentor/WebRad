import { spawn } from 'node:child_process';
import path from 'node:path';

export interface NativeProcessOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly secrets?: readonly string[];
  readonly onLog?: (message: string, stream: 'stdout' | 'stderr') => void;
}
export interface NativeProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
export class NativeProcessError extends Error {
  constructor(
    message: string,
    readonly reason: 'failed' | 'cancelled' | 'timeout',
    readonly result?: NativeProcessResult,
  ) {
    super(message);
    this.name = 'NativeProcessError';
  }
}
export function redactNativeLog(value: string, secrets: readonly string[] = []): string {
  let result = value
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g'), '')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]');
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length))
    result = result.split(secret).join('[REDACTED]');
  return result;
}
export function nativeEnvironmentSecrets(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(
      ([key, value]) =>
        value && /password|passwd|secret|token|private|credential|keystore|api_key/i.test(key),
    )
    .flatMap(([, value]) => (value ?? '').split(/\r?\n/).filter(Boolean));
}
/** No shell expansion. Cancelling terminates Cargo, Rust, Gradle and their child processes. */
export function runNativeProcess(options: NativeProcessOptions): Promise<NativeProcessResult> {
  if (options.signal?.aborted)
    return Promise.reject(new NativeProcessError('Native build cancelled.', 'cancelled'));
  const env = options.env ?? process.env;
  const secrets = [...nativeEnvironmentSecrets(env), ...(options.secrets ?? [])];
  const clean = (value: string) => redactNativeLog(value, secrets);
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = { stdout: '', stderr: '' };
    const pending = { stdout: '', stderr: '' };
    const discarding = { stdout: false, stderr: false };
    let reason: 'cancelled' | 'timeout' | undefined;
    let spawnError: Error | undefined;
    const emit = (message: string, stream: 'stdout' | 'stderr') => {
      const safe = clean(message);
      output[stream] = `${output[stream]}${safe}\n`.slice(-1_048_576);
      options.onLog?.(safe, stream);
    };
    const receive = (value: string, stream: 'stdout' | 'stderr') => {
      pending[stream] += value;
      let newline: number;
      while ((newline = pending[stream].search(/[\r\n]/)) >= 0) {
        const line = pending[stream].slice(0, newline);
        pending[stream] = pending[stream].slice(newline + 1);
        if (!discarding[stream] && line.length > 0) emit(line, stream);
        discarding[stream] = false;
      }
      if (pending[stream].length > 65_536) {
        pending[stream] = '';
        discarding[stream] = true;
        emit('[Native tool emitted an oversized line; omitted.]', stream);
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (value: string) => receive(value, 'stdout'));
    child.stderr.on('data', (value: string) => receive(value, 'stderr'));
    const terminate = (nextReason: 'cancelled' | 'timeout') => {
      if (reason) return;
      reason = nextReason;
      if (child.pid === undefined) return;
      if (process.platform === 'win32') {
        const killer = spawn(
          path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
          ['/PID', String(child.pid), '/T', '/F'],
          { shell: false, windowsHide: true, stdio: 'ignore' },
        );
        killer.on('error', () => child.kill('SIGKILL'));
        killer.on('exit', (code) => {
          if (code !== 0) child.kill('SIGKILL');
        });
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    };
    const abort = () => terminate('cancelled');
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => terminate('timeout'), options.timeoutMs ?? 1_800_000);
    timer.unref();
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      for (const stream of ['stdout', 'stderr'] as const)
        if (pending[stream] && !discarding[stream]) emit(pending[stream], stream);
      const result = { exitCode: code ?? -1, ...output };
      if (reason)
        reject(
          new NativeProcessError(
            reason === 'cancelled'
              ? 'Native build cancelled.'
              : 'Native process exceeded its time limit.',
            reason,
            result,
          ),
        );
      else if (spawnError || code !== 0)
        reject(
          new NativeProcessError(
            clean(
              spawnError?.message ??
                `${path.basename(options.command)} exited with code ${code}: ${output.stderr.slice(-4000)}`,
            ),
            'failed',
            result,
          ),
        );
      else resolve(result);
    });
    if (options.signal?.aborted) abort();
  });
}
